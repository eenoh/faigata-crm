// src/app/api/integrations/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getStripe } from "@/lib/stripeServer";

export const runtime = "nodejs";

async function getRawBody(req: Request) {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function isoFromUnixSeconds(sec: number | null | undefined) {
  if (typeof sec !== "number") return null;
  return new Date(sec * 1000).toISOString();
}

function extractInvoiceIdFromCharge(chargeResponse: unknown): string | null {
  const ch: any = chargeResponse as any;
  const inv = ch?.invoice;
  if (!inv) return null;
  if (typeof inv === "string") return inv;
  if (typeof inv === "object" && typeof inv.id === "string") return inv.id;
  return null;
}

function pickCustomerIdFromInvoice(inv: Stripe.Invoice): string | null {
  const c: any = inv.customer as any;
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && typeof c.id === "string") return c.id;
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  if (!secret) {
    return NextResponse.json({ error: "missing_webhook_secret" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const raw = await getRawBody(req);

  // Use your server helper (test)
  const stripe = getStripe("test");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err: any) {
    return NextResponse.json(
      { error: "invalid_signature", detail: err?.message },
      { status: 400 }
    );
  }

  const sb = adminClient();

  // Optional idempotency log (keep your behavior)
  {
    const { error: logErr } = await sb.from("organization_stripe_webhook_events").insert({
      stripe_event_id: event.id,
      livemode: event.livemode,
      type: event.type,
      payload: event as any,
    });
    void logErr;
  }

  // Map connected account -> org_id
  const stripeAccountId = req.headers.get("stripe-account"); // acct_...
  let orgId: string | null = null;

  if (stripeAccountId) {
    const { data, error } = await sb
      .from("organization_stripe_accounts")
      .select("org_id")
      .eq("stripe_account_id", stripeAccountId)
      .eq("livemode", event.livemode)
      .maybeSingle();

    if (!error) {
      orgId = (data?.org_id as string | null) ?? null;
    }
  }

  // If we can't map org, acknowledge webhook but do nothing
  if (!orgId) {
    return NextResponse.json({ received: true, unmapped: true });
  }

  // -----------------------
  // 1) INVOICE EVENTS (NEW)
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

    return NextResponse.json({ received: true });
  }

  // -------------------------------------------------------
  // 2) PAYMENT EVENTS (your existing behavior, unchanged)
  // -------------------------------------------------------
  const isPaymentEvent =
    event.type.startsWith("payment_intent.") || event.type.startsWith("charge.");

  if (isPaymentEvent) {
    const obj = event.data.object as any;

    let pi: Stripe.PaymentIntent | null = null;
    let chargeId: string | null = null;

    if (event.type.startsWith("payment_intent.")) {
      pi = obj as Stripe.PaymentIntent;
      chargeId = (pi.latest_charge as string | null) ?? null;
    } else if (event.type.startsWith("charge.")) {
      const ch = obj as Stripe.Charge;
      chargeId = ch.id;

      const piId = (ch.payment_intent as string | null) ?? null;
      if (piId && stripeAccountId) {
        pi = await stripe.paymentIntents.retrieve(piId, {
          stripeAccount: stripeAccountId,
        });
      }
    }

    if (pi) {
      const createdAtStripe = isoFromUnixSeconds(pi.created);

      let invoiceId: string | null = null;
      let paidAt: string | null = null;

      if (chargeId && stripeAccountId) {
        const chRes = await stripe.charges.retrieve(chargeId, {
          stripeAccount: stripeAccountId,
        });

        invoiceId = extractInvoiceIdFromCharge(chRes);

        if (pi.status === "succeeded") {
          const chAny: any = chRes as any;
          paidAt = isoFromUnixSeconds(chAny?.created) ?? new Date().toISOString();
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
    }
  }

  return NextResponse.json({ received: true });
}
