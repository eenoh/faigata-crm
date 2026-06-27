// src/app/api/crm/conversion-metrics/route.ts
import { NextResponse } from "next/server";
import {
  applyEntityTranslations,
  deleteEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildConversionMetricLabel } from "@/features/crm/utils/conversionMetrics";

type DefinitionPayload = {
  label: string;
  fromStageId: string;
  toStageId: string;
  position: number;
  targetRate?: number | null;
};

type PostBody = {
  teamId?: string;
  action?: "get" | "save";
  definitions?: DefinitionPayload[];
};

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

export const runtime = "nodejs";

async function loadStages(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name, position")
    .eq("team_id", teamId);

  if (error) {
    console.error("[ConversionMetricsAPI] loadStages error", error);
    throw new Error(error.message || "Failed to load pipeline stages");
  }

  return Array.isArray(data) ? data : [];
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

  return Array.isArray(data) ? data : [];
}

const mapFrom = <K, V>(
  rows: any[],
  key: (row: any) => K,
  val: (row: any) => V,
) => {
  const map = new Map<K, V>();
  for (const row of rows) {
    map.set(key(row), val(row));
  }
  return map;
};

const toIntOrNull = (value: unknown) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) | 0 : null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as PostBody | null;
  const locale = await resolveRequestLocale({ request: req });

  if (!body) return json({ error: "Invalid JSON" }, 400);

  const teamId = body.teamId;
  const action = body.action;

  if (!teamId || !action) {
    return json({ error: "Missing teamId or action" }, 400);
  }

  if (action === "get") {
    try {
      const [stages, metrics] = await Promise.all([
        loadStages(teamId),
        loadConversionMetrics(teamId),
      ]);

      await applyEntityTranslations({
        admin: supabaseAdmin as any,
        teamId,
        entityTable: "pipeline_stages",
        rows: stages as any,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "name",
            sourceText: (row: any) => String(row.name ?? ""),
            assign: (row: any, value) => {
              row.name = value;
            },
          },
        ],
      });

      await applyEntityTranslations({
        admin: supabaseAdmin as any,
        teamId,
        entityTable: "conversion_metrics",
        rows: metrics as any,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "label",
            sourceText: (row: any) => String(row.label ?? ""),
            assign: (row: any, value) => {
              row.label = value;
            },
          },
        ],
      });

      const stageIdToName = mapFrom(
        stages,
        (stage) => String(stage.id),
        (stage) => String(stage.name ?? ""),
      );

      const result = metrics.map((metric, index) => {
        const fromStageId = String(metric.from_stage_id ?? "");
        const toStageId = String(metric.to_stage_id ?? "");
        const fromStageName = stageIdToName.get(fromStageId) ?? "(deleted)";
        const toStageName = stageIdToName.get(toStageId) ?? "(deleted)";

        return {
          id: String(metric.id ?? ""),
          label:
            metric.label ??
            buildConversionMetricLabel(
              fromStageName === "(deleted)" ? "" : fromStageName,
              toStageName === "(deleted)" ? "" : toStageName,
            ),
          fromStageId,
          toStageId,
          fromStageName,
          toStageName,
          position:
            typeof metric.position === "number" ? metric.position : index,
          targetRate:
            typeof metric.target_rate === "number" ? metric.target_rate | 0 : null,
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
    if (!Array.isArray(defs)) {
      return json({ error: "definitions must be an array" }, 400);
    }

    try {
      const [stages, existingRaw] = await Promise.all([
        loadStages(teamId),
        supabaseAdmin
          .from("conversion_metrics")
          .select("id, from_stage_id, to_stage_id")
          .eq("team_id", teamId),
      ]);

      if (existingRaw.error) {
        throw existingRaw.error;
      }

      const existingRows = Array.isArray(existingRaw.data) ? existingRaw.data : [];
      const existingByPair = new Map<string, string>(
        existingRows.map((row: any) => [
          `${String(row.from_stage_id ?? "")}:${String(row.to_stage_id ?? "")}`,
          String(row.id ?? ""),
        ]),
      );

      const stageIdToName = mapFrom(
        stages,
        (stage) => String(stage.id),
        (stage) => String(stage.name ?? ""),
      );

      const rows = defs
        .map((definition, index) => {
          const fromId = String(definition.fromStageId ?? "").trim();
          const toId = String(definition.toStageId ?? "").trim();
          const fromName = stageIdToName.get(fromId);
          const toName = stageIdToName.get(toId);

          if (!fromId || !toId || !fromName || !toName) {
            console.warn(
              "[ConversionMetricsAPI] Missing stage for definition",
              fromId,
              toId,
            );
            return null;
          }

          return {
            id: existingByPair.get(`${fromId}:${toId}`) || undefined,
            team_id: teamId,
            label:
              String(definition.label ?? "").trim() ||
              buildConversionMetricLabel(fromName, toName),
            from_stage_id: fromId,
            to_stage_id: toId,
            position: index,
            target_rate: toIntOrNull(definition.targetRate),
          };
        })
        .filter(Boolean) as any[];

      const incomingPairs = new Set(
        rows.map((row) => `${row.from_stage_id}:${row.to_stage_id}`),
      );
      const toDeleteIds = existingRows
        .filter(
          (row: any) =>
            !incomingPairs.has(
              `${String(row.from_stage_id ?? "")}:${String(row.to_stage_id ?? "")}`,
            ),
        )
        .map((row: any) => String(row.id ?? ""))
        .filter(Boolean);

      if (toDeleteIds.length) {
        const { error: deleteError } = await supabaseAdmin
          .from("conversion_metrics")
          .delete()
          .in("id", toDeleteIds);

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

        await deleteEntityTranslations({
          admin: supabaseAdmin as any,
          entityTable: "conversion_metrics",
          entityIds: toDeleteIds,
        });
      }

      if (!rows.length) {
        return json({ ok: true });
      }

      const { data: insertedRaw, error: insertError } = await supabaseAdmin
        .from("conversion_metrics")
        .upsert(rows, { onConflict: "id" })
        .select("id, label");

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

      await syncEntityTranslationSources({
        admin: supabaseAdmin as any,
        teamId,
        entityTable: "conversion_metrics",
        rows: (Array.isArray(insertedRaw) ? insertedRaw : []).map((row: any) => ({
          id: String(row.id ?? ""),
          label: String(row.label ?? ""),
        })),
        fields: [{ fieldKey: "label", sourceText: (row: any) => row.label }],
        sourceLocale: locale,
      });

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
