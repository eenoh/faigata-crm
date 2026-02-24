// src/app/api/billing/products/[productId]/prices/create/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * If true: request fails when DB persistence fails.
 * If false: Stripe price creation succeeds even if DB persistence fails.
 */
const STRICT_DB = true;

type RouteCtx = { params: Promise<{ productId: string }> };

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function isStripeProductId(id: string) {
  return /^prod_[A-Za-z0-9]+$/.test(id);
}

function normalizeCurrency(v: unknown) {
  const s = String(v ?? "usd")
    .trim()
    .toLowerCase();
  return s || "usd";
}

function normalizeUnitAmount(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function isStripeInterval(
  v: string,
): v is Stripe.PriceCreateParams.Recurring.Interval {
  return v === "day" || v === "week" || v === "month" || v === "year";
}

function normalizeRecurring(
  raw: any,
): Stripe.PriceCreateParams.Recurring | undefined {
  if (!raw) return undefined;

  const intervalRaw = String(raw.interval ?? "")
    .trim()
    .toLowerCase();
  if (!intervalRaw) return undefined;
  if (!isStripeInterval(intervalRaw)) throw new Error("invalid_interval");

  const countRaw = Number(raw.interval_count ?? 1);
  const interval_count =
    Number.isFinite(countRaw) && countRaw >= 1 ? Math.floor(countRaw) : 1;

  return { interval: intervalRaw, interval_count };
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  // ✅ auth + billing context
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const { orgId, livemode, stripeAccountId, userId } = auth.ctx;

  // ✅ Next: params is Promise in your build
  const { productId: raw } = await ctx.params;
  const pid = safeDecode(String(raw ?? "")).trim();
  const lower = pid.toLowerCase();

  if (!pid || lower === "undefined" || lower === "null") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  // Optional but very helpful guard
  if (!isStripeProductId(pid)) {
    return NextResponse.json(
      {
        error: "invalid_product_id",
        hint: "Expected Stripe Product ID like prod_123...",
        received: pid,
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}) as any);

  const currency = normalizeCurrency(body?.currency);
  const unit_amount = normalizeUnitAmount(body?.unit_amount);

  if (!currency)
    return NextResponse.json({ error: "missing_currency" }, { status: 400 });
  if (unit_amount == null)
    return NextResponse.json({ error: "invalid_unit_amount" }, { status: 400 });

  let recurring: Stripe.PriceCreateParams.Recurring | undefined;
  try {
    recurring = normalizeRecurring(body?.recurring);
  } catch (e: any) {
    if (String(e?.message ?? "") === "invalid_interval") {
      return NextResponse.json(
        {
          error: "invalid_interval",
          allowed: ["day", "week", "month", "year"],
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "invalid_recurring" }, { status: 400 });
  }

  const stripe = stripeClient(livemode);
  const sb = adminClient();

  try {
    // 1) Create price in Stripe (connected account)
    const price = await stripe.prices.create(
      {
        product: pid,
        currency,
        unit_amount,
        ...(recurring ? { recurring } : {}),
      },
      { stripeAccount: stripeAccountId },
    );

    // 2) Persist snapshot in DB
    const row = {
      org_id: orgId,
      livemode,
      stripe_price_id: price.id,
      stripe_product_id: pid,
      stripe_active: !!price.active,
      stripe_created: typeof price.created === "number" ? price.created : null,
      currency: price.currency ?? null,
      unit_amount:
        typeof price.unit_amount === "number" ? price.unit_amount : null,
      price_type: (price as any).type ?? null,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await sb
      .from("organization_stripe_prices")
      .upsert(row, { onConflict: "org_id,livemode,stripe_price_id" });

    if (upsertErr) {
      const payload = {
        error: "db_upsert_failed",
        message:
          "Failed to persist price snapshot in organization_stripe_prices.",
        stripe_price_id: price.id,
        details: {
          code: (upsertErr as any)?.code ?? null,
          message: upsertErr.message ?? null,
          details: (upsertErr as any)?.details ?? null,
          hint: (upsertErr as any)?.hint ?? null,
        },
      };

      if (STRICT_DB) return NextResponse.json(payload, { status: 500 });

      // Non-strict mode: still return Stripe success
      return NextResponse.json(
        { ok: true, stripe_price_id: price.id, warning: payload },
        { status: 200 },
      );
    }

    // 3) Best-effort activity log (never fail the request)
    try {
      await sb.from("organization_stripe_catalog_activity").insert({
        org_id: orgId,
        livemode,
        stripe_product_id: pid,
        stripe_price_id: price.id,
        actor_user_id: userId ?? null,
        type: "price_created",
        payload: {
          currency: price.currency ?? currency,
          unit_amount: price.unit_amount ?? unit_amount,
          recurring: price.recurring ?? null,
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore logging failures
    }

    return NextResponse.json({ ok: true, stripe_price_id: price.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_price_create_failed", message: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
