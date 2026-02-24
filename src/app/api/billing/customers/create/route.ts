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
      { status: 401 },
    );
  }

  const { orgId, livemode, stripeAccountId } = auth.ctx;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const leadId = String(body.leadId ?? "").trim();
  if (!leadId)
    return NextResponse.json({ error: "missing_leadId" }, { status: 400 });

  const s = (v: unknown) => {
    const t = String(v ?? "").trim();
    return t ? t : null;
  };

  const stripe = getStripe(livemode ? "live" : "test");

  try {
    const customer = await stripe.customers.create(
      {
        name: s(body.name) ?? undefined,
        email: s(body.email) ?? undefined,
        phone: s(body.phone) ?? undefined,
      },
      { stripeAccount: stripeAccountId },
    );

    const { error } = await adminClient()
      .from("organization_stripe_customers")
      .upsert(
        {
          org_id: orgId,
          livemode,
          stripe_customer_id: customer.id,
          lead_id: leadId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,livemode,stripe_customer_id" },
      );

    if (error) {
      return NextResponse.json(
        { error: "db_upsert_failed", details: error },
        { status: 500 },
      );
    }

    return NextResponse.json({ customer });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 },
    );
  }
}
