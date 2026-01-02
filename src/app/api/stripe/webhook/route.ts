import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "missing_webhook_secret" }, { status: 500 });

  const stripe = stripeClient();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // connected account id (critical)
  const acct = (event as any).account as string | undefined;
  if (!acct) return NextResponse.json({ ok: true });

  const sb = adminClient();

  // resolve org by connected account
  const { data: orgAcct } = await sb
    .from("organization_stripe_accounts")
    .select("org_id, livemode, stripe_account_id")
    .eq("stripe_account_id", acct)
    .maybeSingle();

  if (!orgAcct?.org_id) return NextResponse.json({ ok: true });

  const orgId = orgAcct.org_id as string;
  const livemode = !!orgAcct.livemode;

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
        stripe_active: !!p.active,
        stripe_created: typeof p.created === "number" ? p.created : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,livemode,stripe_product_id" }
    );

    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: orgId,
      livemode,
      stripe_product_id: p.id,
      actor_user_id: null,
      type: `webhook_${event.type.replace(".", "_")}`,
      payload: { id: p.id, name: p.name, active: p.active },
    });
  }

  if (event.type.startsWith("price.")) {
    const pr = obj as Stripe.Price;
    const productId = typeof pr.product === "string" ? pr.product : pr.product?.id ?? null;

    await sb.from("organization_stripe_prices").upsert(
      {
        org_id: orgId,
        livemode,
        stripe_price_id: pr.id,
        stripe_product_id: productId,
        stripe_active: !!pr.active,
        stripe_created: typeof pr.created === "number" ? pr.created : null,
        currency: pr.currency ?? null,
        unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
        price_type: pr.type ?? null,
        interval: pr.recurring?.interval ?? null,
        interval_count: pr.recurring?.interval_count ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,livemode,stripe_price_id" }
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
  }

  return NextResponse.json({ ok: true });
}
