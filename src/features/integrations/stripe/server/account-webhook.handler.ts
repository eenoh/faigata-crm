import "server-only";

import type Stripe from "stripe";
import type { Database, Json } from "@/types/database";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { readStripeRawBody, verifyStripeWebhook } from "@/lib/stripe/webhooks";
import { serverEnv } from "@/lib/env/server";

type OrganizationStripeProductInsert =
  Database["public"]["Tables"]["organization_stripe_products"]["Insert"];

type OrganizationStripePriceInsert =
  Database["public"]["Tables"]["organization_stripe_prices"]["Insert"];

type OrganizationStripeCatalogActivityInsert =
  Database["public"]["Tables"]["organization_stripe_catalog_activity"]["Insert"];

function getLivemode(
  event: Stripe.Event,
  organizationAccount: { livemode?: boolean } | null,
) {
  return typeof event.livemode === "boolean"
    ? event.livemode
    : Boolean(organizationAccount?.livemode);
}

function getPriceProductId(price: Stripe.Price) {
  return typeof price.product === "string"
    ? price.product
    : (price.product?.id ?? null);
}

export async function handleStripeConnectedAccountWebhook(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonError("missing_signature", 400);

  const mode = serverEnv.stripe.livemode() ? "live" : "test";

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(
      await readStripeRawBody(request),
      signature,
      serverEnv.stripe.webhookSecret(mode),
      mode,
    );
  } catch (error) {
    return jsonError("invalid_signature", 400, {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const accountId =
    typeof event.account === "string" ? event.account : undefined;
  if (!accountId) return jsonOk({ ok: true });

  const supabase = getSupabaseAdminClient();
  const { data: organizationAccount } = await supabase
    .from("organization_stripe_accounts")
    .select("org_id, livemode, stripe_account_id")
    .eq("stripe_account_id", accountId)
    .maybeSingle();

  const orgRow = organizationAccount as {
    org_id?: string | null;
    livemode?: boolean | null;
  } | null;

  const orgId = orgRow?.org_id ?? null;
  if (!orgId) return jsonOk({ ok: true });

  const livemode = getLivemode(event, {
    livemode: orgRow?.livemode ?? undefined,
  });
  const now = new Date().toISOString();

  if (event.type.startsWith("product.")) {
    const product = event.data.object as Stripe.Product;

    const productPayload: OrganizationStripeProductInsert = {
      org_id: orgId,
      livemode,
      stripe_product_id: product.id,
      stripe_name: product.name ?? null,
      stripe_description: product.description ?? null,
      stripe_active: Boolean(product.active),
      stripe_created: product.created ?? null,
      updated_at: now,
    };

    await supabase.from("organization_stripe_products").upsert(productPayload, {
      onConflict: "org_id,livemode,stripe_product_id",
    });

    const activityPayload: OrganizationStripeCatalogActivityInsert = {
      org_id: orgId,
      livemode,
      stripe_product_id: product.id,
      actor_user_id: null,
      type: `webhook_${event.type.replace(".", "_")}`,
      payload: {
        id: product.id,
        name: product.name,
        active: product.active,
      } as Json,
    };

    await supabase
      .from("organization_stripe_catalog_activity")
      .insert(activityPayload);

    return jsonOk({ ok: true });
  }

  if (event.type.startsWith("price.")) {
    const price = event.data.object as Stripe.Price;
    const productId = getPriceProductId(price);

    const pricePayload: OrganizationStripePriceInsert = {
      org_id: orgId,
      livemode,
      stripe_price_id: price.id,
      stripe_product_id: productId,
      stripe_active: Boolean(price.active),
      stripe_created: price.created ?? null,
      currency: price.currency ?? null,
      unit_amount:
        typeof price.unit_amount === "number" ? price.unit_amount : null,
      price_type: price.type ?? null,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      updated_at: now,
    };

    await supabase.from("organization_stripe_prices").upsert(pricePayload, {
      onConflict: "org_id,livemode,stripe_price_id",
    });

    const activityPayload: OrganizationStripeCatalogActivityInsert = {
      org_id: orgId,
      livemode,
      stripe_product_id: productId,
      stripe_price_id: price.id,
      actor_user_id: null,
      type: `webhook_${event.type.replace(".", "_")}`,
      payload: {
        id: price.id,
        active: price.active,
        product: productId,
      } as Json,
    };

    await supabase
      .from("organization_stripe_catalog_activity")
      .insert(activityPayload);
  }

  return jsonOk({ ok: true });
}
