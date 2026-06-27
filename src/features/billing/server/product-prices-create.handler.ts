import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import { getStripeProductId, logCatalogActivitySafe } from "@/features/billing/server/catalog";
import { billingContextErrorResponse } from "@/features/billing/server/http";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRICT_DB = true;

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

function normalizeCurrency(value: unknown) {
  const normalized = String(value ?? "usd").trim().toLowerCase();
  return normalized || "usd";
}

function normalizeUnitAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount);
}

function isStripeInterval(
  value: string,
): value is Stripe.PriceCreateParams.Recurring.Interval {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function normalizeRecurring(
  raw: Record<string, unknown> | null | undefined,
): Stripe.PriceCreateParams.Recurring | undefined {
  if (!raw) return undefined;

  const intervalRaw = String(raw.interval ?? "").trim().toLowerCase();
  if (!intervalRaw) return undefined;
  if (!isStripeInterval(intervalRaw)) throw new Error("invalid_interval");

  const countRaw = Number(raw.interval_count ?? 1);
  const interval_count =
    Number.isFinite(countRaw) && countRaw >= 1 ? Math.floor(countRaw) : 1;

  return { interval: intervalRaw, interval_count };
}

export async function POST(request: Request, context: RouteCtx) {
  const billing = await getAuthedBillingContextWithReason(request);
  if (!billing.ok) {
    return billingContextErrorResponse(billing);
  }

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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currency = normalizeCurrency(body.currency);
  const unitAmount = normalizeUnitAmount(body.unit_amount);

  if (unitAmount == null) {
    return NextResponse.json({ error: "invalid_unit_amount" }, { status: 400 });
  }

  let recurring: Stripe.PriceCreateParams.Recurring | undefined;
  try {
    recurring = normalizeRecurring((body.recurring as Record<string, unknown> | null) ?? null);
  } catch (error: any) {
    if (String(error?.message ?? "") === "invalid_interval") {
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

  try {
    const stripe = getStripeClientForLivemode(billing.ctx.livemode);
    const supabase = getSupabaseAdminClient();

    const price = await stripe.prices.create(
      {
        product: productId,
        currency,
        unit_amount: unitAmount,
        ...(recurring ? { recurring } : {}),
      },
      { stripeAccount: billing.ctx.stripeAccountId },
    );

    const row = {
      org_id: billing.ctx.orgId,
      livemode: billing.ctx.livemode,
      stripe_price_id: price.id,
      stripe_product_id: getStripeProductId(price) ?? productId,
      stripe_active: !!price.active,
      stripe_created: typeof price.created === "number" ? price.created : null,
      currency: price.currency ?? null,
      unit_amount: typeof price.unit_amount === "number" ? price.unit_amount : null,
      price_type: price.type ?? null,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("organization_stripe_prices")
      .upsert(row, { onConflict: "org_id,livemode,stripe_price_id" });

    if (upsertError) {
      const payload = {
        error: "db_upsert_failed",
        message:
          "Failed to persist price snapshot in organization_stripe_prices.",
        stripe_price_id: price.id,
        details: {
          code: (upsertError as any)?.code ?? null,
          message: upsertError.message ?? null,
          details: (upsertError as any)?.details ?? null,
          hint: (upsertError as any)?.hint ?? null,
        },
      };

      if (STRICT_DB) {
        return NextResponse.json(payload, { status: 500 });
      }

      return NextResponse.json(
        { ok: true, stripe_price_id: price.id, warning: payload },
        { status: 200 },
      );
    }

    await logCatalogActivitySafe({
      orgId: billing.ctx.orgId,
      livemode: billing.ctx.livemode,
      stripeProductId: productId,
      stripePriceId: price.id,
      actorUserId: billing.ctx.userId,
      type: "price_created",
      payload: {
        currency: price.currency ?? currency,
        unit_amount: price.unit_amount ?? unitAmount,
        recurring: price.recurring ?? null,
      },
    });

    return NextResponse.json({ ok: true, stripe_price_id: price.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: "stripe_price_create_failed", message: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}
