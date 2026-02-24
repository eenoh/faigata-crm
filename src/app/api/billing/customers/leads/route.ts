// src/app/api/billing/customers/leads/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";

export const runtime = "nodejs";

const leadLabel = (l: any) =>
  String(l?.lead_name ?? "").trim() ||
  String(l?.primary_contact_value ?? "").trim() ||
  l?.id ||
  "Lead";

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const { orgId } = auth.ctx;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const sb = adminClient();
  let query = sb
    .from("leads")
    .select(
      "id, lead_name, stage, created_at, primary_contact_type, primary_contact_value",
    )
    .eq("team_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q)
    query = query.or(
      `lead_name.ilike.%${q}%,primary_contact_value.ilike.%${q}%`,
    );

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    leads: (data ?? []).map((l: any) => ({
      id: l.id,
      label: leadLabel(l),
      stage: l.stage ?? "—",
      created_at: l.created_at,
      primary_contact_type: l.primary_contact_type ?? null,
      primary_contact_value: l.primary_contact_value ?? null,
    })),
  });
}
