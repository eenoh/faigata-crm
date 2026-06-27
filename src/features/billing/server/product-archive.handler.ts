import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import { logCatalogActivitySafe } from "@/features/billing/server/catalog";
import { billingContextErrorResponse } from "@/features/billing/server/http";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ productId: string }> };

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isStripeProductId(id: string) {
  return /^prod_[A-Za-z0-9]+$/.test(id);
}

export async function POST(request: Request, context: RouteCtx) {
  const { productId: rawProductId } = await context.params;
  const productId = safeDecode(String(rawProductId ?? "")).trim();
  const loweredProductId = productId.toLowerCase();

  if (!productId || loweredProductId === "undefined" || loweredProductId === "null") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  if (!isStripeProductId(productId)) {
    return NextResponse.json(
      {
        error: "invalid_product_id",
        hint: "Expected Stripe Product ID like prod_123...",
        received: productId,
      },
      { status: 400 },
    );
  }

  const billing = await getAuthedBillingContextWithReason(request);
  if (!billing.ok) {
    return billingContextErrorResponse(billing);
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: productRow, error: lookupError } = await supabase
      .from("organization_stripe_products")
      .select("stripe_product_id")
      .eq("org_id", billing.ctx.orgId)
      .eq("livemode", billing.ctx.livemode)
      .eq("stripe_product_id", productId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "db_error", detail: lookupError.message },
        { status: 500 },
      );
    }

    if (!productRow) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const stripe = getStripeClientForLivemode(billing.ctx.livemode);
    const updated = await stripe.products.update(
      productId,
      { active: false },
      { stripeAccount: billing.ctx.stripeAccountId },
    );

    const { error: updateError } = await supabase
      .from("organization_stripe_products")
      .update({
        stripe_active: false,
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", billing.ctx.orgId)
      .eq("livemode", billing.ctx.livemode)
      .eq("stripe_product_id", productId);

    if (updateError) {
      return NextResponse.json(
        { error: "db_update_failed", detail: updateError.message },
        { status: 500 },
      );
    }

    await logCatalogActivitySafe({
      orgId: billing.ctx.orgId,
      livemode: billing.ctx.livemode,
      stripeProductId: productId,
      actorUserId: billing.ctx.userId,
      type: "product_archived",
      payload: { stripe_active: updated.active },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "stripe_update_failed",
        message: String(error?.message ?? error),
      },
      { status: 500 },
    );
  }
}
