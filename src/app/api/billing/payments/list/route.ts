// src/app/api/billing/payments/list/route.ts
import { NextResponse } from "next/server";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function clampInt(
  v: string | null,
  { min, max, fallback }: { min: number; max: number; fallback: number },
) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function escapeIlike(s: string) {
  // Escape %, _ for LIKE/ILIKE patterns
  return s.replace(/[%_]/g, "\\$&");
}

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const { orgId, livemode, stripeAccountId } = auth.ctx;

  const url = new URL(req.url);
  const qRaw = url.searchParams.get("q");
  const statusRaw = url.searchParams.get("status");

  const q = norm(qRaw);
  const status = norm(statusRaw);

  const page = clampInt(url.searchParams.get("page"), {
    min: 1,
    max: 10_000,
    fallback: 1,
  });
  const pageSize = clampInt(url.searchParams.get("pageSize"), {
    min: 10,
    max: 50,
    fallback: 20,
  });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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
      { count: "exact" },
    )
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .order("created_at_stripe", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  if (q) {
    const needle = escapeIlike(q);
    query = query.or(
      [
        `stripe_payment_intent_id.ilike.%${needle}%`,
        `stripe_charge_id.ilike.%${needle}%`,
        `customer_email.ilike.%${needle}%`,
        `customer_name.ilike.%${needle}%`,
        `description.ilike.%${needle}%`,
        `status.ilike.%${needle}%`,
      ].join(","),
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: "db_query_failed", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    stripeAccountId,
    livemode,
    items: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
    q: qRaw?.trim() ?? "",
    status: statusRaw?.trim() ?? "",
  });
}
