// src/app/api/billing/customers/leads/route.ts
import { NextResponse } from "next/server";
import { applyEntityTranslations } from "@/features/crm/server/custom-value-translations";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";

export const runtime = "nodejs";

type LeadOptionRow = {
  id: string;
  lead_name: string | null;
  stage: string | null;
  stage_id: string | null;
  created_at: string;
  primary_contact_type: string | null;
  primary_contact_value: string | null;
};

function leadLabel(lead: LeadOptionRow) {
  return (
    String(lead.lead_name ?? "").trim() ||
    String(lead.primary_contact_value ?? "").trim() ||
    lead.id ||
    "Lead"
  );
}

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const { teamId, userId } = auth.ctx;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const sb = adminClient();
  const requestedLocale = await resolveRequestLocale({
    request: req,
    admin: sb as any,
    userId,
  });

  let query = sb
    .from("leads")
    .select(
      "id, lead_name, stage, stage_id, created_at, primary_contact_type, primary_contact_value",
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    query = query.or(
      `lead_name.ilike.%${q}%,primary_contact_value.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const leads = (Array.isArray(data) ? data : []) as LeadOptionRow[];

  await applyEntityTranslations({
    admin: sb as any,
    teamId,
    entityTable: "leads",
    rows: leads,
    requestedLocale,
    fields: [
      {
        fieldKey: "lead_name",
        sourceText: (row) => row.lead_name ?? "",
        assign: (row, value) => {
          row.lead_name = value;
        },
      },
    ],
  });

  const stageIds = Array.from(
    new Set(
      leads
        .map((lead) =>
          typeof lead.stage_id === "string" ? lead.stage_id.trim() : "",
        )
        .filter(Boolean),
    ),
  );

  if (stageIds.length > 0) {
    const { data: stageData } = await sb
      .from("pipeline_stages")
      .select("id, name")
      .eq("team_id", teamId)
      .in("id", stageIds);

    const stages = (Array.isArray(stageData)
      ? stageData
      : []) as Array<{ id: string; name: string }>;

    await applyEntityTranslations({
      admin: sb as any,
      teamId,
      entityTable: "pipeline_stages",
      rows: stages,
      requestedLocale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name,
          assign: (row, value) => {
            row.name = value;
          },
        },
      ],
    });

    const stageNameById = new Map(stages.map((stage) => [stage.id, stage.name]));
    for (const lead of leads) {
      if (lead.stage_id && stageNameById.has(lead.stage_id)) {
        lead.stage = stageNameById.get(lead.stage_id) ?? lead.stage;
      }
    }
  }

  return NextResponse.json({
    leads: leads.map((lead) => ({
      id: lead.id,
      label: leadLabel(lead),
      stage: lead.stage ?? "-",
      created_at: lead.created_at,
      primary_contact_type: lead.primary_contact_type ?? null,
      primary_contact_value: lead.primary_contact_value ?? null,
    })),
  });
}
