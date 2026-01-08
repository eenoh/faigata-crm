// src/app/api/billing/products/list/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

function isStripeAccountId(v: unknown) {
  const s = String(v ?? "").trim();
  return /^acct_[a-zA-Z0-9]+$/.test(s);
}

export async function GET(req: NextRequest) {
  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ✅ If you require Connect, fail early with a clear error
  const stripeAccountId = String(billingCtx.stripeAccountId ?? "").trim();
  if (!stripeAccountId) {
    return NextResponse.json(
      { error: "missing_stripe_account_id", message: "No connected Stripe account found for this workspace." },
      { status: 400 }
    );
  }
  if (!isStripeAccountId(stripeAccountId)) {
    return NextResponse.json(
      { error: "invalid_stripe_account_id", message: `Invalid stripeAccountId: ${stripeAccountId}` },
      { status: 400 }
    );
  }

  try {
    const stripe = stripeClient(billingCtx.livemode);

    // ✅ Only pass stripeAccount when it’s valid (it is here)
    const res = await stripe.products.list(
      { limit: 100 },
      { stripeAccount: stripeAccountId }
    );

    const products = (res.data ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? null,
      active: !!p.active,
      created: typeof p.created === "number" ? p.created : null,
    }));

    return NextResponse.json({
      ok: true,
      products,
      livemode: billingCtx.livemode,
      stripeAccountId,
    });
  } catch (e: any) {
    // ✅ Return Stripe’s useful fields so we can see the REAL problem
    return NextResponse.json(
      {
        error: "stripe_products_list_failed",
        message: String(e?.message ?? e),
        stripe: {
          type: e?.type ?? null,
          code: e?.code ?? null,
          statusCode: e?.statusCode ?? null,
          requestId: e?.requestId ?? null,
          rawType: e?.raw?.type ?? null,
          rawCode: e?.raw?.code ?? null,
        },
        ctx: {
          livemode: billingCtx.livemode,
          stripeAccountId,
        },
      },
      { status: 500 }
    );
  }
}
