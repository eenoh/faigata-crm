// src/app/api/billing/products/sync/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

async function logActivity(args: {
  orgId: string;
  livemode: boolean;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  actor_user_id?: string | null;
  type: string;
  payload?: any;
}) {
  const sb = adminClient();
  await sb.from("organization_stripe_catalog_activity").insert({
    org_id: args.orgId,
    livemode: args.livemode,
    stripe_product_id: args.stripe_product_id ?? null,
    stripe_price_id: args.stripe_price_id ?? null,
    actor_user_id: args.actor_user_id ?? null,
    type: args.type,
    payload: args.payload ?? {},
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthedBillingContext(req);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ✅ FIX: stripeClient requires livemode
  const stripe = stripeClient(ctx.livemode);
  const sb = adminClient();

  // --- Pull all products (pagination) ---
  const allProducts: Stripe.Product[] = [];
  let starting_after: string | undefined = undefined;

  for (;;) {
    const resp: Stripe.ApiList<Stripe.Product> = await stripe.products.list(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      { stripeAccount: ctx.stripeAccountId }
    );

    allProducts.push(...resp.data);
    if (!resp.has_more) break;

    const lastId = resp.data[resp.data.length - 1]?.id;
    if (!lastId) break;
    starting_after = lastId;
  }

  if (allProducts.length) {
    const rows = allProducts.map((p) => ({
      org_id: ctx.orgId,
      livemode: ctx.livemode,
      stripe_product_id: p.id,
      stripe_name: p.name ?? null,
      stripe_description: p.description ?? null,
      stripe_active: !!p.active,
      stripe_created: typeof p.created === "number" ? p.created : null,
      updated_at: new Date().toISOString(),
    }));

    await sb
      .from("organization_stripe_products")
      .upsert(rows, { onConflict: "org_id,livemode,stripe_product_id" });
  }

  // --- Pull all prices (pagination) ---
  const allPrices: Stripe.Price[] = [];
  starting_after = undefined;

  for (;;) {
    const resp: Stripe.ApiList<Stripe.Price> = await stripe.prices.list(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      { stripeAccount: ctx.stripeAccountId }
    );

    allPrices.push(...resp.data);
    if (!resp.has_more) break;

    const lastId = resp.data[resp.data.length - 1]?.id;
    if (!lastId) break;
    starting_after = lastId;
  }

  if (allPrices.length) {
    const priceRows = allPrices.map((pr) => ({
      org_id: ctx.orgId,
      livemode: ctx.livemode,
      stripe_price_id: pr.id,
      stripe_product_id: typeof pr.product === "string" ? pr.product : (pr.product as any)?.id ?? null,
      stripe_active: !!pr.active,
      stripe_created: typeof pr.created === "number" ? pr.created : null,
      currency: pr.currency ?? null,
      unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
      price_type: pr.type ?? null,
      interval: pr.recurring?.interval ?? null,
      interval_count: pr.recurring?.interval_count ?? null,
      updated_at: new Date().toISOString(),
    }));

    await sb
      .from("organization_stripe_prices")
      .upsert(priceRows, { onConflict: "org_id,livemode,stripe_price_id" });
  }

  await logActivity({
    orgId: ctx.orgId,
    livemode: ctx.livemode,
    actor_user_id: ctx.userId,
    type: "catalog_synced",
    payload: { products: allProducts.length, prices: allPrices.length },
  });

  return NextResponse.json({
    ok: true,
    products: allProducts.length,
    prices: allPrices.length,
  });
}
