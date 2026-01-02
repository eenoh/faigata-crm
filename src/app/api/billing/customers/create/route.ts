// src/app/api/billing/customers/create/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const { orgId, livemode, stripeAccountId } = auth.ctx;

  const body = await req.json().catch(() => ({}));
  const leadId = String(body.leadId ?? "").trim();
  const name = String(body.name ?? "").trim() || null;
  const email = String(body.email ?? "").trim() || null;
  const phone = String(body.phone ?? "").trim() || null;

  if (!leadId) {
    return NextResponse.json({ error: "missing_leadId" }, { status: 400 });
  }

  try {
    const stripe = getStripe(livemode ? "live" : "test");

    // Create Stripe customer in the connected account
    const customer = await stripe.customers.create(
      {
        name: name ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
      },
      { stripeAccount: stripeAccountId }
    );

    // Link to your DB mapping table
    const sb = adminClient();
    const { error: upsertErr } = await sb
      .from("organization_stripe_customers")
      .upsert(
        {
          org_id: orgId,
          livemode,
          stripe_customer_id: customer.id,
          lead_id: leadId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,livemode,stripe_customer_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: "db_upsert_failed", details: upsertErr },
        { status: 500 }
      );
    }

    return NextResponse.json({ customer });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 }
    );
  }
}
