// src/app/api/billing/products/[productId]/archive/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ productId: string }> }
) {
  // ✅ Next.js: params is a Promise
  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();

  if (!pid) {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = adminClient();

  // Optional safety: verify product belongs to org (prevents cross-org updates)
  const { data: productRow, error: prodLookupErr } = await sb
    .from("organization_stripe_products")
    .select("stripe_product_id")
    .eq("org_id", billingCtx.orgId)
    .eq("livemode", billingCtx.livemode)
    .eq("stripe_product_id", pid)
    .maybeSingle();

  if (prodLookupErr) {
    return NextResponse.json(
      { error: "db_error", details: prodLookupErr },
      { status: 500 }
    );
  }

  if (!productRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    // ✅ stripeClient requires livemode
    const stripe = stripeClient(billingCtx.livemode);

    // ✅ Archive in Stripe (connected account)
    const updated = await stripe.products.update(
      pid,
      { active: false },
      { stripeAccount: billingCtx.stripeAccountId }
    );

    // ✅ Mirror to DB
    const { error: updErr } = await sb
      .from("organization_stripe_products")
      .update({
        stripe_active: false,
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", billingCtx.orgId)
      .eq("livemode", billingCtx.livemode)
      .eq("stripe_product_id", pid);

    if (updErr) {
      return NextResponse.json(
        { error: "db_update_failed", details: updErr },
        { status: 500 }
      );
    }

    // ✅ Activity log (best-effort; don’t fail request if this insert fails)
    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: billingCtx.orgId,
      livemode: billingCtx.livemode,
      stripe_product_id: pid,
      stripe_price_id: null,
      actor_user_id: billingCtx.userId ?? null,
      type: "product_archived",
      payload: { stripe_active: updated.active },
      created_at: new Date().toISOString(),
    });

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
