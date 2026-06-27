import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import {
  createSupabaseBillingCustomerMappingStore,
  saveBillingCustomerMapping,
} from "@/features/billing/server/customer-mappings";
import { billingContextErrorResponse } from "@/features/billing/server/http";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { syncBillingCustomerNameTranslationSources } from "@/features/billing/server/translations";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const billing = await getAuthedBillingContextWithReason(req);
  if (!billing.ok) {
    return billingContextErrorResponse(billing);
  }

  const { orgId, livemode, stripeAccountId, userId } = billing.ctx;
  const sb = getSupabaseAdminClient();
  const sourceLocale = await resolveRequestLocale({
    request: req,
    admin: sb,
    userId,
  });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const leadId = String(body.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "missing_leadId" }, { status: 400 });
  }

  const s = (v: unknown) => {
    const t = String(v ?? "").trim();
    return t ? t : null;
  };

  const stripe = getStripeClientForLivemode(livemode);

  try {
    const customer = await stripe.customers.create(
      {
        name: s(body.name) ?? undefined,
        email: s(body.email) ?? undefined,
        phone: s(body.phone) ?? undefined,
      },
      { stripeAccount: stripeAccountId },
    );

    const store = createSupabaseBillingCustomerMappingStore(sb);
    const { error } = await saveBillingCustomerMapping(store, {
      orgId,
      livemode,
      stripeCustomerId: customer.id,
      leadId,
    });

    if (error) {
      return NextResponse.json(
        {
          error: "customer_mapping_save_failed",
          message: error.message ?? "Failed to save the customer mapping.",
          details: error,
        },
        { status: 500 },
      );
    }

    if (customer.name) {
      try {
        await syncBillingCustomerNameTranslationSources({
          admin: sb as any,
          orgId,
          livemode,
          sourceLocale,
          rows: [
            {
              customerId: customer.id,
              name: customer.name,
            },
          ],
        });
      } catch (translationError) {
        console.error(
          "[billing-customers-create] translation source sync failed",
          translationError,
        );
      }
    }

    return NextResponse.json({ customer });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 },
    );
  }
}
