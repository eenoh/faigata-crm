// src/app/api/billing/products/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

function normalize(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

// Stripe paginator (limit=100)
async function listAll<T extends { id: string }>(
  listFn: (params: { limit: number; starting_after?: string }, opts: any) => Promise<{
    data: T[];
    has_more: boolean;
  }>,
  opts: any
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;

  while (true) {
    const page = await listFn({ limit: 100, ...(starting_after ? { starting_after } : {}) }, opts);

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;

    starting_after = page.data[page.data.length - 1]!.id;
  }

  return out;
}

type CurrentPrice = {
  currency: string | null;
  unit_amount: number | null;
  recurring?: { interval: "day" | "week" | "month" | "year"; interval_count?: number } | null;
};

function toCurrentPriceShape(pr: Stripe.Price | null | undefined): CurrentPrice | null {
  if (!pr) return null;

  const recurring =
    pr.type === "recurring" && pr.recurring?.interval
      ? {
          interval: pr.recurring.interval,
          interval_count: pr.recurring.interval_count ?? 1,
        }
      : null;

  return {
    currency: pr.currency ?? null,
    unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
    recurring,
  };
}

function extractDefaultPriceId(p: Stripe.Product): string | null {
  const dp: any = (p as any).default_price ?? null;
  if (!dp) return null;
  if (typeof dp === "string") return dp;
  if (typeof dp === "object" && typeof dp.id === "string") return dp.id;
  return null;
}

function pickCurrentPriceForProduct(
  product: Stripe.Product,
  pricesByProduct: Map<string, Stripe.Price[]>,
  priceById: Map<string, Stripe.Price>
): Stripe.Price | null {
  const pid = product.id;

  // 1) Prefer Stripe product.default_price if it exists AND we have it in our price map
  const defaultPriceId = extractDefaultPriceId(product);
  if (defaultPriceId) {
    const found = priceById.get(defaultPriceId) ?? null;
    if (found) return found;
  }

  // 2) Otherwise, pick the newest ACTIVE price for that product
  const list = pricesByProduct.get(pid) ?? [];
  if (!list.length) return null;

  const sorted = [...list].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const newestActive = sorted.find((x) => x.active) ?? null;
  if (newestActive) return newestActive;

  // 3) Fallback: newest price (even if inactive)
  return sorted[0] ?? null;
}

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);

  if (!auth.ok) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: auth.reason,
        details: auth.details ?? null,
        hint:
          auth.reason === "missing_stripe_account"
            ? "No connected Stripe account found for this org (organization_stripe_accounts)."
            : auth.reason === "missing_privilege"
            ? "Your user lacks required role (closer/manager/admin) in profiles.role."
            : auth.reason === "missing_org"
            ? "profiles.team_id is null for this user."
            : auth.reason === "profile_missing"
            ? "profiles row not found for this user."
            : "No Supabase user resolved from Bearer token or cookies.",
      },
      { status: 401 }
    );
  }

  const ctx = auth.ctx;
  const url = new URL(req.url);

  // We keep q/refresh for compatibility with your UI, but refresh doesn't hit DB anymore.
  const q = url.searchParams.get("q")?.trim() ?? "";
  const _refresh = url.searchParams.get("refresh") === "1";

  try {
    // ✅ your stripeClient requires livemode argument
    const stripe = stripeClient(ctx.livemode);

    // 1) Fetch ALL products for this connected account
    const productsAll = await listAll<Stripe.Product>(
      (params, opts) => stripe.products.list(params, opts) as any,
      { stripeAccount: ctx.stripeAccountId }
    );

    // 2) Fetch ALL prices for this connected account
    const pricesAll = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params, opts) as any,
      { stripeAccount: ctx.stripeAccountId }
    );

    // Build helpers
    const pricesByProduct = new Map<string, Stripe.Price[]>();
    const priceById = new Map<string, Stripe.Price>();

    for (const pr of pricesAll) {
      priceById.set(pr.id, pr);

      const pid =
        typeof pr.product === "string" ? pr.product : ((pr.product as any)?.id ?? null);

      if (!pid) continue;
      const list = pricesByProduct.get(pid) ?? [];
      list.push(pr);
      pricesByProduct.set(pid, list);
    }

    // 3) Map to your UI shape (ProductRow) — NOW includes current_price
    const rows = productsAll.map((p) => {
      const stripe_created = typeof p.created === "number" ? p.created : null;

      const currentStripePrice = pickCurrentPriceForProduct(p, pricesByProduct, priceById);
      const current_price = toCurrentPriceShape(currentStripePrice);

      return {
        stripe_product_id: p.id,
        stripe_name: p.name ?? null,
        stripe_description: p.description ?? null,
        stripe_active: !!p.active,
        stripe_created,

        // These were from your DB mirror — keep as null/false for compatibility.
        local_name: null,
        local_description: null,
        is_archived: false,

        // Stripe doesn't have updated_at; use created time for stable ordering
        updated_at: stripe_created
          ? new Date(stripe_created * 1000).toISOString()
          : new Date().toISOString(),

        display_name: p.name ?? p.id,

        // ✅ NEW: current price payload for list page
        current_price,

        // (Optional) keep price_count around so nothing else breaks
        price_count: pricesByProduct.get(p.id)?.length ?? 0,
      };
    });

    // 4) Filter server-side by q (optional; your client also filters)
    const filtered =
      q.length > 0
        ? rows.filter((r) => {
            const hay = [
              normalize(r.display_name),
              normalize(r.stripe_name),
              normalize(r.local_name),
              normalize(r.stripe_product_id),
              normalize(r.stripe_description),
              normalize(r.local_description),
            ].join(" ");
            return hay.includes(normalize(q));
          })
        : rows;

    // 5) Order newest first (by created)
    filtered.sort((a, b) => (b.stripe_created ?? 0) - (a.stripe_created ?? 0));

    return NextResponse.json({
      products: filtered,
      q,
      stripeAccountId: ctx.stripeAccountId,
      livemode: ctx.livemode,
      source: "stripe",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_list_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
