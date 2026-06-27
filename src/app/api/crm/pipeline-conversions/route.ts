// src/app/api/crm/pipeline-conversions/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildConversionMetricLabel } from "@/features/crm/utils/conversionMetrics";

type RatePayload = {
  fromStageId: string;
  toStageId: string;
  fromStageName?: string;
  toStageName?: string;
  probability: number;
};

type PostBody = {
  teamId?: string;
  action?: "get" | "save";
  rates?: RatePayload[];
};

function clampPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

async function loadStages(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, position")
    .eq("team_id", teamId);

  if (error) {
    console.error("[PipelineConversionsAPI] loadStages error", error);
    throw new Error(error.message || "Failed to load pipeline stages");
  }

  return Array.isArray(data) ? data : [];
}

async function loadConversionMetrics(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversion_metrics")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (error) {
    console.error(
      "[PipelineConversionsAPI] loadConversionMetrics error",
      error,
    );
    throw new Error(error.message || "Failed to load conversion metrics");
  }

  return Array.isArray(data) ? data : [];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as PostBody | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
  const action = body.action;

  if (!teamId || !action) {
    return NextResponse.json(
      { error: "Missing teamId or action" },
      { status: 400 },
    );
  }

  if (action === "get") {
    try {
      const [stages, metrics] = await Promise.all([
        loadStages(teamId),
        loadConversionMetrics(teamId),
      ]);

      const stageIdToName = new Map<string, string>();
      for (const stage of stages as any[]) {
        stageIdToName.set(String(stage.id), String(stage.name ?? "Untitled"));
      }

      const result: RatePayload[] = (metrics as any[]).map((metric) => ({
        fromStageId: String(metric.from_stage_id ?? ""),
        toStageId: String(metric.to_stage_id ?? ""),
        fromStageName:
          stageIdToName.get(String(metric.from_stage_id)) ?? "(deleted)",
        toStageName:
          stageIdToName.get(String(metric.to_stage_id)) ?? "(deleted)",
        probability:
          typeof metric.target_rate === "number"
            ? clampPct(metric.target_rate)
            : 0,
      }));

      return NextResponse.json(result);
    } catch (err: any) {
      console.error("[PipelineConversionsAPI] GET failed", err);
      return NextResponse.json(
        {
          error: "Failed to fetch pipeline conversion rates",
          details: err?.message ?? String(err),
        },
        { status: 500 },
      );
    }
  }

  if (action === "save") {
    const rates = body.rates;

    if (!Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: "No rates provided" }, { status: 400 });
    }

    try {
      const stages = await loadStages(teamId);
      const stageIdToName = new Map<string, string>();
      for (const stage of stages as any[]) {
        stageIdToName.set(String(stage.id), String(stage.name ?? "").trim());
      }

      const rows = rates
        .map((rate, index) => {
          const fromId = String(rate?.fromStageId ?? "").trim();
          const toId = String(rate?.toStageId ?? "").trim();
          const fromName = stageIdToName.get(fromId);
          const toName = stageIdToName.get(toId);

          if (!fromId || !toId || !fromName || !toName) {
            console.warn(
              "[PipelineConversionsAPI] Missing stage for rate",
              fromId,
              toId,
            );
            return null;
          }

          return {
            team_id: teamId,
            label: buildConversionMetricLabel(fromName, toName),
            from_stage_id: fromId,
            to_stage_id: toId,
            target_rate: clampPct(rate?.probability),
            position: index,
          };
        })
        .filter(Boolean) as any[];

      if (rows.length === 0) {
        return NextResponse.json(
          { error: "No valid rates provided" },
          { status: 400 },
        );
      }

      const { error: deleteError } = await supabaseAdmin
        .from("conversion_metrics")
        .delete()
        .eq("team_id", teamId);

      if (deleteError) {
        console.error(
          "[PipelineConversionsAPI] Failed to clear old metrics",
          deleteError,
        );
        return NextResponse.json(
          {
            error: "Failed to save conversion rates (delete)",
            details: deleteError.message,
          },
          { status: 500 },
        );
      }

      const { error: insertError } = await supabaseAdmin
        .from("conversion_metrics")
        .insert(rows);

      if (insertError) {
        console.error(
          "[PipelineConversionsAPI] Failed to insert metrics",
          insertError,
        );
        return NextResponse.json(
          {
            error: "Failed to save conversion rates (insert)",
            details: insertError.message,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, count: rows.length });
    } catch (err: any) {
      console.error("[PipelineConversionsAPI] SAVE failed", err);
      return NextResponse.json(
        {
          error: "Failed to save conversion rates",
          details: err?.message ?? String(err),
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
