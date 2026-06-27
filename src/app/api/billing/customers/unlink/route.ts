import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import {
  clearBillingCustomerLeadLink,
  createSupabaseBillingCustomerMappingStore,
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

  if (!stripeCustomerId) {
    return NextResponse.json({ error: "missing_stripe_customer_id" }, { status: 400 });
  }

  const store = createSupabaseBillingCustomerMappingStore(getSupabaseAdminClient());
  const result = await clearBillingCustomerLeadLink(store, {
    orgId: billing.ctx.orgId,
    livemode: billing.ctx.livemode,
    stripeCustomerId,
  });

  if (result.error) {
    return NextResponse.json(
      {
        error: "customer_mapping_clear_failed",
        message: result.error.message ?? "Failed to clear customer mapping.",
        details: result.error,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
