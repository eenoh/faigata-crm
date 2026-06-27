import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import {
  createSupabaseBillingCustomerMappingStore,
  saveBillingCustomerMapping,
} from "@/features/billing/server/customer-mappings";
import { billingContextErrorResponse } from "@/features/billing/server/http";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const billing = await getAuthedBillingContextWithReason(request);
  if (!billing.ok) {
    return billingContextErrorResponse(billing);
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const stripeCustomerId = String(body.stripeCustomerId ?? "").trim();
  const leadId = String(body.leadId ?? "").trim();

  if (!stripeCustomerId) {
    return NextResponse.json({ error: "missing_stripe_customer_id" }, { status: 400 });
  }

  if (!leadId) {
    return NextResponse.json({ error: "missing_lead_id" }, { status: 400 });
  }

  const store = createSupabaseBillingCustomerMappingStore(getSupabaseAdminClient());
  const result = await saveBillingCustomerMapping(store, {
    orgId: billing.ctx.orgId,
    livemode: billing.ctx.livemode,
    stripeCustomerId,
    leadId,
  });

  if (result.error) {
    return NextResponse.json(
      {
        error: "customer_mapping_save_failed",
        message: result.error.message ?? "Failed to save customer mapping.",
        details: result.error,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
