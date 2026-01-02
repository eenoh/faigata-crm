// src/app/api/billing/prices/[priceId]/archive/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ priceId: string }> }
) {
  // ✅ Next.js dynamic params are async in newer versions
  const { priceId } = await ctx.params;
  const pid = String(priceId ?? "").trim();
  if (!pid) return NextResponse.json({ error: "missing_price_id" }, { status: 400 });

  // Auth
  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = adminClient();

  // Load price row first (we need product_id for activity and to ensure it belongs to org)
  const { data: priceRow, error: priceRowErr } = await sb
    .from("organization_stripe_prices")
    .select("stripe_price_id, stripe_product_id, stripe_active")
    .eq("org_id", billingCtx.orgId)
    .eq("livemode", billingCtx.livemode)
    .eq("stripe_price_id", pid)
    .maybeSingle();

  if (priceRowErr) {
    return NextResponse.json(
      { error: "db_error", details: priceRowErr },
      { status: 500 }
    );
  }

  if (!priceRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Stripe: archive (deactivate) on connected account
  try {
    const stripe = stripeClient(billingCtx.livemode);

    const updated = await stripe.prices.update(
      pid,
      { active: false },
      { stripeAccount: billingCtx.stripeAccountId }
    );

    // DB: mirror state
    const { error: updErr } = await sb
      .from("organization_stripe_prices")
      .update({
        stripe_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", billingCtx.orgId)
      .eq("livemode", billingCtx.livemode)
      .eq("stripe_price_id", pid);

    if (updErr) {
      return NextResponse.json(
        { error: "db_update_failed", details: updErr },
        { status: 500 }
      );
    }

    // Activity log (optional but useful)
    const { error: actErr } = await sb
      .from("organization_stripe_catalog_activity")
      .insert({
        org_id: billingCtx.orgId,
        livemode: billingCtx.livemode,
        stripe_product_id: priceRow.stripe_product_id ?? null,
        stripe_price_id: pid,
        actor_user_id: billingCtx.userId ?? null,
        type: "price_archived",
        payload: { stripe_active: updated.active },
      });

    // Don’t fail the request just because logging failed
    void actErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "stripe_update_failed",
        message: String(e?.message ?? e),
      },
      { status: 500 }
    );
  }
}
