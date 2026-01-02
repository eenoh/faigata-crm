// src/app/api/billing/products/[productId]/prices/create/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

type RecurringInput =
  | {
      interval?: unknown;
      interval_count?: unknown;
    }
  | null
  | undefined;

function normalizeCurrency(v: unknown) {
  const s = String(v ?? "usd").trim().toLowerCase();
  return s || "usd";
}

function normalizeUnitAmount(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function isStripeInterval(
  v: string
): v is Stripe.PriceCreateParams.Recurring.Interval {
  return v === "day" || v === "week" || v === "month" || v === "year";
}

function normalizeRecurring(
  raw: RecurringInput
): Stripe.PriceCreateParams.Recurring | undefined {
  if (!raw) return undefined;

  const intervalRaw = String(raw.interval ?? "").trim().toLowerCase();
  if (!intervalRaw) return undefined;

  if (!isStripeInterval(intervalRaw)) {
    throw new Error("invalid_interval");
  }

  const countRaw = Number(raw.interval_count ?? 1);
  const interval_count =
    Number.isFinite(countRaw) && countRaw >= 1 ? Math.floor(countRaw) : 1;

  return { interval: intervalRaw, interval_count };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ productId: string }> }
) {
  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ✅ Next.js: params is Promise in your setup
  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();
  if (!pid) {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any | null;

  const currency = normalizeCurrency(body?.currency);
  const unit_amount = normalizeUnitAmount(body?.unit_amount);

  if (!currency) {
    return NextResponse.json({ error: "missing_currency" }, { status: 400 });
  }
  if (unit_amount == null) {
    return NextResponse.json({ error: "invalid_unit_amount" }, { status: 400 });
  }

  let recurring: Stripe.PriceCreateParams.Recurring | undefined;
  try {
    recurring = normalizeRecurring(body?.recurring as RecurringInput);
  } catch (e: any) {
    if (String(e?.message) === "invalid_interval") {
      return NextResponse.json(
        { error: "invalid_interval", allowed: ["day", "week", "month", "year"] },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "invalid_recurring" }, { status: 400 });
  }

  // ✅ FIX: stripeClient requires livemode argument
  const stripe = stripeClient(billingCtx.livemode);
  const sb = adminClient();

  // ✅ Build typed params so TS enforces Stripe union types
  const createParams: Stripe.PriceCreateParams = {
    product: pid,
    currency,
    unit_amount,
    ...(recurring ? { recurring } : {}),
  };

  const price = await stripe.prices.create(createParams, {
    stripeAccount: billingCtx.stripeAccountId,
  });

  const { error: upsertErr } = await sb.from("organization_stripe_prices").upsert(
    {
      org_id: billingCtx.orgId,
      livemode: billingCtx.livemode,
      stripe_price_id: price.id,
      stripe_product_id: pid,
      stripe_active: !!price.active,
      stripe_created: typeof price.created === "number" ? price.created : null,
      currency: price.currency ?? null,
      unit_amount: typeof price.unit_amount === "number" ? price.unit_amount : null,
      price_type: price.type ?? null,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,livemode,stripe_price_id" }
  );

  if (upsertErr) {
    return NextResponse.json(
      { error: "db_upsert_failed", details: upsertErr },
      { status: 500 }
    );
  }

  // Best-effort activity log
  await sb.from("organization_stripe_catalog_activity").insert({
    org_id: billingCtx.orgId,
    livemode: billingCtx.livemode,
    stripe_product_id: pid,
    stripe_price_id: price.id,
    actor_user_id: billingCtx.userId ?? null,
    type: "price_created",
    payload: {
      currency,
      unit_amount: price.unit_amount,
      recurring: price.recurring ?? null,
    },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, stripe_price_id: price.id });
}
