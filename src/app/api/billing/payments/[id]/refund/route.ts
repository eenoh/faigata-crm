// src/app/api/billing/payments/[id]/refund/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";

import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";

type RefundBody = {
  amount?: number | null; // in cents (optional partial refund)
  reason?: "duplicate" | "fraudulent" | "requested_by_customer" | null;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params; // ✅ Next 15: params is Promise
  const paymentIntentId = String(id ?? "").trim();

  if (!paymentIntentId) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason, details: auth.details ?? null },
      { status: 401 }
    );
  }

  const ctxBilling = auth.ctx;
  const stripe = stripeClient(ctxBilling.livemode);

  const body = (await req.json().catch(() => null)) as RefundBody | null;

  try {
    // Retrieve PI to determine charge (most common)
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      stripeAccount: ctxBilling.stripeAccountId,
    });

    const chargeId =
      typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : (pi.latest_charge as any)?.id ?? null;

    if (!chargeId) {
      return NextResponse.json(
        { error: "missing_charge", message: "No latest_charge found for this PaymentIntent." },
        { status: 400 }
      );
    }

    const refund = await stripe.refunds.create(
      {
        charge: chargeId,
        amount: typeof body?.amount === "number" ? body.amount : undefined,
        reason: body?.reason ?? undefined,
      },
      { stripeAccount: ctxBilling.stripeAccountId }
    );

    return NextResponse.json({ ok: true, refund });
  } catch (e: any) {
    return NextResponse.json(
      { error: "refund_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
