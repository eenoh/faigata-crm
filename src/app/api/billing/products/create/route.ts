// src/app/api/billing/products/create/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";

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

  const currency = normalizeCurrency(body.price?.currency);
  const unit_amount = normalizeUnitAmount(body.price?.unit_amount);

  if (!currency) return NextResponse.json({ error: "missing_currency" }, { status: 400 });
  if (unit_amount == null) return NextResponse.json({ error: "invalid_unit_amount" }, { status: 400 });

  const recurringRaw = body.price?.recurring;
  let recurring: Stripe.PriceCreateParams.Recurring | undefined = undefined;

  if (recurringRaw) {
    const interval = String(recurringRaw.interval ?? "").trim().toLowerCase();
    const allowed = ["day", "week", "month", "year"] as const;

    if (!allowed.includes(interval as any)) {
      return NextResponse.json({ error: "invalid_interval", allowed }, { status: 400 });
    }

    const countRaw = Number(recurringRaw.interval_count ?? 1);
    const interval_count =
      Number.isFinite(countRaw) && countRaw >= 1 ? Math.floor(countRaw) : 1;

    recurring = { interval: interval as any, interval_count };
  }

  try {
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

    // 3) Persist + activity log (so UI shows “New product …”)
    const sb = adminClient();

    // Upsert product snapshot for your org table (optional but useful)
    await sb.from("organization_stripe_products").upsert(
      {
        org_id: ctx.orgId,
        livemode: ctx.livemode,
        stripe_product_id: product.id,
        stripe_name: product.name ?? null,
        stripe_description: product.description ?? null,
        stripe_active: !!product.active,
        stripe_created: typeof product.created === "number" ? product.created : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,livemode,stripe_product_id" }
    );

    // Activity event (used by ProductDetailClient timeline)
    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: ctx.orgId,
      livemode: ctx.livemode,
      stripe_product_id: product.id,
      stripe_price_id: price.id,
      actor_user_id: ctx.userId ?? null,
      type: "product_created",
      payload: {
        name: product.name ?? null,
        description: product.description ?? null,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      stripe_product_id: product.id,
      stripe_price_id: price.id,
      livemode: ctx.livemode,
      product, // ✅ return Stripe Product so clients can use name immediately if needed
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_create_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
