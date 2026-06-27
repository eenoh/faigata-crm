// src/app/api/billing/products/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import { applyBillingProductTranslations } from "@/features/billing/server/translations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------
// Types
// -----------------------------
type CurrentPrice = {
  currency: string | null;
  unit_amount: number | null;
  recurring?: {
    interval: "day" | "week" | "month" | "year";
    interval_count?: number;
  } | null;
};

// -----------------------------
// Helpers
// -----------------------------
function normalize(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function isStripeAccountId(v: unknown) {
  return /^acct_[a-zA-Z0-9]+$/.test(String(v ?? "").trim());
}

// -----------------------------
// Stripe helpers
// -----------------------------
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

function toCurrentPriceShape(
  pr: Stripe.Price | null | undefined,
): CurrentPrice | null {
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
  priceById: Map<string, Stripe.Price>,
): Stripe.Price | null {
  const defaultPriceId = extractDefaultPriceId(product);
  if (defaultPriceId) {
    const found = priceById.get(defaultPriceId) ?? null;
    if (found) return found;
  }

  const list = pricesByProduct.get(product.id) ?? [];
  if (!list.length) return null;

  const sorted = [...list].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const newestActive = sorted.find((x) => x.active) ?? null;
  return newestActive ?? sorted[0] ?? null;
}

// -----------------------------
// Route
// -----------------------------
export async function handleListBillingProducts(req: Request, options?: { compact?: boolean }) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const now = new Date().toISOString();

  try {
    const billing = await getAuthedBillingContextWithReason(req);
    if (!billing.ok) {
      switch (billing.reason) {
        case "no_user":
          return NextResponse.json(
            {
              error: "unauthorized",
              message: "Invalid session or user not found.",
            },
            { status: 401 },
          );
        case "missing_privilege":
          return NextResponse.json(
            {
              error: "forbidden",
              message: "You do not have permission to view billing products.",
              details: billing.details,
            },
            { status: 403 },
          );
        case "missing_org":
          return NextResponse.json(
            {
              error: "missing_org_id",
              message: "No organization is linked to the resolved team.",
              details: billing.details,
            },
            { status: 400 },
          );
        case "missing_stripe_account":
          return NextResponse.json(
            {
              error: "missing_stripe_account_id",
              message:
                "No connected Stripe account found for this org in the selected mode.",
              details: billing.details,
            },
            { status: 400 },
          );
        default:
          return NextResponse.json(
            {
              error: "billing_context_failed",
              message: "Failed to resolve billing context.",
              details: billing.details,
            },
            { status: 500 },
          );
      }
    }

    const ctx = billing.ctx;
    const supabase = getSupabaseAdminClient();
    const requestedLocale = await resolveRequestLocale({
      request: req,
      admin: supabase,
      userId: ctx.userId,
    });
    const stripeAccountId = String(ctx.stripeAccountId ?? "").trim();
    if (!isStripeAccountId(stripeAccountId)) {
      return NextResponse.json(
        {
          error: "invalid_stripe_account_id",
          message: `Invalid stripeAccountId: ${stripeAccountId}`,
        },
        { status: 400 },
      );
    }

    const stripe = getStripeClientForLivemode(ctx.livemode);

    // 1) all products
    const productsAll = await listAll<Stripe.Product>(
      (params, opts) => stripe.products.list(params as any, opts) as any,
      { stripeAccount: stripeAccountId },
    );

    // 2) all prices
    const pricesAll = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params as any, opts) as any,
      { stripeAccount: stripeAccountId },
    );

    const pricesByProduct = new Map<string, Stripe.Price[]>();
    const priceById = new Map<string, Stripe.Price>();

    for (const pr of pricesAll) {
      priceById.set(pr.id, pr);
      const pid =
        typeof pr.product === "string"
          ? pr.product
          : ((pr.product as any)?.id ?? null);
      if (!pid) continue;
      const list = pricesByProduct.get(pid) ?? [];
      list.push(pr);
      pricesByProduct.set(pid, list);
    }

    const rows = productsAll.map((p) => {
      const stripe_created = typeof p.created === "number" ? p.created : null;
      const currentStripePrice = pickCurrentPriceForProduct(
        p,
        pricesByProduct,
        priceById,
      );
      const current_price = toCurrentPriceShape(currentStripePrice);

      return {
        stripe_product_id: p.id,
        stripe_name: p.name ?? null,
        stripe_description: p.description ?? null,
        stripe_active: !!p.active,
        stripe_created,

        // placeholders (if you later merge DB/local edits)
        local_name: null,
        local_description: null,
        is_archived: false,

        updated_at: now,
        display_name: p.name ?? p.id,

        current_price,
        price_count: pricesByProduct.get(p.id)?.length ?? 0,
      };
    });

    const localizedRows = rows.map((row) => ({
      productId: row.stripe_product_id,
      name: row.stripe_name,
      description: row.stripe_description,
    }));

    await applyBillingProductTranslations({
      admin: supabase,
      orgId: ctx.orgId,
      livemode: ctx.livemode,
      requestedLocale,
      rows: localizedRows,
    });

    for (const [index, row] of rows.entries()) {
      const localized = localizedRows[index];
      if (!localized) continue;
      row.stripe_name = localized.name;
      row.stripe_description = localized.description;
      row.display_name = localized.name ?? row.stripe_product_id;
    }

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

    filtered.sort((a, b) => (b.stripe_created ?? 0) - (a.stripe_created ?? 0));

    if (options?.compact) {
      return NextResponse.json({
        ok: true,
        products: filtered.map((product) => ({
          id: product.stripe_product_id,
          name: product.stripe_name,
          active: product.stripe_active,
          created: product.stripe_created,
        })),
        livemode: ctx.livemode,
        stripeAccountId,
        teamId: ctx.teamId,
        organizationId: ctx.orgId,
      });
    }

    return NextResponse.json({
      products: filtered,
      q,
      stripeAccountId,
      livemode: ctx.livemode,
      teamId: ctx.teamId,
      orgId: ctx.orgId,
      source: "stripe",
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "stripe_list_failed",
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






