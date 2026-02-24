// src/app/api/billing/payments/[id]/refund/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";

type RefundBody = {
  amount?: number | null; // cents
  reason?: "duplicate" | "fraudulent" | "requested_by_customer" | null;
};

function cleanId(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;

  // Stripe PaymentIntent ids look like pi_...
  if (!/^pi_[A-Za-z0-9]+$/.test(s)) return null;

  return s;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const paymentIntentId = cleanId((await ctx.params).id);

  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "invalid_payment_intent_id" },
      { status: 400 },
    );
  }

  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const stripe = stripeClient(auth.ctx.livemode);

  const body = (await req.json().catch(() => ({}))) as RefundBody;

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      stripeAccount: auth.ctx.stripeAccountId,
    });

    const chargeId =
      typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : ((pi.latest_charge as any)?.id ?? null);

    if (!chargeId) {
      return NextResponse.json({ error: "missing_charge" }, { status: 400 });
    }

    const refund = await stripe.refunds.create(
      {
        charge: chargeId,
        ...(typeof body.amount === "number" ? { amount: body.amount } : {}),
        ...(body.reason ? { reason: body.reason } : {}),
      },
      { stripeAccount: auth.ctx.stripeAccountId },
    );

    return NextResponse.json({ ok: true, refund });
  } catch (e: any) {
    return NextResponse.json(
      { error: "refund_failed", message: e?.message ?? "stripe_error" },
      { status: 500 },
    );
  }
}
