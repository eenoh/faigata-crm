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

function clampPct(v: unknown): number {
  const n = Number(v);
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
  // NOTE: select("*") so it doesn't break if target_rate doesn't exist yet
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

  /* ---------- GET: return conversion rates ---------- */
  if (action === "get") {
    try {
      const [stages, metrics] = await Promise.all([
        loadStages(teamId),
        loadConversionMetrics(teamId),
      ]);

      const stageIdToName = new Map<string, string>();
      for (const s of stages as any[]) {
        stageIdToName.set(String(s.id), String(s.name ?? "Untitled"));
      }

      const result: RatePayload[] = (metrics as any[]).map((m) => ({
        fromStage: stageIdToName.get(String(m.from_stage_id)) ?? "(deleted)",
        toStage: stageIdToName.get(String(m.to_stage_id)) ?? "(deleted)",
        probability:
          typeof m.target_rate === "number" ? clampPct(m.target_rate) : 0,
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

  /* ---------- SAVE: overwrite conversion rates ---------- */
  if (action === "save") {
    const rates = body.rates;

    if (!Array.isArray(rates) || rates.length === 0) {
      return NextResponse.json({ error: "No rates provided" }, { status: 400 });
    }

    try {
      const stages = await loadStages(teamId);

      // Build name -> stageId map (trim + case-sensitive as stored)
      const nameToStageId = new Map<string, string>();
      for (const s of stages as any[]) {
        const nm = String(s.name ?? "").trim();
        if (!nm) continue;
        nameToStageId.set(nm, String(s.id));
      }

      const rows = rates
        .map((r, index) => {
          const fromName = String(r?.fromStage ?? "").trim();
          const toName = String(r?.toStage ?? "").trim();
          const fromId = nameToStageId.get(fromName);
          const toId = nameToStageId.get(toName);

          if (!fromName || !toName || !fromId || !toId) {
            console.warn(
              "[PipelineConversionsAPI] Missing stage for rate",
              fromName,
              toName,
            );
            return null;
          }

          return {
            team_id: teamId,
            label: `${fromName} → ${toName}`,
            from_stage_id: fromId,
            to_stage_id: toId,
            // this column MUST exist in your DB for saving to work
            target_rate: clampPct(r?.probability),
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

      // Simplest strategy: clear & reinsert
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
