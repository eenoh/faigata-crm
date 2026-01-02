// src/app/api/billing/products/create/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";

type CreateProductBody = {
  name: string;
  description?: string | null;
  active?: boolean;

  price: {
    unit_amount: number; // cents
    currency: string; // "usd"
    recurring?: {
      interval: "day" | "week" | "month" | "year";
      interval_count?: number;
    };
  };
};

function normalizeCurrency(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return s || null;
}

function normalizeUnitAmount(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export async function POST(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);

  if (!auth.ok) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: auth.reason,
        details: auth.details ?? null,
      },
      { status: 401 }
    );
  }

  const ctx = auth.ctx;

  const body = (await req.json().catch(() => null)) as CreateProductBody | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const description =
    body.description === null ? null : String(body.description ?? "").trim() || null;

  // price required
  const currency = normalizeCurrency(body.price?.currency);
  const unit_amount = normalizeUnitAmount(body.price?.unit_amount);

  if (!currency) {
    return NextResponse.json({ error: "missing_currency" }, { status: 400 });
  }
  if (unit_amount == null) {
    return NextResponse.json({ error: "invalid_unit_amount"  }, { status: 400 });
  }

  // validate recurring (optional)
  const recurringRaw = body.price?.recurring;
  let recurring: Stripe.PriceCreateParams.Recurring | undefined = undefined;

  if (recurringRaw) {
    const interval = String(recurringRaw.interval ?? "").trim().toLowerCase();
    const allowed = ["day", "week", "month", "year"] as const;

    if (!allowed.includes(interval as any)) {
      return NextResponse.json(
        { error: "invalid_interval", allowed },
        { status: 400 }
      );
    }

    const countRaw = Number(recurringRaw.interval_count ?? 1);
    const interval_count =
      Number.isFinite(countRaw) && countRaw >= 1 ? Math.floor(countRaw) : 1;

    recurring = { interval: interval as any, interval_count };
  }

  try {
    // ✅ IMPORTANT: use test vs live depending on ctx.livemode
    const stripe = stripeClient(ctx.livemode);

    // 1) Create product
    const product = await stripe.products.create(
      {
        name,
        description: description ?? undefined,
        active: body.active ?? true,
      },
      { stripeAccount: ctx.stripeAccountId }
    );

    // 2) Create price (required)
    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount,
        currency,
        ...(recurring ? { recurring } : {}),
      },
      { stripeAccount: ctx.stripeAccountId }
    );

    return NextResponse.json({
      ok: true,
      stripe_product_id: product.id,
      stripe_price_id: price.id,
      livemode: ctx.livemode,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_create_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
