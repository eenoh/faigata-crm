// src/app/api/billing/products/[productId]/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ productId: string }> };

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
    const page = await listFn(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      opts
    );

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;

    starting_after = page.data[page.data.length - 1]!.id;
  }

  return out;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();

  if (!pid || pid === "undefined") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  try {
    // ✅ Stripe direct
    const stripe = stripeClient(billingCtx.livemode);

    const product = await stripe.products.retrieve(pid, {
      stripeAccount: billingCtx.stripeAccountId,
    } as any);

    if (!product || (product as any).deleted) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Fetch all prices, then filter by product
    const allPrices = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params, opts) as any,
      { stripeAccount: billingCtx.stripeAccountId }
    );

    const prices = allPrices
      .filter((pr) => {
        const prPid =
          typeof pr.product === "string"
            ? pr.product
            : (pr.product as any)?.id ?? null;
        return prPid === pid;
      })
      .sort((a, b) => (typeof b.created === "number" ? b.created : 0) - (typeof a.created === "number" ? a.created : 0));

    // OPTIONAL: activity from DB (your custom timeline)
    // If you want to fully remove DB tables, you can return [] here.
    const sb = adminClient();
    const { data: activity } = await sb
      .from("organization_stripe_catalog_activity")
      .select("id, type, payload, actor_user_id, created_at, stripe_product_id, stripe_price_id")
      .eq("org_id", billingCtx.orgId)
      .eq("livemode", billingCtx.livemode)
      .eq("stripe_product_id", pid)
      .order("created_at", { ascending: false })
      .limit(100);

    return NextResponse.json({
      product,          // Stripe Product
      prices,           // Stripe Prices (for this product)
      activity: activity ?? [],
      source: "stripe",
      livemode: billingCtx.livemode,
      stripeAccountId: billingCtx.stripeAccountId,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    // Stripe not found often throws
    if (msg.toLowerCase().includes("no such product") || msg.toLowerCase().includes("resource_missing")) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "stripe_detail_failed", message: msg },
      { status: 500 }
    );
  }
}
