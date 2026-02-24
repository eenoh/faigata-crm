// src/app/api/billing/prices/[priceId]/archive/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ priceId: string }> };

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function isStripePriceId(id: string) {
  return /^price_[A-Za-z0-9]+$/.test(id);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { priceId: raw } = await ctx.params; // Next: params is Promise
  const pid = safeDecode(String(raw ?? "")).trim();

  const lower = pid.toLowerCase();

  if (!pid || lower === "undefined" || lower === "null") {
    return NextResponse.json({ error: "missing_price_id" }, { status: 400 });
  }

  // Optional but very helpful guard (avoids calling Stripe with garbage)
  if (!isStripePriceId(pid)) {
    return NextResponse.json(
      {
        error: "invalid_price_id",
        hint: "Expected Stripe Price ID like price_123...",
        received: pid,
      },
      { status: 400 },
    );
  }

  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = adminClient();

  // Ensure the price belongs to this org/livemode and grab product_id for activity logging
  const { data: priceRow, error: priceRowErr } = await sb
    .from("organization_stripe_prices")
    .select("stripe_product_id")
    .eq("org_id", billingCtx.orgId)
    .eq("livemode", billingCtx.livemode)
    .eq("stripe_price_id", pid)
    .maybeSingle();

  if (priceRowErr) {
    return NextResponse.json(
      { error: "db_error", detail: priceRowErr.message },
      { status: 500 },
    );
  }
  if (!priceRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const stripe = stripeClient(billingCtx.livemode);

    // Stripe: deactivate the price on the connected account
    const updated = await stripe.prices.update(
      pid,
      { active: false },
      { stripeAccount: billingCtx.stripeAccountId },
    );

    // DB: mirror state
    const { error: updErr } = await sb
      .from("organization_stripe_prices")
      .update({ stripe_active: false, updated_at: new Date().toISOString() })
      .eq("org_id", billingCtx.orgId)
      .eq("livemode", billingCtx.livemode)
      .eq("stripe_price_id", pid);

    if (updErr) {
      return NextResponse.json(
        { error: "db_update_failed", detail: updErr.message },
        { status: 500 },
      );
    }

    // Activity log: best-effort (never fail the request if this insert fails)
    // NOTE: Supabase returns a PromiseLike, which doesn't have .catch() in TS types.
    try {
      await sb.from("organization_stripe_catalog_activity").insert({
        org_id: billingCtx.orgId,
        livemode: billingCtx.livemode,
        stripe_product_id: priceRow.stripe_product_id ?? null,
        stripe_price_id: pid,
        actor_user_id: billingCtx.userId ?? null,
        type: "price_archived",
        payload: { stripe_active: updated.active },
      });
    } catch {
      // intentionally ignore activity logging failures
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_update_failed", message: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
