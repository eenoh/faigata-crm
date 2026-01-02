// src/app/api/billing/invoices/[invoiceId]/items/create/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ invoiceId: string }> | { invoiceId: string };
  }
) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const stripe = getStripe("test");
  const { stripeAccountId } = auth.ctx;

  // ✅ Unwrap params (Next can pass Promise-like params)
  const resolved = await Promise.resolve(params);
  const rawInvoiceId = String(resolved?.invoiceId ?? "").trim();

  if (!rawInvoiceId || rawInvoiceId === "undefined" || rawInvoiceId === "null") {
    return NextResponse.json(
      {
        error: "missing_invoiceId",
        hint: "Route param invoiceId was empty/undefined.",
      },
      { status: 400 }
    );
  }

  const invoiceId = decodeURIComponent(rawInvoiceId);
  const body = await req.json().catch(() => ({}));

  try {
    // Ensure invoice exists and resolve customer
    const inv = await stripe.invoices.retrieve(
      invoiceId,
      {},
      { stripeAccount: stripeAccountId }
    );

    const customerId =
      typeof inv.customer === "string"
        ? inv.customer
        : (inv.customer as any)?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: "invoice_missing_customer" },
        { status: 400 }
      );
    }

    const mode = String(body.mode ?? "custom").toLowerCase();

    // -----------------------------
    // MODE: "price" (Stripe Price)
    // -----------------------------
    if (mode === "price") {
      const priceId = String(body.priceId ?? "").trim();
      const quantity = Math.max(1, Number(body.quantity) || 1);

      if (!priceId) {
        return NextResponse.json({ error: "missing_priceId" }, { status: 400 });
      }

      const item = await stripe.invoiceItems.create(
        ({
          customer: customerId,
          invoice: invoiceId,
          price: priceId,
          quantity,
        } as any),
        { stripeAccount: stripeAccountId }
      );

      return NextResponse.json({ item });
    }

    // -----------------------------
    // MODE: "custom"
    //
    // Stripe rule:
    // - You cannot send amount + quantity.
    // - For qty > 1, use unit_amount_decimal + quantity.
    // - For qty == 1, use amount ONLY.
    // -----------------------------
    const currency = String(body.currency ?? "").trim().toLowerCase();
    const amountSmallest = Number(body.amount ?? body.amount_cents ?? body.unit_amount);
    const quantity = Math.max(1, Number(body.quantity) || 1);

    const description =
      body.description !== undefined && body.description !== null
        ? String(body.description)
        : undefined;

    if (!currency) {
      return NextResponse.json({ error: "missing_currency" }, { status: 400 });
    }

    if (!Number.isFinite(amountSmallest) || amountSmallest <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const amountInt = Math.round(amountSmallest);

    // ✅ IMPORTANT: choose correct Stripe params based on quantity
    const createParams: any =
      quantity > 1
        ? {
            customer: customerId,
            invoice: invoiceId,
            currency,
            unit_amount_decimal: String(amountInt), // supported by your Stripe API version
            quantity,
            description,
          }
        : {
            customer: customerId,
            invoice: invoiceId,
            currency,
            amount: amountInt, // quantity MUST be omitted when using amount
            description,
          };

    const item = await stripe.invoiceItems.create(createParams, {
      stripeAccount: stripeAccountId,
    });

    return NextResponse.json({ item });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 }
    );
  }
}
