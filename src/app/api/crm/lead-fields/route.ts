// src/app/api/crm/lead-fields/route.ts
import { NextResponse } from "next/server";
import {
  applyEntityTranslations,
  deleteEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import {
  getNormalizedLeadFieldDefinitions,
  replaceLeadFieldOptions,
} from "@/features/crm/server/normalized-crm";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeadFieldDefinition } from "@/features/crm/types/lead";

type DbLeadField = {
  id: string;
  team_id: string;
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "link";
  options: string[] | null;
  position: number | null;
};

type Body = {
  teamId?: string;
  fields?: {
    key: string;
    label: string;
    type: DbLeadField["type"];
    options?: string[];
  }[];
} | null;

type LeadFieldOptionRow = {
  id: string;
  option: string;
};

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeResolveLocale(req: Request): Promise<string | undefined> {
  try {
    const locale = await resolveRequestLocale({ request: req });
    return typeof locale === "string" && locale.trim() ? locale : undefined;
  } catch (error) {
    console.warn("[lead-fields] resolveRequestLocale failed", error);
    return undefined;
  }
}

async function translateLeadFieldOptions(
  teamId: string,
  locale: string | undefined,
  fieldId: string,
  options: string[],
) {
  const rows = options.map((option) => ({ id: fieldId, option }));

  if (!locale || rows.length === 0) {
    return rows.map((row) => row.option);
  }

  try {
    await applyEntityTranslations({
      admin: supabaseAdmin as any,
      teamId,
      entityTable: "lead_fields",
      rows,
      requestedLocale: locale,
      fields: [
        {
          fieldKey: (row: LeadFieldOptionRow) => `option:${row.option}`,
          sourceText: (row: LeadFieldOptionRow) => row.option,
          assign: (row: LeadFieldOptionRow, value) => {
            row.option = value;
          },
        },
      ],
    });
  } catch (error) {
    console.warn(
      "[lead-fields] option translation failed, using source values",
      error,
    );
  }

  return rows.map((row) => row.option);
}

/** POST = load OR save, depending on whether `fields` is present */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body;
    const teamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";
    const locale = await safeResolveLocale(req);

    if (!teamId) {
      return json({ error: "Missing teamId" }, 400);
    }

    if (Array.isArray(body?.fields)) {
      const input = body.fields;

      const { data: existingRaw, error: existingError } = await supabaseAdmin
        .from("lead_fields")
        .select("id, key")
        .eq("team_id", teamId);

      if (existingError) {
        console.error("[lead-fields] fetch existing error", existingError);
        return json({ error: "Failed to save lead fields" }, 500);
      }

      const existingRows = Array.isArray(existingRaw) ? existingRaw : [];
      const existingByKey = new Map<string, string>(
        existingRows.map((row: any) => [
          String(row?.key ?? "").trim(),
          String(row?.id ?? "").trim(),
        ]),
      );

      const rows = input
        .map((field, index) => {
          const key = String(field?.key ?? "").trim();
          const label = String(field?.label ?? "").trim();
          const type = field?.type;

          if (!key || !label) return null;
          if (
            type !== "text" &&
            type !== "number" &&
            type !== "select" &&
            type !== "boolean" &&
            type !== "link"
          ) {
            return null;
          }

          return {
            id: existingByKey.get(key) || undefined,
            team_id: teamId,
            key,
            label,
            type,
            options:
              type === "select" && Array.isArray(field?.options)
                ? field.options
                    .map((value) => String(value ?? "").trim())
                    .filter(Boolean)
                : null,
            position: index,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      const incomingKeys = new Set(rows.map((row) => row.key));

      const toDeleteIds = existingRows
        .filter((row: any) => !incomingKeys.has(String(row?.key ?? "").trim()))
        .map((row: any) => String(row?.id ?? "").trim())
        .filter(Boolean);

      if (toDeleteIds.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from("lead_fields")
          .delete()
          .in("id", toDeleteIds);

        if (deleteError) {
          console.error("[lead-fields] delete error", deleteError);
          return json({ error: "Failed to save lead fields" }, 500);
        }

        try {
          await deleteEntityTranslations({
            admin: supabaseAdmin as any,
            entityTable: "lead_fields",
            entityIds: toDeleteIds,
          });
        } catch (error) {
          console.warn("[lead-fields] delete translations failed", error);
        }
      }

      if (rows.length > 0) {
        const { data: savedRaw, error: saveError } = await supabaseAdmin
          .from("lead_fields")
          .upsert(
            rows.map(({ options: _options, ...row }) => row),
            { onConflict: "id" },
          )
          .select("id, key, label, type, position");

        if (saveError) {
          console.error("[lead-fields] upsert error", saveError);
          return json({ error: "Failed to save lead fields" }, 500);
        }

        const savedRows = (Array.isArray(savedRaw) ? savedRaw : []).map((row: any) => ({
          id: String(row?.id ?? ""),
          key: String(row?.key ?? ""),
          label: String(row?.label ?? ""),
        }));

        const optionsByKey = new Map(
          rows.map((row) => [row.key, Array.isArray(row.options) ? row.options : []]),
        );

        await Promise.all(
          savedRows.map((row) =>
            replaceLeadFieldOptions({
              admin: supabaseAdmin as any,
              fieldId: row.id,
              options: optionsByKey.get(row.key) ?? [],
            }),
          ),
        );

        if (locale) {
          try {
            await syncEntityTranslationSources({
              admin: supabaseAdmin as any,
              teamId,
              entityTable: "lead_fields",
              rows: savedRows,
              fields: [{ fieldKey: "label", sourceText: (row) => row.label }],
              sourceLocale: locale,
            });

            await Promise.all(
              savedRows.flatMap((row) =>
                (optionsByKey.get(row.key) ?? []).map((option: string) =>
                  syncEntityTranslationSources({
                    admin: supabaseAdmin as any,
                    teamId,
                    entityTable: "lead_fields",
                    rows: [{ id: row.id, option }],
                    fields: [
                      {
                        fieldKey: (valueRow: LeadFieldOptionRow) =>
                          `option:${valueRow.option}`,
                        sourceText: (valueRow: LeadFieldOptionRow) =>
                          valueRow.option,
                      },
                    ],
                    sourceLocale: locale,
                  }),
                ),
              ),
            );
          } catch (error) {
            console.warn("[lead-fields] sync translations failed", error);
          }
        }
      }

      return json({ ok: true, count: rows.length });
    }

    let rows: LeadFieldDefinition[];
    try {
      rows = await getNormalizedLeadFieldDefinitions(supabaseAdmin as any, teamId);
    } catch (error) {
      console.error("[lead-fields] fetch error", error);
      return json({ error: "Failed to fetch lead fields" }, 500);
    }

    const dbRows = rows as DbLeadField[];

    if (locale) {
      try {
        await applyEntityTranslations({
          admin: supabaseAdmin as any,
          teamId,
          entityTable: "lead_fields",
          rows: dbRows,
          requestedLocale: locale,
          fields: [
            {
              fieldKey: "label",
              sourceText: (row) => row.label,
              assign: (row, value) => {
                row.label = value;
              },
            },
          ],
        });
      } catch (error) {
        console.warn(
          "[lead-fields] label translation failed, using source values",
          error,
        );
      }
    }

    const translatedOptionLabelsById = new Map<string, string[]>();

    for (const row of dbRows) {
      const sourceOptions = Array.isArray((row as any).options)
        ? ((row as any).options as string[])
        : [];
      const translatedOptions = await translateLeadFieldOptions(
        teamId,
        locale,
        row.id,
        sourceOptions,
      );

      translatedOptionLabelsById.set(String(row.id), translatedOptions);
    }

    const fields: LeadFieldDefinition[] = dbRows.map((field) => ({
      id: String(field.id),
      team_id: String(field.team_id),
      key: String(field.key),
      label: String(field.label),
      type: field.type,
      options:
        field.type === "select"
          ? Array.isArray(field.options)
            ? field.options
            : []
          : [],
      optionLabels:
        field.type === "select"
          ? translatedOptionLabelsById.get(String(field.id)) ??
            (Array.isArray(field.options) ? field.options : [])
          : [],
      position: typeof field.position === "number" ? field.position : undefined,
    }));

    return json(fields);
  } catch (err) {
    console.error("[lead-fields] route error", err);
    return json({ error: "Failed to fetch lead fields" }, 500);
  }
}
