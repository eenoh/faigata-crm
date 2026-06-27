// src/app/api/billing/products/[productId]/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import {
  applyBillingActivityTranslations,
  applyBillingProductTranslations,
} from "@/features/billing/server/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ productId: string }> };

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function isStripeProductId(id: string) {
  return /^prod_[A-Za-z0-9]+$/.test(id);
}

async function listAllPrices(
  stripe: ReturnType<typeof stripeClient>,
  stripeAccount: string,
) {
  const out: any[] = [];
  let starting_after: string | undefined;

  while (true) {
    const page = await stripe.prices.list(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      { stripeAccount },
    );

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;

    starting_after = page.data[page.data.length - 1]!.id;
  }

  return out;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  // ✅ Use shared billing auth (orgId/livemode/stripeAccountId/roles)
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const { orgId, livemode, stripeAccountId } = auth.ctx;
  const sb = adminClient();
  const requestedLocale = await resolveRequestLocale({
    request: req,
    admin: sb as any,
    userId: auth.ctx.userId,
  });

  // ✅ Next: params is Promise in your build
  const { productId: raw } = await ctx.params;
  const pid = safeDecode(String(raw ?? "")).trim();
  const lower = pid.toLowerCase();

  if (!pid || lower === "undefined" || lower === "null") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  // Optional but helpful guard
  if (!isStripeProductId(pid)) {
    return NextResponse.json(
      {
        error: "invalid_product_id",
        hint: "Expected Stripe Product ID like prod_123...",
        received: pid,
      },
      { status: 400 },
    );
  }

  try {
    const stripe = stripeClient(livemode);

    // Stripe product
    const product = await stripe.products.retrieve(pid, {
      stripeAccount: stripeAccountId,
    } as any);

    if (!product || (product as any).deleted) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Prices: list all then filter to this product (keeps it simple/robust)
    const allPrices = await listAllPrices(stripe, stripeAccountId);

    const prices = allPrices
      .filter((pr) => {
        const prPid =
          typeof pr.product === "string"
            ? pr.product
            : (pr.product?.id ?? null);
        return prPid === pid;
      })
      .sort(
        (a, b) =>
          (typeof b.created === "number" ? b.created : 0) -
          (typeof a.created === "number" ? a.created : 0),
      );

    // Activity timeline from DB (optional)
    const { data: activity } = await sb
      .from("organization_stripe_catalog_activity")
      .select(
        "id, type, payload, actor_user_id, created_at, stripe_product_id, stripe_price_id",
      )
      .eq("org_id", orgId)
      .eq("livemode", livemode)
      .eq("stripe_product_id", pid)
      .order("created_at", { ascending: false })
      .limit(100);

    const localizedProduct = {
      productId: product.id,
      name: product.name ?? null,
      description: product.description ?? null,
    };

    await applyBillingProductTranslations({
      admin: sb as any,
      orgId,
      livemode,
      requestedLocale,
      rows: [localizedProduct],
    });

    const activityRows = Array.isArray(activity)
      ? (activity as Array<{ id: string; payload?: Record<string, unknown> | null }>)
      : [];

    await applyBillingActivityTranslations({
      requestedLocale,
      rows: activityRows,
    });

    product.name = localizedProduct.name ?? product.name;
    product.description = localizedProduct.description ?? product.description;

    return NextResponse.json({
      product,
      prices,
      activity: activityRows,
      source: "stripe",
      livemode,
      stripeAccountId,
      orgId,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const lowerMsg = msg.toLowerCase();

    // Stripe commonly throws resource_missing for deleted/nonexistent
    if (
      lowerMsg.includes("resource_missing") ||
      lowerMsg.includes("no such product")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // If Stripe gives a statusCode, use it
    const status =
      typeof e?.statusCode === "number" &&
      e.statusCode >= 400 &&
      e.statusCode <= 599
        ? e.statusCode
        : 500;

    return NextResponse.json(
      { error: "stripe_detail_failed", message: msg },
      { status },
    );
  }
}
