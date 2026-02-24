import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";

export const runtime = "nodejs";

const ok = () => NextResponse.json({ ok: true });
const err = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const pickLivemode = (event: Stripe.Event, orgAcct: any) =>
  typeof (event as any).livemode === "boolean"
    ? Boolean((event as any).livemode)
    : Boolean(orgAcct?.livemode);

const pickProductId = (pr: Stripe.Price) =>
  typeof pr.product === "string"
    ? pr.product
    : ((pr.product as any)?.id ?? null);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return err("missing_webhook_secret", 500);

  const sig = req.headers.get("stripe-signature");
  if (!sig) return err("missing_signature", 400);

  const raw = Buffer.from(await req.arrayBuffer());

  // Stripe key doesn't need to match livemode for signature verification;
  // we just need a Stripe instance to call constructEvent.
  const stripeForWebhook = stripeClient(false);

  let event: Stripe.Event;
  try {
    event = stripeForWebhook.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return err("invalid_signature", 400);
  }

  // Connected account id (critical). If missing, acknowledge.
  const acct = (event as any).account as string | undefined;
  if (!acct) return ok();

  const sb = adminClient();

  // Resolve org by connected account
  const { data: orgAcct } = await sb
    .from("organization_stripe_accounts")
    .select("org_id, livemode, stripe_account_id")
    .eq("stripe_account_id", acct)
    .maybeSingle();

  const orgId = orgAcct?.org_id as string | undefined;
  if (!orgId) return ok();

  const livemode = pickLivemode(event, orgAcct);
  const nowIso = new Date().toISOString();
  const obj: any = event.data.object;

  if (event.type.startsWith("product.")) {
    const p = obj as Stripe.Product;

    await sb.from("organization_stripe_products").upsert(
      {
        org_id: orgId,
        livemode,
        stripe_product_id: p.id,
        stripe_name: p.name ?? null,
        stripe_description: p.description ?? null,
        stripe_active: Boolean(p.active),
        stripe_created: typeof p.created === "number" ? p.created : null,
        updated_at: nowIso,
      },
      { onConflict: "org_id,livemode,stripe_product_id" },
    );

    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: orgId,
      livemode,
      stripe_product_id: p.id,
      actor_user_id: null,
      type: `webhook_${event.type.replace(".", "_")}`,
      payload: { id: p.id, name: p.name, active: p.active },
    });

    return ok();
  }

  if (event.type.startsWith("price.")) {
    const pr = obj as Stripe.Price;
    const productId = pickProductId(pr);

    await sb.from("organization_stripe_prices").upsert(
      {
        org_id: orgId,
        livemode,
        stripe_price_id: pr.id,
        stripe_product_id: productId,
        stripe_active: Boolean(pr.active),
        stripe_created: typeof pr.created === "number" ? pr.created : null,
        currency: pr.currency ?? null,
        unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
        price_type: pr.type ?? null,
        interval: pr.recurring?.interval ?? null,
        interval_count: pr.recurring?.interval_count ?? null,
        updated_at: nowIso,
      },
      { onConflict: "org_id,livemode,stripe_price_id" },
    );

    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: orgId,
      livemode,
      stripe_product_id: productId,
      stripe_price_id: pr.id,
      actor_user_id: null,
      type: `webhook_${event.type.replace(".", "_")}`,
      payload: { id: pr.id, active: pr.active, product: productId },
    });

    return ok();
  }

  return ok();
}
