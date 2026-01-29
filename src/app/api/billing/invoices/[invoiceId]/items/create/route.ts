// src/app/api/billing/invoices/[invoiceId]/items/create/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const { stripeAccountId, livemode } = auth.ctx;
  const stripe = getStripe(livemode ? "live" : "test");

  // ✅ Next expects params as Promise in this build; unwrap directly
  const { invoiceId: raw } = await ctx.params;
  const rawInvoiceId = String(raw ?? "").trim();

  if (!rawInvoiceId || rawInvoiceId === "undefined" || rawInvoiceId === "null") {
    return NextResponse.json(
      { error: "missing_invoiceId", hint: "Route param invoiceId was empty/undefined." },
      { status: 400 }
    );
  }

  const invoiceId = decodeURIComponent(rawInvoiceId);
  const body = await req.json().catch(() => ({} as any));

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
      return NextResponse.json({ error: "invoice_missing_customer" }, { status: 400 });
    }

    const mode = String((body as any)?.mode ?? "custom").toLowerCase();

    // -----------------------------
    // MODE: "price" (Stripe Price)
    // -----------------------------
    if (mode === "price") {
      const priceId = String((body as any)?.priceId ?? "").trim();
      const quantity = Math.max(1, Number((body as any)?.quantity) || 1);

      if (!priceId) {
        return NextResponse.json({ error: "missing_priceId" }, { status: 400 });
      }

      const item = await stripe.invoiceItems.create(
        {
          customer: customerId,
          invoice: invoiceId,
          price: priceId,
          quantity,
        } as any,
        { stripeAccount: stripeAccountId }
      );

      return NextResponse.json({ item });
    }

    // -----------------------------
    // MODE: "custom"
    // Stripe rule:
    // - You cannot send amount + quantity.
    // - For qty > 1, use unit_amount_decimal + quantity.
    // - For qty == 1, use amount ONLY.
    // -----------------------------
    const currency = String((body as any)?.currency ?? "").trim().toLowerCase();
    const amountSmallest = Number(
      (body as any)?.amount ??
        (body as any)?.amount_cents ??
        (body as any)?.unit_amount
    );
    const quantity = Math.max(1, Number((body as any)?.quantity) || 1);

    const description =
      (body as any)?.description !== undefined && (body as any)?.description !== null
        ? String((body as any)?.description)
        : undefined;

    if (!currency) {
      return NextResponse.json({ error: "missing_currency" }, { status: 400 });
    }

    if (!Number.isFinite(amountSmallest) || amountSmallest <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const amountInt = Math.round(amountSmallest);

    const createParams: any =
      quantity > 1
        ? {
            customer: customerId,
            invoice: invoiceId,
            currency,
            unit_amount_decimal: String(amountInt),
            quantity,
            description,
          }
        : {
            customer: customerId,
            invoice: invoiceId,
            currency,
            amount: amountInt,
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
