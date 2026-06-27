import "server-only";

import { createHash } from "crypto";
import type { AppLocale } from "@/i18n/config";
import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/config";
import { translateText } from "@/features/i18n/server/translationProvider";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const TRANSLATION_SOURCE_TABLE = "custom_value_translation_sources";
const TRANSLATION_TABLE = "custom_value_translations";

export type CustomValueTranslationSourceRow = {
  id: string;
  team_id: string | null;
  organization_id: string | null;
  entity_table: string;
  entity_id: string;
  field_key: string;
  source_text: string;
  source_locale: string;
  source_hash: string;
};

export type CustomValueTranslationRow = {
  id: string;
  source_id: string;
  locale: string;
  translated_text: string | null;
  is_manual: boolean;
  provider: string | null;
  source_hash_at_translation: string;
};

type TranslationTarget = {
  teamId?: string | null;
  organizationId?: string | null;
  entityTable: string;
  entityId: string;
  fieldKey: string;
  sourceText: string;
  sourceLocale?: string | null;
};

type ResolveDisplayValueArgs = {
  source: CustomValueTranslationSourceRow;
  translations: CustomValueTranslationRow[];
  requestedLocale: string;
};

type TranslationBatchItem = TranslationTarget & {
  requestedLocale: string;
};

export type ResolvedTranslationBatchItem = {
  item: TranslationBatchItem;
  source: CustomValueTranslationSourceRow;
  translations: CustomValueTranslationRow[];
  value: string;
};

type TranslationObservationContext = {
  event: string;
  sourceId?: string;
  entityTable?: string;
  entityId?: string;
  fieldKey?: string;
  requestedLocale?: string;
  sourceLocale?: string;
  provider?: string | null;
};

type TranslationObservationPayload = {
  outcome:
    | "cache_hit_manual"
    | "cache_hit_automatic"
    | "cache_miss"
    | "stale_automatic"
    | "source_locale_bypass"
    | "empty_source_bypass"
    | "invalid_locale"
    | "unknown_source_locale"
    | "provider_attempt"
    | "provider_success"
    | "provider_null"
    | "provider_error"
    | "db_load"
    | "db_upsert_source"
    | "db_upsert_translation"
    | "batch_start"
    | "batch_complete";
  details?: Record<string, unknown>;
};

export type ResolveDisplayFieldMapItem = {
  outputKey: string;
  source: TranslationTarget;
};

export type ResolvedSourceTextWhenLocaleUnavailable = {
  value: string;
  resolved: boolean;
  reason:
    | "unknown_source_locale"
    | "invalid_requested_locale"
    | "same_locale"
    | "empty_source_text";
  sourceLocale: string | null;
  requestedLocale: string | null;
};

function normalizeSourceLocale(value?: string | null): AppLocale {
  return normalizeLocale(value) ?? DEFAULT_LOCALE;
}

function hashSourceText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildSourceId(target: TranslationTarget) {
  return [
    target.teamId ?? "",
    target.organizationId ?? "",
    target.entityTable,
    target.entityId,
    target.fieldKey,
  ].join(":");
}

function buildTranslationId(sourceId: string, locale: string) {
  return `${sourceId}:${locale}`;
}

function buildSourceRow(
  target: TranslationTarget,
): CustomValueTranslationSourceRow {
  const sourceText = String(target.sourceText ?? "");

  return {
    id: buildSourceId(target),
    team_id: target.teamId ?? null,
    organization_id: target.organizationId ?? null,
    entity_table: target.entityTable,
    entity_id: target.entityId,
    field_key: target.fieldKey,
    source_text: sourceText,
    source_locale: normalizeSourceLocale(target.sourceLocale),
    source_hash: hashSourceText(sourceText),
  };
}

function normalizeTranslationRow(row: any): CustomValueTranslationRow | null {
  const id = String(row?.id ?? "").trim();
  const sourceId = String(row?.source_id ?? "").trim();
  const locale = normalizeLocale(String(row?.locale ?? "").trim());
  const sourceHashAtTranslation = String(
    row?.source_hash_at_translation ?? "",
  ).trim();

  if (!id || !sourceId || !locale || !sourceHashAtTranslation) {
    return null;
  }

  return {
    id,
    source_id: sourceId,
    locale,
    translated_text:
      typeof row?.translated_text === "string" ? row.translated_text : null,
    is_manual: Boolean(row?.is_manual),
    provider:
      typeof row?.provider === "string" && row.provider.trim()
        ? row.provider.trim()
        : null,
    source_hash_at_translation: sourceHashAtTranslation,
  };
}

function isFreshAutomaticTranslation(
  source: CustomValueTranslationSourceRow,
  translation: CustomValueTranslationRow | null | undefined,
) {
  return Boolean(
    translation &&
    !translation.is_manual &&
    translation.translated_text !== null &&
    translation.source_hash_at_translation === source.source_hash,
  );
}

function observeTranslation(
  context: TranslationObservationContext,
  payload: TranslationObservationPayload,
) {
  console.info("[customValueTranslations]", {
    event: context.event,
    sourceId: context.sourceId,
    entityTable: context.entityTable,
    entityId: context.entityId,
    fieldKey: context.fieldKey,
    requestedLocale: context.requestedLocale,
    sourceLocale: context.sourceLocale,
    provider: context.provider,
    outcome: payload.outcome,
    details: payload.details,
  });
}

function buildObservationContext(args: {
  source: CustomValueTranslationSourceRow;
  requestedLocale?: string;
  provider?: string | null;
  event: string;
}): TranslationObservationContext {
  return {
    event: args.event,
    sourceId: args.source.id,
    entityTable: args.source.entity_table,
    entityId: args.source.entity_id,
    fieldKey: args.source.field_key,
    requestedLocale: args.requestedLocale,
    sourceLocale: args.source.source_locale,
    provider: args.provider,
  };
}

function getMatchingManualTranslation(args: ResolveDisplayValueArgs) {
  const requestedLocale =
    normalizeLocale(args.requestedLocale) ??
    normalizeSourceLocale(args.source.source_locale);

  return (
    args.translations.find(
      (row) =>
        row.locale === requestedLocale &&
        row.is_manual &&
        row.translated_text !== null,
    ) ?? null
  );
}

function getMatchingAutomaticTranslation(args: ResolveDisplayValueArgs) {
  const requestedLocale =
    normalizeLocale(args.requestedLocale) ??
    normalizeSourceLocale(args.source.source_locale);

  return (
    args.translations.find(
      (row) =>
        row.locale === requestedLocale &&
        isFreshAutomaticTranslation(args.source, row),
    ) ?? null
  );
}

function getTranslationForRequestedLocale(args: {
  translations: CustomValueTranslationRow[];
  requestedLocale: string;
}) {
  const locale = normalizeLocale(args.requestedLocale);
  if (!locale) return null;

  return args.translations.find((row) => row.locale === locale) ?? null;
}

function dedupeTranslations(
  rows: CustomValueTranslationRow[],
): CustomValueTranslationRow[] {
  return Array.from(
    rows
      .reduce((map, row) => {
        map.set(`${row.source_id}:${row.locale}`, row);
        return map;
      }, new Map<string, CustomValueTranslationRow>())
      .values(),
  );
}

/**
 * Returns source text unchanged when locale resolution is impossible
 * instead of guessing a source locale.
 */
export function resolveSourceTextWhenLocaleUnavailable(args: {
  source: CustomValueTranslationSourceRow;
  requestedLocale: string;
}): ResolvedSourceTextWhenLocaleUnavailable | null {
  const sourceText = args.source.source_text;
  const normalizedRequestedLocale = normalizeLocale(args.requestedLocale);
  const normalizedSourceLocale = normalizeLocale(args.source.source_locale);

  if (sourceText.trim() === "") {
    return {
      value: sourceText,
      resolved: false,
      reason: "empty_source_text",
      sourceLocale: normalizedSourceLocale ?? null,
      requestedLocale: normalizedRequestedLocale ?? null,
    };
  }

  if (!normalizedRequestedLocale) {
    return {
      value: sourceText,
      resolved: false,
      reason: "invalid_requested_locale",
      sourceLocale: normalizedSourceLocale ?? null,
      requestedLocale: null,
    };
  }

  if (!normalizedSourceLocale) {
    return {
      value: sourceText,
      resolved: false,
      reason: "unknown_source_locale",
      sourceLocale: null,
      requestedLocale: normalizedRequestedLocale,
    };
  }

  if (normalizedRequestedLocale === normalizedSourceLocale) {
    return {
      value: sourceText,
      resolved: true,
      reason: "same_locale",
      sourceLocale: normalizedSourceLocale,
      requestedLocale: normalizedRequestedLocale,
    };
  }

  return null;
}

export function getBestTranslatedDisplayValue({
  source,
  translations,
  requestedLocale,
}: ResolveDisplayValueArgs): string {
  const bypass = resolveSourceTextWhenLocaleUnavailable({
    source,
    requestedLocale,
  });

  if (bypass) {
    return bypass.value;
  }

  const normalizedRequestedLocale = normalizeLocale(requestedLocale);
  if (!normalizedRequestedLocale) {
    return source.source_text;
  }

  return (
    getMatchingManualTranslation({
      source,
      translations,
      requestedLocale: normalizedRequestedLocale,
    })?.translated_text ??
    getMatchingAutomaticTranslation({
      source,
      translations,
      requestedLocale: normalizedRequestedLocale,
    })?.translated_text ??
    source.source_text
  );
}

async function loadTranslationsForSourceIds(
  admin: AppSupabaseClient,
  sourceIds: string[],
) {
  const uniqueSourceIds = Array.from(
    new Set(sourceIds.map((value) => value.trim()).filter(Boolean)),
  );

  if (uniqueSourceIds.length === 0) {
    return [] as CustomValueTranslationRow[];
  }

  const { data, error } = await admin
    .from(TRANSLATION_TABLE)
    .select(
      "id, source_id, locale, translated_text, is_manual, provider, source_hash_at_translation",
    )
    .in("source_id", uniqueSourceIds);

  if (error) {
    throw error;
  }

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeTranslationRow(row))
    .filter((row): row is CustomValueTranslationRow => Boolean(row));

  console.info("[customValueTranslations]", {
    event: "translation.db.load",
    outcome: "db_load",
    details: {
      requestedSourceIds: uniqueSourceIds.length,
      loadedRows: rows.length,
    },
  });

  return rows;
}

async function saveAutomaticTranslation(args: {
  admin: AppSupabaseClient;
  source: CustomValueTranslationSourceRow;
  locale: string;
  translatedText: string;
  provider: string;
}): Promise<CustomValueTranslationRow> {
  const normalizedLocale = normalizeLocale(args.locale) ?? DEFAULT_LOCALE;
  const now = new Date().toISOString();
  const row: CustomValueTranslationRow = {
    id: buildTranslationId(args.source.id, normalizedLocale),
    source_id: args.source.id,
    locale: normalizedLocale,
    translated_text: args.translatedText,
    is_manual: false,
    provider: args.provider,
    source_hash_at_translation: args.source.source_hash,
  };

  const { error } = await args.admin.from(TRANSLATION_TABLE).upsert(
    {
      ...row,
      updated_at: now,
    } as any,
    { onConflict: "source_id,locale" },
  );

  if (error) {
    throw error;
  }

  observeTranslation(
    buildObservationContext({
      source: args.source,
      requestedLocale: normalizedLocale,
      provider: args.provider,
      event: "translation.db.upsert_translation",
    }),
    {
      outcome: "db_upsert_translation",
      details: {
        locale: normalizedLocale,
        translatedTextLength: args.translatedText.length,
        isManual: false,
      },
    },
  );

  return row;
}

async function getTranslationForLocale(args: {
  admin: AppSupabaseClient;
  source: CustomValueTranslationSourceRow;
  locale: string;
  existingTranslation?: CustomValueTranslationRow | null;
}) {
  const normalizedLocale = normalizeLocale(args.locale);
  const normalizedSourceLocale = normalizeLocale(args.source.source_locale);

  const context = buildObservationContext({
    source: args.source,
    requestedLocale: normalizedLocale ?? args.locale,
    provider: args.existingTranslation?.provider ?? null,
    event: "translation.resolve_locale",
  });

  if (!normalizedLocale) {
    observeTranslation(context, {
      outcome: "invalid_locale",
      details: {
        locale: args.locale,
      },
    });
    return null;
  }

  if (!normalizedSourceLocale) {
    observeTranslation(context, {
      outcome: "unknown_source_locale",
      details: {
        reason: "source locale missing or invalid; returning source text",
      },
    });
    return null;
  }

  if (normalizedLocale === normalizedSourceLocale) {
    observeTranslation(context, {
      outcome: "source_locale_bypass",
      details: {
        reason: "requested locale equals source locale",
      },
    });
    return null;
  }

  if (args.source.source_text.trim() === "") {
    observeTranslation(context, {
      outcome: "empty_source_bypass",
      details: {
        reason: "empty source text",
      },
    });
    return null;
  }

  const translation = args.existingTranslation ?? null;

  if (translation?.is_manual && translation.translated_text !== null) {
    observeTranslation(
      buildObservationContext({
        source: args.source,
        requestedLocale: normalizedLocale,
        provider: translation.provider,
        event: "translation.cache.lookup",
      }),
      {
        outcome: "cache_hit_manual",
        details: {
          locale: normalizedLocale,
          translatedTextLength: translation.translated_text.length,
        },
      },
    );
    return translation;
  }

  if (isFreshAutomaticTranslation(args.source, translation)) {
    observeTranslation(
      buildObservationContext({
        source: args.source,
        requestedLocale: normalizedLocale,
        provider: translation?.provider,
        event: "translation.cache.lookup",
      }),
      {
        outcome: "cache_hit_automatic",
        details: {
          locale: normalizedLocale,
          translatedTextLength: translation?.translated_text?.length ?? 0,
        },
      },
    );
    return translation ?? null;
  }

  if (translation && !translation.is_manual) {
    observeTranslation(
      buildObservationContext({
        source: args.source,
        requestedLocale: normalizedLocale,
        provider: translation.provider,
        event: "translation.cache.lookup",
      }),
      {
        outcome: "stale_automatic",
        details: {
          locale: normalizedLocale,
          previousProvider: translation.provider,
          hadTranslatedText: translation.translated_text !== null,
          sourceHashAtTranslation: translation.source_hash_at_translation,
          currentSourceHash: args.source.source_hash,
        },
      },
    );
  } else {
    observeTranslation(context, {
      outcome: "cache_miss",
      details: {
        locale: normalizedLocale,
      },
    });
  }

  observeTranslation(context, {
    outcome: "provider_attempt",
    details: {
      locale: normalizedLocale,
      sourceTextLength: args.source.source_text.length,
    },
  });

  let translated: Awaited<ReturnType<typeof translateText>>;
  try {
    translated = await translateText({
      text: args.source.source_text,
      sourceLocale: normalizedSourceLocale,
      targetLocale: normalizedLocale,
    });
  } catch (error) {
    console.warn("[customValueTranslations]", {
      event: "translation.provider.call",
      sourceId: args.source.id,
      entityTable: args.source.entity_table,
      entityId: args.source.entity_id,
      fieldKey: args.source.field_key,
      requestedLocale: normalizedLocale,
      sourceLocale: args.source.source_locale,
      outcome: "provider_error",
      details: {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : String(error),
      },
    });
    return null;
  }

  if (!translated) {
    observeTranslation(context, {
      outcome: "provider_null",
      details: {
        locale: normalizedLocale,
      },
    });
    return null;
  }

  observeTranslation(
    buildObservationContext({
      source: args.source,
      requestedLocale: normalizedLocale,
      provider: translated.provider,
      event: "translation.provider.call",
    }),
    {
      outcome: "provider_success",
      details: {
        locale: normalizedLocale,
        translatedTextLength: translated.translatedText.length,
      },
    },
  );

  return saveAutomaticTranslation({
    admin: args.admin,
    source: args.source,
    locale: normalizedLocale,
    translatedText: translated.translatedText,
    provider: translated.provider,
  });
}

function groupTranslationsBySourceId(rows: CustomValueTranslationRow[]) {
  const map = new Map<string, CustomValueTranslationRow[]>();

  for (const row of rows) {
    const group = map.get(row.source_id) ?? [];
    group.push(row);
    map.set(row.source_id, group);
  }

  return map;
}

export async function upsertTranslationSource(
  admin: AppSupabaseClient,
  args: TranslationTarget,
): Promise<CustomValueTranslationSourceRow> {
  const row = buildSourceRow(args);

  const { error } = await admin.from(TRANSLATION_SOURCE_TABLE).upsert(
    {
      ...row,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }

  observeTranslation(
    buildObservationContext({
      source: row,
      event: "translation.db.upsert_source",
    }),
    {
      outcome: "db_upsert_source",
      details: {
        sourceTextLength: row.source_text.length,
        sourceHash: row.source_hash,
      },
    },
  );

  return row;
}

export async function ensureTranslationForLocale(args: {
  admin: AppSupabaseClient;
  source: CustomValueTranslationSourceRow;
  locale: string;
  existingTranslation?: CustomValueTranslationRow | null;
}): Promise<CustomValueTranslationRow | null> {
  return getTranslationForLocale(args);
}

export async function invalidateOrRefreshStaleTranslations(args: {
  admin: AppSupabaseClient;
  source: CustomValueTranslationSourceRow;
  locales?: readonly string[];
}) {
  const existingTranslations = await loadTranslationsForSourceIds(args.admin, [
    args.source.id,
  ]);

  const locales = Array.from(
    new Set(
      (args.locales ?? existingTranslations.map((row) => row.locale))
        .map((value) => normalizeLocale(value))
        .filter((value): value is AppLocale => Boolean(value)),
    ),
  );

  if (locales.length === 0) {
    return existingTranslations;
  }

  const refreshed = await Promise.all(
    locales.map(async (locale) =>
      ensureTranslationForLocale({
        admin: args.admin,
        source: args.source,
        locale,
        existingTranslation:
          getTranslationForRequestedLocale({
            translations: existingTranslations,
            requestedLocale: locale,
          }) ?? null,
      }),
    ),
  );

  return refreshed.filter((row): row is CustomValueTranslationRow =>
    Boolean(row),
  );
}

export async function ensureImmediateTranslationsForSource(args: {
  admin: AppSupabaseClient;
  source: CustomValueTranslationSourceRow;
}) {
  return loadTranslationsForSourceIds(args.admin, [args.source.id]);
}

export async function resolveTranslatedValue(args: {
  admin: AppSupabaseClient;
  source: CustomValueTranslationSourceRow;
  requestedLocale: string;
  translations?: CustomValueTranslationRow[];
}) {
  const bypass = resolveSourceTextWhenLocaleUnavailable({
    source: args.source,
    requestedLocale: args.requestedLocale,
  });

  if (bypass) {
    observeTranslation(
      buildObservationContext({
        source: args.source,
        requestedLocale: bypass.requestedLocale ?? args.requestedLocale,
        event: "translation.resolve_value",
      }),
      {
        outcome:
          bypass.reason === "unknown_source_locale"
            ? "unknown_source_locale"
            : bypass.reason === "same_locale"
              ? "source_locale_bypass"
              : bypass.reason === "empty_source_text"
                ? "empty_source_bypass"
                : "invalid_locale",
        details: {
          reason: bypass.reason,
        },
      },
    );

    return bypass.value;
  }

  const requestedLocale = normalizeLocale(args.requestedLocale);
  if (!requestedLocale) {
    return args.source.source_text;
  }

  const translations =
    args.translations ??
    (await loadTranslationsForSourceIds(args.admin, [args.source.id]));

  const existingTranslation =
    getTranslationForRequestedLocale({
      translations,
      requestedLocale,
    }) ?? null;

  const ensuredTranslation = await ensureTranslationForLocale({
    admin: args.admin,
    source: args.source,
    locale: requestedLocale,
    existingTranslation,
  });

  return getBestTranslatedDisplayValue({
    source: args.source,
    translations: ensuredTranslation
      ? dedupeTranslations([...translations, ensuredTranslation])
      : translations,
    requestedLocale,
  });
}

export async function resolveTranslationBatch(args: {
  admin: AppSupabaseClient;
  items: TranslationBatchItem[];
}) {
  console.info("[customValueTranslations]", {
    event: "translation.batch",
    outcome: "batch_start",
    details: {
      itemCount: args.items.length,
    },
  });

  const sourceById = new Map<string, CustomValueTranslationSourceRow>();

  for (const item of args.items) {
    const source = buildSourceRow(item);
    sourceById.set(source.id, source);
  }

  await Promise.all(
    Array.from(sourceById.values()).map((source) =>
      upsertTranslationSource(args.admin, {
        teamId: source.team_id,
        organizationId: source.organization_id,
        entityTable: source.entity_table,
        entityId: source.entity_id,
        fieldKey: source.field_key,
        sourceText: source.source_text,
        sourceLocale: source.source_locale,
      }),
    ),
  );

  const loadedTranslations = await loadTranslationsForSourceIds(
    args.admin,
    Array.from(sourceById.keys()),
  );
  const translationsBySourceId =
    groupTranslationsBySourceId(loadedTranslations);
  const uniqueRequests = Array.from(
    new Set(
      args.items.map((item) => {
        const source = buildSourceRow(item);
        const locale = normalizeLocale(item.requestedLocale) ?? DEFAULT_LOCALE;
        return `${source.id}::${locale}`;
      }),
    ),
  );

  await Promise.all(
    uniqueRequests.map(async (key) => {
      const [sourceId, locale] = key.split("::");
      const source = sourceById.get(sourceId);
      if (!source || !locale) {
        return;
      }

      const translation = await ensureTranslationForLocale({
        admin: args.admin,
        source,
        locale,
        existingTranslation:
          getTranslationForRequestedLocale({
            translations: translationsBySourceId.get(sourceId) ?? [],
            requestedLocale: locale,
          }) ?? null,
      });

      if (translation) {
        const group = translationsBySourceId.get(sourceId) ?? [];
        const nextGroup = group.filter(
          (row) => row.locale !== translation.locale,
        );
        nextGroup.push(translation);
        translationsBySourceId.set(sourceId, nextGroup);
      }
    }),
  );

  const resolvedValues = await Promise.all(
    args.items.map(async (item) => {
      const source = buildSourceRow(item);
      const value = await resolveTranslatedValue({
        admin: args.admin,
        source,
        requestedLocale: item.requestedLocale,
        translations: translationsBySourceId.get(source.id) ?? [],
      });

      return {
        item,
        source,
        translations: translationsBySourceId.get(source.id) ?? [],
        value,
      };
    }),
  );

  console.info("[customValueTranslations]", {
    event: "translation.batch",
    outcome: "batch_complete",
    details: {
      itemCount: args.items.length,
      uniqueSourceCount: sourceById.size,
      uniqueRequestCount: uniqueRequests.length,
      loadedTranslationCount: loadedTranslations.length,
      resolvedValueCount: resolvedValues.length,
    },
  });

  return resolvedValues;
}

export async function resolveDisplayFieldMap(args: {
  admin: AppSupabaseClient;
  requestedLocale: string;
  fields: ResolveDisplayFieldMapItem[];
}): Promise<Record<string, string>> {
  const normalizedRequestedLocale =
    normalizeLocale(args.requestedLocale) ?? DEFAULT_LOCALE;

  const items: TranslationBatchItem[] = args.fields.map((field) => ({
    ...field.source,
    requestedLocale: normalizedRequestedLocale,
  }));

  const resolved = await resolveTranslationBatch({
    admin: args.admin,
    items,
  });

  const valuesBySourceId = new Map<string, ResolvedTranslationBatchItem>();
  for (const entry of resolved) {
    valuesBySourceId.set(entry.source.id, entry);
  }

  const output: Record<string, string> = {};
  for (const field of args.fields) {
    const source = buildSourceRow(field.source);
    output[field.outputKey] =
      valuesBySourceId.get(source.id)?.value ?? source.source_text;
  }

  return output;
}

export async function resolveDisplayFieldMapForRows<RowType>(args: {
  admin: AppSupabaseClient;
  requestedLocale: string;
  rows: RowType[];
  fields: Array<{
    outputKey: string | ((row: RowType) => string);
    target: (row: RowType) => TranslationTarget;
  }>;
}): Promise<Map<string, Record<string, string>>> {
  const requests: ResolveDisplayFieldMapItem[] = [];

  for (const row of args.rows) {
    for (const field of args.fields) {
      const outputKey =
        typeof field.outputKey === "function"
          ? field.outputKey(row)
          : field.outputKey;

      if (!outputKey || !outputKey.trim()) {
        continue;
      }

      requests.push({
        outputKey,
        source: field.target(row),
      });
    }
  }

  const resolvedMap = await resolveDisplayFieldMap({
    admin: args.admin,
    requestedLocale: args.requestedLocale,
    fields: requests,
  });

  const outputByEntityId = new Map<string, Record<string, string>>();

  for (const row of args.rows) {
    for (const field of args.fields) {
      const target = field.target(row);
      const outputKey =
        typeof field.outputKey === "function"
          ? field.outputKey(row)
          : field.outputKey;

      if (!outputKey || !outputKey.trim()) {
        continue;
      }

      const source = buildSourceRow(target);
      const current = outputByEntityId.get(target.entityId) ?? {};
      current[outputKey] = resolvedMap[outputKey] ?? source.source_text;
      outputByEntityId.set(target.entityId, current);
    }
  }

  return outputByEntityId;
}

export async function deleteTranslationSources(args: {
  admin: AppSupabaseClient;
  entityTable: string;
  entityIds: string[];
}) {
  const entityIds = Array.from(
    new Set(args.entityIds.map((value) => value.trim()).filter(Boolean)),
  );

  if (entityIds.length === 0) {
    return;
  }

  const { error } = await args.admin
    .from(TRANSLATION_SOURCE_TABLE)
    .delete()
    .eq("entity_table", args.entityTable)
    .in("entity_id", entityIds);

  if (error) {
    throw error;
  }
}
