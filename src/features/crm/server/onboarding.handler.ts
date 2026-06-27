import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequestUser } from "@/features/auth/server/request-auth";
import { syncEntityTranslationSources } from "@/features/crm/server/custom-value-translations";
import { replaceLeadFieldOptions } from "@/features/crm/server/normalized-crm";
import { readJsonBody } from "@/lib/http/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildConversionMetricLabel } from "@/features/crm/utils/conversionMetrics";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";

export const runtime = "nodejs";

const ROLE_DB_MAP: Record<string, string> = {
  Prospector: "prospector",
  prospector: "prospector",
  Setter: "setter",
  setter: "setter",
  Closer: "closer",
  closer: "closer",
  Manager: "manager",
  manager: "manager",
  Admin: "admin",
  admin: "admin",
};

type OnboardingBody = {
  userId?: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  teamName?: string | null;
  timezone?: string | null;
  invites?: Array<{ email?: string | null; role?: string | null }>;
  fields?: Array<{
    key?: string | null;
    label?: string | null;
    type?: string | null;
    options?: string | null;
  }>;
  pipelineStages?: Array<{
    clientId?: string | null;
    name?: string | null;
  }>;
  conversionMetrics?: Array<{
    label?: string | null;
    fromStageClientId?: string | null;
    toStageClientId?: string | null;
  }>;
  importFileName?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<OnboardingBody>(request, {});
    const locale = await resolveRequestLocale({ request });
    const auth = await requireAuthenticatedRequestUser(request, body.userId);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseAdminClient();
    const metadata = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
    const userId = auth.userId;
    const firstName =
      body.firstName ??
      (typeof metadata.first_name === "string" ? metadata.first_name : null);
    const lastName =
      body.lastName ??
      (typeof metadata.last_name === "string" ? metadata.last_name : null);

    const adminRole = ROLE_DB_MAP.Admin;

    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .insert({ name: body.companyName || "Untitled organization" })
      .select("id")
      .single();

    if (organizationError) {
      console.error("[onboarding] organizations.insert", organizationError);
      throw organizationError;
    }

    const organizationId = organization.id as string;
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        name: body.teamName || "Sales Team",
        organization_id: organizationId,
        onboarding_completed: true,
      })
      .select("id")
      .single();

    if (teamError) {
      console.error("[onboarding] teams.insert", teamError);
      throw teamError;
    }

    const teamId = team.id as string;
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        company_id: organizationId,
        team_id: teamId,
        role: [adminRole],
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.error("[onboarding] profiles.upsert", profileError);
      throw profileError;
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from("team_members")
      .select("team_id,user_id")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMemberError) {
      console.error("[onboarding] team_members.select", existingMemberError);
      throw existingMemberError;
    }

    if (!existingMember) {
      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: userId,
        role: adminRole,
      });

      if (error) {
        console.error("[onboarding] team_members.insert", error);
        throw error;
      }
    }

    const invites = body.invites ?? [];
    const validInvites = invites.filter(
      (invite) => invite?.email && String(invite.email).trim() !== "",
    );
    if (validInvites.length > 0) {
      const { error } = await supabase.from("team_invites").insert(
        validInvites.map((invite) => ({
          team_id: teamId,
          email: String(invite.email).trim(),
          role: ROLE_DB_MAP[String(invite.role ?? "")] ?? "setter",
          invited_by: userId,
          token: randomUUID(),
        })),
      );

      if (error) {
        console.error("[onboarding] team_invites.insert", error);
        throw error;
      }
    }

    const fields = body.fields ?? [];
    if (fields.length > 0) {
      const rows = fields
        .map((field, index) => {
          const optionsArray =
            typeof field?.options === "string" && field.options.trim() !== ""
              ? field.options
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
              : [];

          return {
            team_id: teamId,
            key: String(field.key ?? "").trim(),
            label: String(field.label ?? "").trim(),
            type: field.type === "url" ? "text" : field.type,
            options: optionsArray,
            position: index,
          };
        })
        .filter((field) => field.key && field.label);

      if (rows.length > 0) {
        const { data: insertedFields, error } = await supabase
          .from("lead_fields")
          .insert(rows.map(({ options: _options, ...field }) => field))
          .select("id, key, label");
        if (error) {
          console.error("[onboarding] lead_fields.insert", error);
          throw error;
        }

        const optionsByKey = new Map(
          rows.map((field) => [field.key, Array.isArray(field.options) ? field.options : []]),
        );

        await Promise.all(
          ((Array.isArray(insertedFields) ? insertedFields : []) as any[]).map((row) =>
            replaceLeadFieldOptions({
              admin: supabase as any,
              fieldId: String(row.id ?? ""),
              options: optionsByKey.get(String(row.key ?? "")) ?? [],
            }),
          ),
        );

        await syncEntityTranslationSources({
          admin: supabase as any,
          teamId,
          entityTable: "lead_fields",
          rows: ((Array.isArray(insertedFields) ? insertedFields : []) as any[]).map(
            (row) => ({
              id: String(row.id ?? ""),
              label: String(row.label ?? ""),
            }),
          ),
          fields: [{ fieldKey: "label", sourceText: (row: any) => row.label }],
          sourceLocale: locale,
        });
      }
    }

    const stageIdByClientId: Record<string, string> = {};
    const pipelineStages = body.pipelineStages ?? [];
    if (pipelineStages.length > 0) {
      const rows = pipelineStages
        .map((stage, index) => ({
          clientId: String(stage?.clientId ?? "").trim(),
          team_id: teamId,
          name: String(stage?.name ?? "").trim(),
          position: index,
        }))
        .filter((stage) => stage.name.length > 0);

      if (rows.length > 0) {
        const { data: insertedStages, error } = await supabase
          .from("pipeline_stages")
          .insert(rows.map(({ clientId: _clientId, ...stage }) => stage))
          .select("id, name");

        if (error) {
          console.error("[onboarding] pipeline_stages.insert", error);
          throw error;
        }

        await syncEntityTranslationSources({
          admin: supabase as any,
          teamId,
          entityTable: "pipeline_stages",
          rows: ((Array.isArray(insertedStages) ? insertedStages : []) as any[]).map(
            (row) => ({
              id: String(row.id ?? ""),
              name: String(row.name ?? ""),
            }),
          ),
          fields: [{ fieldKey: "name", sourceText: (row: any) => row.name }],
          sourceLocale: locale,
        });

        rows.forEach((row, index) => {
          const insertedStage = insertedStages?.[index] as { id?: unknown } | undefined;
          if (row.clientId && insertedStage?.id) {
            stageIdByClientId[row.clientId] = String(insertedStage.id);
          }
        });
      }
    }

    const pipelineStageNameByClientId = Object.fromEntries(
      pipelineStages.map((stage) => [
        String(stage?.clientId ?? "").trim(),
        String(stage?.name ?? "").trim(),
      ]),
    );

    const conversionMetrics = body.conversionMetrics ?? [];
    if (conversionMetrics.length > 0) {
      const rows = conversionMetrics
        .map((metric, index) => {
          const fromClientId = String(metric?.fromStageClientId ?? "").trim();
          const toClientId = String(metric?.toStageClientId ?? "").trim();
          const fromId = stageIdByClientId[fromClientId];
          const toId = stageIdByClientId[toClientId];
          const fromName = pipelineStageNameByClientId[fromClientId];
          const toName = pipelineStageNameByClientId[toClientId];

          if (!fromId || !toId) return null;

          return {
            team_id: teamId,
            label:
              String(metric?.label ?? "").trim() ||
              buildConversionMetricLabel(fromName, toName) ||
              null,
            from_stage_id: fromId,
            to_stage_id: toId,
            position: index,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (rows.length > 0) {
        const { data: insertedMetrics, error } = await supabase
          .from("conversion_metrics")
          .insert(rows)
          .select("id, label");
        if (error) {
          console.error("[onboarding] conversion_metrics.insert", error);
          throw error;
        }

        await syncEntityTranslationSources({
          admin: supabase as any,
          teamId,
          entityTable: "conversion_metrics",
          rows: ((Array.isArray(insertedMetrics) ? insertedMetrics : []) as any[]).map(
            (row) => ({
              id: String(row.id ?? ""),
              label: String(row.label ?? ""),
            }),
          ),
          fields: [{ fieldKey: "label", sourceText: (row: any) => row.label }],
          sourceLocale: locale,
        });
      }
    }

    return NextResponse.json({ ok: true, organizationId, teamId }, { status: 200 });
  } catch (error) {
    console.error("Onboarding POST failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: error,
      },
      { status: 500 },
    );
  }
}
