// src/app/api/billing/invoices/create/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

function cleanCustomerId(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;

  // Stripe customers are usually cus_...
  // If you ever pass other ids, loosen/remove this check.
  if (!/^cus_[A-Za-z0-9]+$/.test(s)) return null;

  return s;
}

function pickCollectionMethod(
  v: unknown,
): "send_invoice" | "charge_automatically" {
  const s = String(v ?? "send_invoice").toLowerCase();
  return s === "charge_automatically" ? "charge_automatically" : "send_invoice";
}

export async function POST(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => ({}) as any);

  const customerId = cleanCustomerId(body.customerId);
  if (!customerId) {
    return NextResponse.json(
      {
        error: "invalid_customerId",
        hint: "Expected a Stripe customer id like cus_123...",
      },
      { status: 400 },
    );
  }

  const collection_method = pickCollectionMethod(body.collection_method);

  const days_until_due =
    collection_method === "send_invoice"
      ? Math.max(0, Number(body.days_until_due) || 7)
      : undefined;

  const memo = String(body.memo ?? "").trim();
  const description =
    memo || String(body.description ?? "").trim() || undefined;

  const stripe = getStripe(auth.ctx.livemode ? "live" : "test");

  try {
    const inv = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method,
        ...(collection_method === "send_invoice" ? { days_until_due } : {}),
        ...(description ? { description } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
      },
      { stripeAccount: auth.ctx.stripeAccountId },
    );

    return NextResponse.json({
      invoice: {
        id: inv.id,
        status: inv.status ?? null,
        currency: inv.currency ?? null,
        total: inv.total ?? null,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 },
    );
  }
}
