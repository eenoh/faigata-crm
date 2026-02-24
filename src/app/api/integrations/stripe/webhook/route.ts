// src/app/api/integrations/stripe/webhook/route.ts

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getStripe } from "@/lib/stripeServer";

export const runtime = "nodejs";

const ok = (body: Record<string, unknown> = { received: true }) =>
  NextResponse.json(body);

const err = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

const rawBody = async (req: Request) => Buffer.from(await req.arrayBuffer());

const isoFromUnixSeconds = (sec: number | null | undefined) =>
  typeof sec === "number" ? new Date(sec * 1000).toISOString() : null;

const extractInvoiceIdFromCharge = (chargeResponse: unknown): string | null => {
  const inv: any = (chargeResponse as any)?.invoice;
  if (!inv) return null;
  if (typeof inv === "string") return inv;
  if (typeof inv === "object" && typeof inv.id === "string") return inv.id;
  return null;
};

const pickCustomerIdFromInvoice = (inv: Stripe.Invoice): string | null => {
  const c: any = inv.customer as any;
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && typeof c.id === "string") return c.id;
  return null;
};

async function mapOrgIdFromStripeAccount(
  sb: ReturnType<typeof adminClient>,
  stripeAccountId: string | null,
  livemode: boolean,
) {
  if (!stripeAccountId) return null;

  const { data, error } = await sb
    .from("organization_stripe_accounts")
    .select("org_id")
    .eq("stripe_account_id", stripeAccountId)
    .eq("livemode", livemode)
    .maybeSingle();

  if (error) return null;
  return (data?.org_id as string | null) ?? null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!secret) return err("missing_webhook_secret", 500);

  const sig = req.headers.get("stripe-signature");
  if (!sig) return err("missing_signature", 400);

  const stripeAccountId = req.headers.get("stripe-account"); // acct_...
  const stripe = getStripe("test");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), sig, secret);
  } catch (e: any) {
    return err("invalid_signature", 400, { detail: e?.message });
  }

  const sb = adminClient();

  // Optional idempotency log (kept)
  {
    const { error: logErr } = await sb
      .from("organization_stripe_webhook_events")
      .insert({
        stripe_event_id: event.id,
        livemode: event.livemode,
        type: event.type,
        payload: event as any,
      });
    void logErr;
  }

  const orgId = await mapOrgIdFromStripeAccount(
    sb,
    stripeAccountId,
    event.livemode,
  );

  // If we can't map org, acknowledge webhook but do nothing
  if (!orgId) return ok({ received: true, unmapped: true });

  // -----------------------
  // 1) INVOICE EVENTS
  // -----------------------
  if (event.type.startsWith("invoice.")) {
    const inv = event.data.object as Stripe.Invoice;

    const row = {
      org_id: orgId,
      livemode: event.livemode,

      stripe_invoice_id: inv.id,
      stripe_customer_id: pickCustomerIdFromInvoice(inv),

      number: inv.number ?? null,
      status: inv.status ?? null,

      currency: inv.currency ?? null,
      total: inv.total ?? null,
      amount_due: inv.amount_due ?? null,
      amount_paid: inv.amount_paid ?? null,

      created_at_stripe: isoFromUnixSeconds(inv.created),
      due_date: isoFromUnixSeconds(inv.due_date),

      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf: inv.invoice_pdf ?? null,

      raw: inv as any,
    };

    const { error: upsertErr } = await sb
      .from("organization_stripe_invoices")
      .upsert(row, { onConflict: "org_id,livemode,stripe_invoice_id" });

    void upsertErr;
    return ok();
  }

  // -----------------------
  // 2) PAYMENT EVENTS
  // -----------------------
  const isPaymentEvent =
    event.type.startsWith("payment_intent.") ||
    event.type.startsWith("charge.");

  if (!isPaymentEvent) return ok();

  const obj = event.data.object as any;

  let pi: Stripe.PaymentIntent | null = null;
  let chargeId: string | null = null;

  if (event.type.startsWith("payment_intent.")) {
    pi = obj as Stripe.PaymentIntent;
    chargeId = (pi.latest_charge as string | null) ?? null;
  } else {
    const ch = obj as Stripe.Charge;
    chargeId = ch.id;

    const piId = (ch.payment_intent as string | null) ?? null;
    if (piId && stripeAccountId) {
      pi = await stripe.paymentIntents.retrieve(piId, {
        stripeAccount: stripeAccountId,
      });
    }
  }

  if (!pi) return ok();

  const createdAtStripe = isoFromUnixSeconds(pi.created);

  let invoiceId: string | null = null;
  let paidAt: string | null = null;

  if (chargeId && stripeAccountId) {
    const chRes = await stripe.charges.retrieve(chargeId, {
      stripeAccount: stripeAccountId,
    });

    invoiceId = extractInvoiceIdFromCharge(chRes);

    if (pi.status === "succeeded") {
      paidAt =
        isoFromUnixSeconds((chRes as any)?.created) ?? new Date().toISOString();
    }
  } else if (pi.status === "succeeded") {
    paidAt = new Date().toISOString();
  }

  const row = {
    org_id: orgId,
    livemode: event.livemode,

    stripe_payment_intent_id: pi.id,
    stripe_charge_id: chargeId,
    stripe_customer_id: (pi.customer as string | null) ?? null,
    stripe_invoice_id: invoiceId,

    customer_email: (pi.receipt_email as string | null) ?? null,
    customer_name: (pi.shipping?.name as string | null) ?? null,

    description: (pi.description as string | null) ?? null,
    amount: pi.amount ?? 0,
    amount_received: pi.amount_received ?? 0,
    currency: pi.currency ?? "usd",
    status: pi.status ?? "unknown",

    created_at_stripe: createdAtStripe,
    paid_at: paidAt,

    raw: pi as any,
  };

  const { error: upsertErr } = await sb
    .from("organization_stripe_payments")
    .upsert(row, { onConflict: "org_id,livemode,stripe_payment_intent_id" });

  void upsertErr;

  return ok();
}
