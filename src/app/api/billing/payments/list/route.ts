// src/app/api/billing/payments/list/route.ts
import { NextResponse } from "next/server";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";

function normalize(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  // ✅ ALWAYS use billing context (org + livemode + connected stripe account)
  const { orgId, livemode, stripeAccountId } = auth.ctx;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") ?? "20")));

  const sb = adminClient();

  let query = sb
    .from("organization_stripe_payments")
    .select(
      `
      stripe_payment_intent_id,
      stripe_charge_id,
      customer_email,
      customer_name,
      description,
      amount,
      amount_received,
      currency,
      status,
      created_at_stripe
      `,
      { count: "exact" }
    )
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .order("created_at_stripe", { ascending: false });

  if (status) query = query.eq("status", status);

  // ✅ Safe search: doesn’t depend on a tsvector column existing
  if (q) {
    const needle = normalize(q);
    // supabase .or(...) uses comma-separated filters
    query = query.or(
      [
        `stripe_payment_intent_id.ilike.%${needle}%`,
        `stripe_charge_id.ilike.%${needle}%`,
        `customer_email.ilike.%${needle}%`,
        `customer_name.ilike.%${needle}%`,
        `description.ilike.%${needle}%`,
        `status.ilike.%${needle}%`,
      ].join(",")
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "db_query_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    // ✅ helpful for debugging you’re reading the connected account
    stripeAccountId,
    livemode,
    items: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    q,
    status,
  });
}
  