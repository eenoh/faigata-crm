import { NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { applyEntityTranslations } from "@/features/crm/server/custom-value-translations";
import {
  buildCrmLeadScopeApplier,
  isDashboardScope,
  selectWithFallback,
  type DashboardScope,
} from "@/features/crm/server/dashboard-shared";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FunnelStage = {
  id: string;
  name: string;
  position: number | null;
  leadCount: number;
};

type FunnelEdge = {
  fromStageId: string;
  toStageId: string;
  fromStageName: string;
  toStageName: string;
  position: number | null;
  label: string;
  targetRate: number | null;
  actualConversionRate: number | null;
  dropOffCount: number;
  dropOffRate: number | null;
};

type PipelineStageRow = {
  id: string;
  team_id: string;
  name: string | null;
  position: number | null;
};

type ConversionMetricRow = {
  id: string;
  team_id: string;
  label: string | null;
  from_stage_id: string;
  to_stage_id: string;
  position: number | null;
  target_rate: number | null;
};

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scopeRaw = String(url.searchParams.get("scope") || "team").trim();
    if (!isDashboardScope(scopeRaw)) {
      return jsonError("invalid_scope", 400);
    }

    const requestedScope = scopeRaw as DashboardScope;
    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(req, admin);
    if (!auth.ok) {
      return jsonError(auth.reason, 401, auth.detail);
    }

    const { teamId, roles, isManagerOrAdmin } = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request: req,
    });
    const locale = await resolveRequestLocale({
      request: req,
      admin,
      userId: auth.userId,
    });
    const effectiveScope: DashboardScope = isManagerOrAdmin
      ? requestedScope
      : "me";

    const applyLeadScope = buildCrmLeadScopeApplier({
      teamId,
      userId: auth.userId,
      scope: effectiveScope,
    });

    const [stagesRes, metricsRes] = await Promise.all([
      admin
        .from("pipeline_stages")
        .select("id, team_id, name, position, created_at")
        .eq("team_id", teamId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("conversion_metrics")
        .select(
          "id, team_id, label, from_stage_id, to_stage_id, position, target_rate",
        )
        .eq("team_id", teamId)
        .order("position", { ascending: true }),
    ]);

    if (stagesRes.error) {
      return jsonError("stages_load_failed", 500, stagesRes.error);
    }
    if (metricsRes.error) {
      return jsonError("metrics_load_failed", 500, metricsRes.error);
    }

    const stages: PipelineStageRow[] = Array.isArray(stagesRes.data)
      ? (stagesRes.data as PipelineStageRow[])
      : [];
    const metrics: ConversionMetricRow[] = Array.isArray(metricsRes.data)
      ? (metricsRes.data as ConversionMetricRow[])
      : [];

    await applyEntityTranslations({
      admin,
      teamId,
      entityTable: "pipeline_stages",
      rows: stages,
      requestedLocale: locale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name ?? "",
          assign: (row, value) => {
            row.name = value;
          },
        },
      ],
    });

    await applyEntityTranslations({
      admin,
      teamId,
      entityTable: "conversion_metrics",
      rows: metrics,
      requestedLocale: locale,
      fields: [
        {
          fieldKey: "label",
          sourceText: (row) => row.label ?? "",
          assign: (row, value) => {
            row.label = value;
          },
        },
      ],
    });

    const sortedStages = [...stages].sort((left, right) => {
      const leftPosition = left.position ?? Number.POSITIVE_INFINITY;
      const rightPosition = right.position ?? Number.POSITIVE_INFINITY;
      if (leftPosition !== rightPosition) {
        return leftPosition - rightPosition;
      }

      const leftName = normalizeKey(String(left.name ?? ""));
      const rightName = normalizeKey(String(right.name ?? ""));
      if (leftName !== rightName) {
        return leftName.localeCompare(rightName);
      }

      return String(left.id).localeCompare(String(right.id));
    });

    const stageIdToName = new Map<string, string>();
    const stageNameToId = new Map<string, string>();
    for (const stage of sortedStages) {
      const id = String(stage.id);
      const name = String(stage.name ?? "Untitled");
      stageIdToName.set(id, name);
      stageNameToId.set(normalizeKey(name), id);
    }

    const { data: leadRowsRaw, usedSelect } = await selectWithFallback(
      (select) => applyLeadScope(admin.from("leads").select(select)),
      ["id, stage_id", "id, stage"],
    );
    const leadRows = Array.isArray(leadRowsRaw) ? (leadRowsRaw as any[]) : [];

    const stageIdToCount = new Map<string, number>();
    if (usedSelect.includes("stage_id")) {
      for (const lead of leadRows) {
        const stageId = lead?.stage_id ? String(lead.stage_id) : "";
        if (!stageId) {
          continue;
        }
        stageIdToCount.set(stageId, (stageIdToCount.get(stageId) ?? 0) + 1);
      }
    } else {
      for (const lead of leadRows) {
        const stageName = lead?.stage ? String(lead.stage) : "";
        if (!stageName) {
          continue;
        }
        const stageId = stageNameToId.get(normalizeKey(stageName));
        if (!stageId) {
          continue;
        }
        stageIdToCount.set(stageId, (stageIdToCount.get(stageId) ?? 0) + 1);
      }
    }

    const funnelStages: FunnelStage[] = sortedStages.map((stage) => ({
      id: String(stage.id),
      name: stageIdToName.get(String(stage.id)) ?? "Untitled",
      position: stage.position ?? null,
      leadCount: stageIdToCount.get(String(stage.id)) ?? 0,
    }));

    const metricByPair = new Map<
      string,
      { label: string | null; targetRate: number | null; position: number | null }
    >();
    for (const metric of metrics) {
      metricByPair.set(`${metric.from_stage_id}__${metric.to_stage_id}`, {
        label: metric.label ?? null,
        targetRate:
          metric.target_rate == null ? null : Number(metric.target_rate),
        position: metric.position ?? null,
      });
    }

    const edges: FunnelEdge[] = [];
    for (let index = 0; index < funnelStages.length - 1; index += 1) {
      const fromStage = funnelStages[index];
      const toStage = funnelStages[index + 1];
      const fromCount = fromStage.leadCount;
      const toCount = toStage.leadCount;
      const metric = metricByPair.get(`${fromStage.id}__${toStage.id}`);
      const denominator = fromCount + toCount;

      edges.push({
        fromStageId: fromStage.id,
        toStageId: toStage.id,
        fromStageName: fromStage.name,
        toStageName: toStage.name,
        position: metric?.position ?? index,
        label:
          metric?.label && metric.label.trim().length > 0
            ? metric.label.trim()
            : "Next stage",
        targetRate: metric?.targetRate ?? null,
        actualConversionRate:
          denominator > 0 ? Math.round((toCount / denominator) * 1000) / 10 : null,
        dropOffCount: fromCount,
        dropOffRate:
          denominator > 0
            ? Math.round((fromCount / denominator) * 1000) / 10
            : null,
      });
    }

    return NextResponse.json({
      ok: true,
      teamId,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      funnel: {
        leadTotal: leadRows.length,
        stages: funnelStages,
        edges,
      },
    });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    console.error("[dashboard-pipeline] unexpected:", error);
    return jsonError("unhandled_error", 500, message);
  }
}
