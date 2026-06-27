import "server-only";

import { DEFAULT_LOCALE } from "@/i18n/config";
import {
  deleteTranslationSources,
  ensureImmediateTranslationsForSource,
  resolveTranslationBatch,
  upsertTranslationSource,
} from "@/features/i18n/server/customValueTranslations";
import type { AppSupabaseClient } from "@/lib/supabase/types";

type FieldValueResolver<T extends { id: string }> =
  | string
  | ((row: T) => string);

type TranslationFieldConfig<T extends { id: string }> = {
  fieldKey: FieldValueResolver<T>;
  sourceText: FieldValueResolver<T>;
  assign: (row: T, value: string) => void;
};

function resolveFieldValue<T extends { id: string }>(
  row: T,
  value: FieldValueResolver<T>,
) {
  return typeof value === "function" ? value(row) : value;
}

export async function syncEntityTranslationSources<
  T extends { id: string },
>(args: {
  admin: AppSupabaseClient;
  teamId?: string | null;
  organizationId?: string | null;
  entityTable: string;
  rows: T[];
  fields: Array<{
    fieldKey: FieldValueResolver<T>;
    sourceText: FieldValueResolver<T>;
  }>;
  sourceLocale?: string | null;
}) {
  try {
    await Promise.all(
      args.rows.flatMap((row) =>
        args.fields.map(async (field) => {
          const source = await upsertTranslationSource(args.admin, {
            teamId: args.teamId,
            organizationId: args.organizationId,
            entityTable: args.entityTable,
            entityId: row.id,
            fieldKey: resolveFieldValue(row, field.fieldKey),
            sourceText: resolveFieldValue(row, field.sourceText),
            sourceLocale: args.sourceLocale,
          });

          await ensureImmediateTranslationsForSource({
            admin: args.admin,
            source,
          });
        }),
      ),
    );
  } catch (error) {
    console.warn(
      `[custom-value-translations] source sync failed for ${args.entityTable}`,
      error,
    );
  }
}

export async function applyEntityTranslations<T extends { id: string }>(args: {
  admin: AppSupabaseClient;
  teamId?: string | null;
  organizationId?: string | null;
  entityTable: string;
  rows: T[];
  fields: TranslationFieldConfig<T>[];
  requestedLocale?: string | null;
  sourceLocale?: string | null;
}) {
  const requestedLocale = args.requestedLocale ?? DEFAULT_LOCALE;

  const items = args.rows.flatMap((row) =>
    args.fields.map((field) => ({
      teamId: args.teamId,
      organizationId: args.organizationId,
      entityTable: args.entityTable,
      entityId: row.id,
      fieldKey: resolveFieldValue(row, field.fieldKey),
      sourceText: resolveFieldValue(row, field.sourceText),
      requestedLocale,
      sourceLocale: args.sourceLocale,
    })),
  );

  let resolved: Awaited<ReturnType<typeof resolveTranslationBatch>>;
  try {
    resolved = await resolveTranslationBatch({
      admin: args.admin,
      items,
    });
  } catch (error) {
    console.warn(
      `[custom-value-translations] apply failed for ${args.entityTable}`,
      error,
    );
    return args.rows;
  }

  const values = new Map<string, string>();
  for (const entry of resolved) {
    values.set(`${entry.item.entityId}:${entry.item.fieldKey}`, entry.value);
  }

  for (const row of args.rows) {
    for (const field of args.fields) {
      const fieldKey = resolveFieldValue(row, field.fieldKey);
      const value = values.get(`${row.id}:${fieldKey}`);
      if (value !== undefined) {
        field.assign(row, value);
      }
    }
  }

  return args.rows;
}

export async function deleteEntityTranslations(args: {
  admin: AppSupabaseClient;
  entityTable: string;
  entityIds: string[];
}) {
  await deleteTranslationSources(args);
}
