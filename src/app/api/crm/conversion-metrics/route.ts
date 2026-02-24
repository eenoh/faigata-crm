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

const json = (data: any, status = 200) => NextResponse.json(data, { status });

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
    .select(
      "id, team_id, label, from_stage_id, to_stage_id, position, target_rate",
    )
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[ConversionMetricsAPI] loadConversionMetrics error", error);
    throw new Error(error.message || "Failed to load conversion metrics");
  }
  return data ?? [];
}

const mapFrom = <K, V>(rows: any[], key: (r: any) => K, val: (r: any) => V) => {
  const m = new Map<K, V>();
  for (const r of rows) m.set(key(r), val(r));
  return m;
};

const toIntOrNull = (v: unknown) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) | 0 : null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as PostBody | null;
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const teamId = body.teamId;
  const action = body.action;
  if (!teamId || !action)
    return json({ error: "Missing teamId or action" }, 400);

  if (action === "get") {
    try {
      const [stages, metrics] = await Promise.all([
        loadStages(teamId),
        loadConversionMetrics(teamId),
      ]);
      const stageIdToName = mapFrom(
        stages as any[],
        (s) => String(s.id),
        (s) => String(s.name),
      );

      const result = (metrics as any[]).map((m, index) => {
        const fromName =
          stageIdToName.get(String(m.from_stage_id)) ?? "(deleted)";
        const toName = stageIdToName.get(String(m.to_stage_id)) ?? "(deleted)";
        return {
          label:
            m.label ??
            `${fromName === "(deleted)" ? "" : fromName} → ${toName === "(deleted)" ? "" : toName}`.trim(),
          fromStage: fromName,
          toStage: toName,
          position: typeof m.position === "number" ? m.position : index,
          // ✅ return camelCase for the client
          targetRate:
            typeof m.target_rate === "number" ? m.target_rate | 0 : null,
        };
      });

      return json(result);
    } catch (err: any) {
      console.error("[ConversionMetricsAPI] GET failed", err);
      return json(
        {
          error: "Failed to fetch conversion metric definitions",
          details: err?.message ?? String(err),
        },
        500,
      );
    }
  }

  if (action === "save") {
    const defs = body.definitions ?? [];
    if (!Array.isArray(defs))
      return json({ error: "definitions must be an array" }, 400);

    try {
      const stages = await loadStages(teamId);
      const nameToStageId = mapFrom(
        stages as any[],
        (s) => String(s.name),
        (s) => String(s.id),
      );

      const rows = defs
        .map((d, index) => {
          const fromId = nameToStageId.get(d.fromStage);
          const toId = nameToStageId.get(d.toStage);
          if (!fromId || !toId) {
            console.warn(
              "[ConversionMetricsAPI] Missing stage for definition",
              d.fromStage,
              d.toStage,
            );
            return null;
          }

          return {
            team_id: teamId,
            label: (d.label ?? "").trim() || `${d.fromStage} → ${d.toStage}`,
            from_stage_id: fromId,
            to_stage_id: toId,
            position: index,
            target_rate: toIntOrNull((d as any).targetRate),
          };
        })
        .filter(Boolean) as any[];

      const { error: deleteError } = await supabaseAdmin
        .from("conversion_metrics")
        .delete()
        .eq("team_id", teamId);
      if (deleteError) {
        console.error(
          "[ConversionMetricsAPI] Failed to clear old definitions",
          deleteError,
        );
        return json(
          {
            error: "Failed to save conversion metric definitions (delete)",
            details: deleteError.message,
          },
          500,
        );
      }

      if (!rows.length) return json({ ok: true });

      const { error: insertError } = await supabaseAdmin
        .from("conversion_metrics")
        .insert(rows);
      if (insertError) {
        console.error(
          "[ConversionMetricsAPI] Failed to insert definitions",
          insertError,
        );
        return json(
          {
            error: "Failed to save conversion metric definitions (insert)",
            details: insertError.message,
          },
          500,
        );
      }

      return json({ ok: true });
    } catch (err: any) {
      console.error("[ConversionMetricsAPI] SAVE failed", err);
      return json(
        {
          error: "Failed to save conversion metric definitions",
          details: err?.message ?? String(err),
        },
        500,
      );
    }
  }

  return json({ error: "Unknown action" }, 400);
}
