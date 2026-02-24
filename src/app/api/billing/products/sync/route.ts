// src/app/api/billing/products/sync/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

/** Best-effort activity logger (never throws) */
async function logActivitySafe(args: {
  orgId: string;
  livemode: boolean;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  actor_user_id?: string | null;
  type: string;
  payload?: any;
}) {
  try {
    const sb = adminClient();
    const { error } = await sb
      .from("organization_stripe_catalog_activity")
      .insert({
        org_id: args.orgId,
        livemode: args.livemode,
        stripe_product_id: args.stripe_product_id ?? null,
        stripe_price_id: args.stripe_price_id ?? null,
        actor_user_id: args.actor_user_id ?? null,
        type: args.type,
        payload: args.payload ?? {},
      });

    // swallow errors intentionally
    void error;
  } catch {
    // swallow errors intentionally
  }
}

/** Stripe pagination helper */
async function listAll<T extends { id: string }>(
  listFn: (
    params: { limit: number; starting_after?: string },
    opts: any,
  ) => Promise<{ data: T[]; has_more: boolean }>,
  opts: any,
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;

  for (;;) {
    const page = await listFn(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      opts,
    );

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;

    starting_after = page.data[page.data.length - 1]!.id;
  }

  return out;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthedBillingContext(req);
  if (!ctx) {
    return NextResponse.json(
      {
        error: "unauthorized",
        hint: "Missing/invalid session or billing context.",
      },
      { status: 401 },
    );
  }

  const stripe = stripeClient(ctx.livemode);
  const sb = adminClient();
  const now = new Date().toISOString();

  try {
    // --- Pull all products ---
    const allProducts = await listAll<Stripe.Product>(
      (params, opts) => stripe.products.list(params as any, opts) as any,
      { stripeAccount: ctx.stripeAccountId },
    );

    if (allProducts.length) {
      const rows = allProducts.map((p) => ({
        org_id: ctx.orgId,
        livemode: ctx.livemode,
        stripe_product_id: p.id,
        stripe_name: p.name ?? null,
        stripe_description: p.description ?? null,
        stripe_active: !!p.active,
        stripe_created: typeof p.created === "number" ? p.created : null,
        updated_at: now,
      }));

      const { error } = await sb
        .from("organization_stripe_products")
        .upsert(rows, { onConflict: "org_id,livemode,stripe_product_id" });

      if (error) {
        return NextResponse.json(
          { error: "db_upsert_products_failed", detail: error.message },
          { status: 500 },
        );
      }
    }

    // --- Pull all prices ---
    const allPrices = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params as any, opts) as any,
      { stripeAccount: ctx.stripeAccountId },
    );

    if (allPrices.length) {
      const priceRows = allPrices.map((pr) => ({
        org_id: ctx.orgId,
        livemode: ctx.livemode,
        stripe_price_id: pr.id,
        stripe_product_id:
          typeof pr.product === "string"
            ? pr.product
            : ((pr.product as any)?.id ?? null),
        stripe_active: !!pr.active,
        stripe_created: typeof pr.created === "number" ? pr.created : null,
        currency: pr.currency ?? null,
        unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
        price_type: pr.type ?? null,
        interval: pr.recurring?.interval ?? null,
        interval_count: pr.recurring?.interval_count ?? null,
        updated_at: now,
      }));

      const { error } = await sb
        .from("organization_stripe_prices")
        .upsert(priceRows, { onConflict: "org_id,livemode,stripe_price_id" });

      if (error) {
        return NextResponse.json(
          { error: "db_upsert_prices_failed", detail: error.message },
          { status: 500 },
        );
      }
    }

    // Best-effort activity log
    await logActivitySafe({
      orgId: ctx.orgId,
      livemode: ctx.livemode,
      actor_user_id: ctx.userId ?? null,
      type: "catalog_synced",
      payload: { products: allProducts.length, prices: allPrices.length },
    });

    return NextResponse.json({
      ok: true,
      products: allProducts.length,
      prices: allPrices.length,
      livemode: ctx.livemode,
    });
  } catch (e: any) {
    // Stripe failures, auth failures to connected account, etc.
    return NextResponse.json(
      {
        error: "catalog_sync_failed",
        message: String(e?.message ?? e),
        stripe: {
          type: e?.type ?? null,
          code: e?.code ?? null,
          statusCode: e?.statusCode ?? null,
          requestId: e?.requestId ?? null,
        },
      },
      { status: 500 },
    );
  }
}
