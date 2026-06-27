import "server-only";

import type Stripe from "stripe";
import { jsonError, jsonOk } from "@/lib/http/responses";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  readStripeRawBody,
  verifyPlatformStripeWebhook,
} from "@/lib/stripe/webhooks";
import { getStripeClientForLivemode } from "@/lib/stripe/client";

function isoFromUnixSeconds(seconds: number | null | undefined) {
  return typeof seconds === "number"
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function extractInvoiceIdFromCharge(charge: unknown): string | null {
  const invoice = (charge as { invoice?: unknown } | null)?.invoice;

  if (typeof invoice === "string") return invoice;
  if (invoice && typeof invoice === "object" && "id" in invoice) {
    const id = (invoice as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }

  return null;
}

function pickCustomerId(invoice: Stripe.Invoice): string | null {
  const customer = invoice.customer;

  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object") {
    return typeof customer.id === "string" ? customer.id : null;
  }

  return null;
}

async function mapOrgIdFromStripeAccount(
  stripeAccountId: string | null,
  livemode: boolean,
) {
  if (!stripeAccountId) return null;

  const { data, error } = await getSupabaseAdminClient()
    .from("organization_stripe_accounts")
    .select("org_id")
    .eq("stripe_account_id", stripeAccountId)
    .eq("livemode", livemode)
    .maybeSingle();

  if (error) return null;

  return ((data as { org_id?: string } | null)?.org_id ?? null) as
    | string
    | null;
}

export async function handleStripePlatformWebhook(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonError("missing_signature", 400);

  let event: Stripe.Event;
  try {
    event = verifyPlatformStripeWebhook(
      await readStripeRawBody(request),
      signature,
    );
  } catch (error) {
    return jsonError("invalid_signature", 400, {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const stripeAccountId = request.headers.get("stripe-account");
  const supabase = getSupabaseAdminClient();

  const { error: webhookEventError } = await supabase
    .from("organization_stripe_webhook_events")
    .insert({
      stripe_event_id: event.id,
      livemode: event.livemode,
      type: event.type,
      payload: event,
    });

  if (webhookEventError?.code === "23505") {
    return jsonOk({ received: true, duplicate: true });
  }

  if (webhookEventError) {
    return jsonError("webhook_event_record_failed", 500, {
      detail: webhookEventError.message,
      code: webhookEventError.code,
    });
  }

  const orgId = await mapOrgIdFromStripeAccount(
    stripeAccountId,
    event.livemode,
  );

  if (!orgId) {
    return jsonOk({ received: true, unmapped: true });
  }

  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;

    await supabase.from("organization_stripe_invoices").upsert(
      {
        org_id: orgId,
        livemode: event.livemode,
        stripe_invoice_id: invoice.id,
        stripe_customer_id: pickCustomerId(invoice),
        number: invoice.number ?? null,
        status: invoice.status ?? null,
        currency: invoice.currency ?? null,
        total: invoice.total ?? null,
        amount_due: invoice.amount_due ?? null,
        amount_paid: invoice.amount_paid ?? null,
        created_at_stripe: isoFromUnixSeconds(invoice.created),
        due_date: isoFromUnixSeconds(invoice.due_date),
        hosted_invoice_url: invoice.hosted_invoice_url ?? null,
        invoice_pdf: invoice.invoice_pdf ?? null,
        raw: invoice,
      },
      { onConflict: "org_id,livemode,stripe_invoice_id" },
    );

    return jsonOk({ received: true });
  }

  const paymentEvent =
    event.type.startsWith("payment_intent.") || event.type.startsWith("charge.");

  if (!paymentEvent) {
    return jsonOk({ received: true });
  }

  const stripe = getStripeClientForLivemode(event.livemode);
  const object = event.data.object;

  let paymentIntent: Stripe.PaymentIntent | null = null;
  let chargeId: string | null = null;

  if (event.type.startsWith("payment_intent.")) {
    paymentIntent = object as Stripe.PaymentIntent;
    chargeId =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : null;
  } else {
    const charge = object as Stripe.Charge;
    chargeId = charge.id;

    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : null;

    if (paymentIntentId && stripeAccountId) {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        stripeAccount: stripeAccountId,
      });
    }
  }

  if (!paymentIntent) {
    return jsonOk({ received: true });
  }

  let invoiceId: string | null = null;
  let paidAt: string | null = null;

  if (chargeId && stripeAccountId) {
    const charge = await stripe.charges.retrieve(chargeId, {
      stripeAccount: stripeAccountId,
    });

    invoiceId = extractInvoiceIdFromCharge(charge);

    if (paymentIntent.status === "succeeded") {
      paidAt = isoFromUnixSeconds(charge.created) ?? new Date().toISOString();
    }
  } else if (paymentIntent.status === "succeeded") {
    paidAt = new Date().toISOString();
  }

  await supabase.from("organization_stripe_payments").upsert(
    {
      org_id: orgId,
      livemode: event.livemode,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: chargeId,
      stripe_customer_id:
        typeof paymentIntent.customer === "string"
          ? paymentIntent.customer
          : null,
      stripe_invoice_id: invoiceId,
      customer_email: paymentIntent.receipt_email ?? null,
      customer_name: paymentIntent.shipping?.name ?? null,
      description: paymentIntent.description ?? null,
      amount: paymentIntent.amount ?? 0,
      amount_received: paymentIntent.amount_received ?? 0,
      currency: paymentIntent.currency ?? "usd",
      status: paymentIntent.status ?? "unknown",
      created_at_stripe: isoFromUnixSeconds(paymentIntent.created),
      paid_at: paidAt,
      raw: paymentIntent,
    },
    { onConflict: "org_id,livemode,stripe_payment_intent_id" },
  );

  return jsonOk({ received: true });
}

