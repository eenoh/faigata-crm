// src/app/api/billing/invoices/[invoiceId]/items/create/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

function cleanParam(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return null;
  return decodeURIComponent(s);
}

function toStr(v: unknown) {
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function toLower(v: unknown) {
  return toStr(v).toLowerCase();
}

function toQty(v: unknown) {
  return Math.max(1, Number(v) || 1);
}

function toAmountSmallest(body: any) {
  const n = Number(body?.amount ?? body?.amount_cents ?? body?.unit_amount);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const invoiceId = cleanParam((await ctx.params).invoiceId);
  if (!invoiceId) {
    return NextResponse.json(
      {
        error: "missing_invoiceId",
        hint: "Route param invoiceId was empty/undefined.",
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}) as any);

  const stripe = getStripe(auth.ctx.livemode ? "live" : "test");
  const stripeAccount = { stripeAccount: auth.ctx.stripeAccountId };

  try {
    // Ensure invoice exists + resolve customer id
    const inv = await stripe.invoices.retrieve(invoiceId, {}, stripeAccount);

    const customerId =
      typeof inv.customer === "string"
        ? inv.customer
        : (inv.customer as any)?.id;

    if (!customerId) {
      return NextResponse.json(
        { error: "invoice_missing_customer" },
        { status: 400 },
      );
    }

    const mode = toLower(body?.mode ?? "custom");

    // -----------------------------
    // MODE: "price"
    // -----------------------------
    if (mode === "price") {
      const priceId = toStr(body?.priceId);
      const quantity = toQty(body?.quantity);

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
        stripeAccount,
      );

      return NextResponse.json({ item });
    }

    // -----------------------------
    // MODE: "custom"
    // Stripe rule:
    // - qty > 1 -> unit_amount_decimal + quantity
    // - qty == 1 -> amount only
    // -----------------------------
    const currency = toLower(body?.currency);
    const quantity = toQty(body?.quantity);
    const amountInt = toAmountSmallest(body);

    const descRaw = body?.description;
    const description =
      descRaw === undefined || descRaw === null ? undefined : String(descRaw);

    if (!currency) {
      return NextResponse.json({ error: "missing_currency" }, { status: 400 });
    }

    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const createParams =
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

    const item = await stripe.invoiceItems.create(
      createParams as any,
      stripeAccount,
    );

    return NextResponse.json({ item });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 },
    );
  }
}
