import "server-only";

import type Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function listAllStripePages<T extends { id: string }>(
  listFn: (
    params: { limit: number; starting_after?: string },
    opts: Record<string, unknown>,
  ) => Promise<{ data: T[]; has_more: boolean }>,
  opts: Record<string, unknown>,
): Promise<T[]> {
  const out: T[] = [];
  let startingAfter: string | undefined;

  for (;;) {
    const page = await listFn(
      { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      opts,
    );

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) {
      break;
    }

    startingAfter = page.data[page.data.length - 1]?.id;
  }

  return out;
}

export async function logCatalogActivitySafe(args: {
  orgId: string;
  livemode: boolean;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
  actorUserId?: string | null;
  type: string;
  payload?: unknown;
}) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("organization_stripe_catalog_activity")
      .insert({
        org_id: args.orgId,
        livemode: args.livemode,
        stripe_product_id: args.stripeProductId ?? null,
        stripe_price_id: args.stripePriceId ?? null,
        actor_user_id: args.actorUserId ?? null,
        type: args.type,
        payload: args.payload ?? {},
        created_at: new Date().toISOString(),
      });

    void error;
  } catch {
    // Best-effort logging only.
  }
}

export function getStripeProductId(price: Stripe.Price) {
  return typeof price.product === "string"
    ? price.product
    : ((price.product as { id?: string } | null)?.id ?? null);
}
