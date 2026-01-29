// src/app/api/crm/conversion-metrics/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DefinitionPayload = {
  label: string;
  fromStage: string;
  toStage: string;
  position: number;
  /** UI sends this; stored as conversion_metrics.target_rate (int4) */
  targetRate?: number | null;
};

type PostBody = {
  teamId?: string;
  action?: "get" | "save";
  definitions?: DefinitionPayload[];
};

async function loadStages(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, position")
    .eq("team_id", teamId);

  if (error) {
    console.error("[ConversionMetricsAPI] loadStages error", error);
    throw new Error(error.message || "Failed to load pipeline stages");
  }

  return data ?? [];
}

async function loadConversionMetrics(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversion_metrics")
    // be explicit so we reliably have target_rate available
    .select("id, team_id, label, from_stage_id, to_stage_id, position, target_rate")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[ConversionMetricsAPI] loadConversionMetrics error", error);
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
    return NextResponse.json({ error: "Missing teamId or action" }, { status: 400 });
  }

  /* ---------- GET: list definitions ---------- */
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

      const result = (metrics as any[]).map((m, index) => ({
        label:
          m.label ??
          `${stageIdToName.get(m.from_stage_id) ?? ""} → ${stageIdToName.get(m.to_stage_id) ?? ""}`,
        fromStage: stageIdToName.get(m.from_stage_id) ?? "(deleted)",
        toStage: stageIdToName.get(m.to_stage_id) ?? "(deleted)",
        position: typeof m.position === "number" ? m.position : index,

        // ✅ return camelCase for the client
        targetRate: typeof m.target_rate === "number" ? (m.target_rate | 0) : null,
      }));

      return NextResponse.json(result);
    } catch (err: any) {
      console.error("[ConversionMetricsAPI] GET failed", err);
      return NextResponse.json(
        {
          error: "Failed to fetch conversion metric definitions",
          details: err?.message ?? String(err),
        },
        { status: 500 }
      );
    }
  }

  /* ---------- SAVE: overwrite definitions ---------- */
  if (action === "save") {
    const defs = body.definitions ?? [];

    if (!Array.isArray(defs)) {
      return NextResponse.json({ error: "definitions must be an array" }, { status: 400 });
    }

    try {
      const stages = await loadStages(teamId);
      const nameToStageId = new Map<string, string>();

      for (const s of stages as any[]) {
        nameToStageId.set(s.name, s.id);
      }

      const rows = defs
        .map((d, index) => {
          const fromId = nameToStageId.get(d.fromStage);
          const toId = nameToStageId.get(d.toStage);

          if (!fromId || !toId) {
            console.warn(
              "[ConversionMetricsAPI] Missing stage for definition",
              d.fromStage,
              d.toStage
            );
            return null;
          }

          const raw = (d as any).targetRate;

          // normalize to int or null (DB column is int4)
          const normalizedTarget =
            raw == null
              ? null
              : Number.isFinite(Number(raw))
              ? (Math.round(Number(raw)) | 0)
              : null;

          return {
            team_id: teamId,
            label: (d.label ?? "").trim() || `${d.fromStage} → ${d.toStage}`,
            from_stage_id: fromId,
            to_stage_id: toId,
            position: index,

            // ✅ persist to DB column
            target_rate: normalizedTarget,
          };
        })
        .filter(Boolean) as any[];

      const { error: deleteError } = await supabaseAdmin
        .from("conversion_metrics")
        .delete()
        .eq("team_id", teamId);

      if (deleteError) {
        console.error("[ConversionMetricsAPI] Failed to clear old definitions", deleteError);
        return NextResponse.json(
          {
            error: "Failed to save conversion metric definitions (delete)",
            details: deleteError.message,
          },
          { status: 500 }
        );
      }

      // If all rows were filtered out due to missing stages, avoid inserting []
      if (rows.length === 0) {
        return NextResponse.json({ ok: true });
      }

      const { error: insertError } = await supabaseAdmin.from("conversion_metrics").insert(rows);

      if (insertError) {
        console.error("[ConversionMetricsAPI] Failed to insert definitions", insertError);
        return NextResponse.json(
          {
            error: "Failed to save conversion metric definitions (insert)",
            details: insertError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    } catch (err: any) {
      console.error("[ConversionMetricsAPI] SAVE failed", err);
      return NextResponse.json(
        {
          error: "Failed to save conversion metric definitions",
          details: err?.message ?? String(err),
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
