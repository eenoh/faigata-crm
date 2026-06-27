import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import {
  getStripeProductId,
  listAllStripePages,
  logCatalogActivitySafe,
} from "@/features/billing/server/catalog";
import { billingContextErrorResponse } from "@/features/billing/server/http";
import { syncBillingProductTranslationSources } from "@/features/billing/server/translations";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const billing = await getAuthedBillingContextWithReason(request);
  if (!billing.ok) {
    return billingContextErrorResponse(billing);
  }

  try {
    const stripe = getStripeClientForLivemode(billing.ctx.livemode);
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();

    const allProducts = await listAllStripePages<Stripe.Product>(
      (params, opts) => stripe.products.list(params as any, opts) as any,
      { stripeAccount: billing.ctx.stripeAccountId },
    );

    if (allProducts.length) {
      const rows = allProducts.map((product) => ({
        org_id: billing.ctx.orgId,
        livemode: billing.ctx.livemode,
        stripe_product_id: product.id,
        stripe_name: product.name ?? null,
        stripe_description: product.description ?? null,
        stripe_active: !!product.active,
        stripe_created: typeof product.created === "number" ? product.created : null,
        updated_at: now,
      }));

      const { error } = await supabase
        .from("organization_stripe_products")
        .upsert(rows, { onConflict: "org_id,livemode,stripe_product_id" });

      if (error) {
        return NextResponse.json(
          { error: "db_upsert_products_failed", detail: error.message },
          { status: 500 },
        );
      }

      try {
        await syncBillingProductTranslationSources({
          admin: supabase as any,
          orgId: billing.ctx.orgId,
          livemode: billing.ctx.livemode,
          rows: allProducts.map((product) => ({
            productId: product.id,
            name: product.name ?? null,
            description: product.description ?? null,
          })),
        });
      } catch (translationError) {
        console.error(
          "[billing-products-sync] translation source sync failed",
          translationError,
        );
      }
    }

    const allPrices = await listAllStripePages<Stripe.Price>(
      (params, opts) => stripe.prices.list(params as any, opts) as any,
      { stripeAccount: billing.ctx.stripeAccountId },
    );

    if (allPrices.length) {
      const rows = allPrices.map((price) => ({
        org_id: billing.ctx.orgId,
        livemode: billing.ctx.livemode,
        stripe_price_id: price.id,
        stripe_product_id: getStripeProductId(price),
        stripe_active: !!price.active,
        stripe_created: typeof price.created === "number" ? price.created : null,
        currency: price.currency ?? null,
        unit_amount: typeof price.unit_amount === "number" ? price.unit_amount : null,
        price_type: price.type ?? null,
        interval: price.recurring?.interval ?? null,
        interval_count: price.recurring?.interval_count ?? null,
        updated_at: now,
      }));

      const { error } = await supabase
        .from("organization_stripe_prices")
        .upsert(rows, { onConflict: "org_id,livemode,stripe_price_id" });

      if (error) {
        return NextResponse.json(
          { error: "db_upsert_prices_failed", detail: error.message },
          { status: 500 },
        );
      }
    }

    await logCatalogActivitySafe({
      orgId: billing.ctx.orgId,
      livemode: billing.ctx.livemode,
      actorUserId: billing.ctx.userId,
      type: "catalog_synced",
      payload: {
        products: allProducts.length,
        prices: allPrices.length,
      },
    });

    return NextResponse.json({
      ok: true,
      products: allProducts.length,
      prices: allPrices.length,
      livemode: billing.ctx.livemode,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "catalog_sync_failed",
        message: String(error?.message ?? error),
        stripe: {
          type: error?.type ?? null,
          code: error?.code ?? null,
          statusCode: error?.statusCode ?? null,
          requestId: error?.requestId ?? null,
        },
      },
      { status: 500 },
    );
  }
}
