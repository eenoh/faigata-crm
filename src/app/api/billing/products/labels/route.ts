// src/app/api/billing/products/labels/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

function jsonError(error: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

function isStripeProductId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id);
}

function isStripeAccountId(v: unknown) {
  return /^acct_[a-zA-Z0-9]+$/.test(String(v ?? "").trim());
}

export async function POST(req: NextRequest) {
  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) return jsonError("unauthorized", 401);

  const stripeAccountId = String(billingCtx.stripeAccountId ?? "").trim();
  if (!stripeAccountId) return jsonError("missing_stripe_account_id", 400);
  if (!isStripeAccountId(stripeAccountId)) return jsonError("invalid_stripe_account_id", 400, { stripeAccountId });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json_body", 400);
  }

  const idsRaw = (body as any)?.ids;
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(idsRaw) ? idsRaw : [])
        .map((x) => String(x ?? "").trim())
        .filter((x): x is string => Boolean(x) && isStripeProductId(x))
    )
  );

  if (ids.length === 0) return NextResponse.json({ ok: true, labels: {} });

  try {
    const stripe = stripeClient(billingCtx.livemode);

    const labels: Record<string, string> = {};

    await Promise.all(
      ids.map(async (id: string) => {
        try {
          const p = await stripe.products.retrieve(id, { expand: [] }, { stripeAccount: stripeAccountId });
          const name = String(p?.name ?? "").trim();
          if (name) labels[id] = name;
        } catch {
          // ignore missing/forbidden product ids
        }
      })
    );

    return NextResponse.json({ ok: true, labels });
  } catch (e: any) {
    return jsonError("stripe_products_labels_failed", 500, {
      message: String(e?.message ?? e),
      stripe: {
        type: e?.type ?? null,
        code: e?.code ?? null,
        statusCode: e?.statusCode ?? null,
        requestId: e?.requestId ?? null,
      },
    });
  }
}
