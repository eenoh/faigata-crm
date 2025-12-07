// src/app/api/crm/pipeline-conversions/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RatePayload = {
  fromStage: string;
  toStage: string;
  probability: number; // 0–100
};

type PostBody = {
  teamId?: string;
  action?: "get" | "save";
  rates?: RatePayload[];
};

async function loadStages(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, position")
    .eq("team_id", teamId);

  if (error) {
    console.error("[PipelineConversionsAPI] loadStages error", error);
    throw new Error(error.message || "Failed to load pipeline stages");
  }

  return data ?? [];
}

async function loadConversionMetrics(teamId: string) {
  // NOTE: select("*") so it doesn't break if target_rate doesn't exist yet
  const { data, error } = await supabaseAdmin
    .from("conversion_metrics")
    .select("*")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (error) {
    console.error(
      "[PipelineConversionsAPI] loadConversionMetrics error",
      error
    );
    throw new Error(error.message || "Failed to load conversion metrics");
  }

  return data ?? [];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as PostBody | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teamId = body.teamId;
  const action = body.action;

  if (!teamId || !action) {
    return NextResponse.json(
      { error: "Missing teamId or action" },
      { status: 400 }
    );
  }

  /* ---------- GET: return conversion rates ---------- */
  if (action === "get") {
    try {
      const [stages, metrics] = await Promise.all([
        loadStages(teamId),
        loadConversionMetrics(teamId),
      ]);

      const stageIdToName = new Map<string, string>();
      for (const s of stages as any[]) {
        stageIdToName.set(s.id, s.name);
      }

      const result: RatePayload[] = (metrics as any[]).map((m, index) => ({
        fromStage: stageIdToName.get(m.from_stage_id) ?? "(deleted)",
        toStage: stageIdToName.get(m.to_stage_id) ?? "(deleted)",
        probability:
          typeof m.target_rate === "number"
            ? m.target_rate
            : 0, // default if column missing or NULL
      }));

      return NextResponse.json(result);
    } catch (err: any) {
      console.error("[PipelineConversionsAPI] GET failed", err);
      return NextResponse.json(
        {
          error: "Failed to fetch pipeline conversion rates",
          details: err?.message ?? String(err),
        },
        { status: 500 }
      );
    }
  }

  /* ---------- SAVE: overwrite conversion rates ---------- */
  if (action === "save") {
    const rates = body.rates ?? [];

    if (!Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json(
        { error: "No rates provided" },
        { status: 400 }
      );
    }

    try {
      const stages = await loadStages(teamId);
      const nameToStageId = new Map<string, string>();

      for (const s of stages as any[]) {
        nameToStageId.set(s.name, s.id);
      }

      const rows = rates
        .map((r, index) => {
          const fromId = nameToStageId.get(r.fromStage);
          const toId = nameToStageId.get(r.toStage);

          if (!fromId || !toId) {
            console.warn(
              "[PipelineConversionsAPI] Missing stage for rate",
              r.fromStage,
              r.toStage
            );
            return null;
          }

          return {
            team_id: teamId,
            label: `${r.fromStage} → ${r.toStage}`,
            from_stage_id: fromId,
            to_stage_id: toId,
            // this column MUST exist in your DB for saving to work
            target_rate: Math.max(
              0,
              Math.min(100, Number(r.probability) || 0)
            ),
            position: index,
          };
        })
        .filter(Boolean) as any[];

      // Simplest strategy: clear & reinsert
      const { error: deleteError } = await supabaseAdmin
        .from("conversion_metrics")
        .delete()
        .eq("team_id", teamId);

      if (deleteError) {
        console.error(
          "[PipelineConversionsAPI] Failed to clear old metrics",
          deleteError
        );
        return NextResponse.json(
          {
            error: "Failed to save conversion rates (delete)",
            details: deleteError.message,
          },
          { status: 500 }
        );
      }

      const { error: insertError } = await supabaseAdmin
        .from("conversion_metrics")
        .insert(rows);

      if (insertError) {
        console.error(
          "[PipelineConversionsAPI] Failed to insert metrics",
          insertError
        );
        return NextResponse.json(
          {
            error: "Failed to save conversion rates (insert)",
            details: insertError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      console.error("[PipelineConversionsAPI] SAVE failed", err);
      return NextResponse.json(
        {
          error: "Failed to save conversion rates",
          details: err?.message ?? String(err),
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
