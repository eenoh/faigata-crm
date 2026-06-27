import "server-only";

import type { CustomFieldType } from "@/features/crm/types/lead";
import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/config";
import { translateText } from "@/features/i18n/server/translationProvider";

type DynamicTranslationSourceLocalePolicy =
  | "required"
  | "allow_unknown_as_source";

export type DynamicDisplayTranslationItem = {
  cacheKey: string;
  fieldKey: string;
  value: unknown;
  targetLocale: string;
  sourceLocale?: string | null;
  fieldType?: CustomFieldType | null;

  /**
   * Caller intent must be explicit when the source locale is missing.
   *
   * - "required":
   *   Do not guess. Return source text unchanged and emit
   *   translation.unknown_source_locale when sourceLocale is missing/invalid.
   *
   * - "allow_unknown_as_source":
   *   Caller explicitly allows a display-only fallback that assumes the
   *   default locale as the provider source locale when sourceLocale is
   *   missing/invalid.
   */
  sourceLocalePolicy: DynamicTranslationSourceLocalePolicy;
};

const MAX_DYNAMIC_TRANSLATION_CACHE_ENTRIES = 500;
const MAX_TRANSLATABLE_TEXT_LENGTH = 2_000;

const dynamicTranslationCache = new Map<string, string>();

const RAW_DATA_FIELD_PATTERNS = [
  /(^|_)id$/,
  /(^|_)uuid$/,
  /(^|_)external_id$/,
  /(^|_)record_id$/,
  /email/,
  /phone/,
  /mobile/,
  /whatsapp/,
  /contact(_value)?$/,
  /url$/,
  /link$/,
  /website/,
  /domain$/,
  /postal/,
  /^zip$/,
  /^zip_/,
  /(^|_)code$/,
  /(^|_)currency$/,
  /(^|_)iso$/,
  /slug$/,
  /handle$/,
  /username$/,
  /(^|_)path$/,
  /(^|_)file$/,
  /(^|_)filename$/,
  /(^|_)mime$/,
  /(^|_)token$/,
  /(^|_)secret$/,
  /(^|_)key$/,
  /timestamp$/,
  /(^|_)date$/,
  /(^|_)time$/,
  /(^|_)datetime$/,
  /(^|_)created_at$/,
  /(^|_)updated_at$/,
  /(^|_)deleted_at$/,
] as const;

const HUMAN_TEXT_FIELD_HINTS = [
  /(^|_)label$/,
  /(^|_)title$/,
  /(^|_)description$/,
  /(^|_)summary$/,
  /(^|_)notes?$/,
  /(^|_)message$/,
  /(^|_)comment$/,
  /(^|_)headline$/,
  /(^|_)caption$/,
  /(^|_)prompt$/,
  /(^|_)question$/,
  /(^|_)answer$/,
  /(^|_)status_label$/,
  /(^|_)display_name$/,
  /(^|_)confirmation_heading$/,
  /(^|_)confirmation_subheading$/,
] as const;

const ENTITY_BACKED_FIELD_KEYS = new Set([
  "lead_name",
  "country",
  "region",
  "city",
  "notes",
  "source_name",
]);

function observeDynamicTranslation(
  event: string,
  details: Record<string, unknown>,
) {
  console.info("[dynamicDisplayTranslation]", {
    event,
    ...details,
  });
}

function rememberDynamicTranslation(cacheKey: string, value: string) {
  if (dynamicTranslationCache.has(cacheKey)) {
    dynamicTranslationCache.delete(cacheKey);
  }

  dynamicTranslationCache.set(cacheKey, value);

  if (dynamicTranslationCache.size <= MAX_DYNAMIC_TRANSLATION_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = dynamicTranslationCache.keys().next().value;
  if (typeof oldestKey === "string") {
    dynamicTranslationCache.delete(oldestKey);
  }
}

function normalizeFieldKey(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => normalizeDisplayValue(entry))
      .filter((entry): entry is string => Boolean(entry));

    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (typeof value === "object") {
    const parts = Object.values(value as Record<string, unknown>)
      .map((entry) => normalizeDisplayValue(entry))
      .filter((entry): entry is string => Boolean(entry));

    if (parts.length > 0) {
      return parts.join(", ");
    }

    try {
      const serialized = JSON.stringify(value);
      return serialized && serialized !== "{}" ? serialized : null;
    } catch {
      return null;
    }
  }

  const nextValue = String(value).trim();
  return nextValue.length > 0 ? nextValue : null;
}

function hasLetters(value: string) {
  return /\p{L}/u.test(value);
}

function countLetters(value: string) {
  return (value.match(/\p{L}/gu) ?? []).length;
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);
}

function isUrl(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    /^(www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(value)
  );
}

function isPhoneNumber(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+?\d{7,}$/.test(compact);
}

function isNumericLike(value: string) {
  return /^[-+]?[\d\s.,/%]+$/.test(value);
}

function isTimestampLike(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?(?:z|[+-]\d{2}:\d{2})?$/i.test(
      value,
    ) || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(value)
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isSnakeCaseIdentifier(value: string) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(value);
}

function isKebabCaseIdentifier(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(value);
}

function isUpperCodeIdentifier(value: string) {
  return /^(?:[A-Z0-9]{2,}[-_:]){1,}[A-Z0-9-_:]+$/.test(value);
}

function isFilePath(value: string) {
  return (
    /^(?:[a-z]:\\|\/)/i.test(value) ||
    /^(?:\.{1,2}\/)+/.test(value) ||
    /[\\/][^\\/\s]+\.[a-z0-9]{1,8}$/i.test(value)
  );
}

function isHtmlLike(value: string) {
  return /<\/?[a-z][^>]*>/i.test(value);
}

function isJsonLike(value: string) {
  const trimmed = value.trim();
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isMostlyMachineText(value: string) {
  const tokens = value.split(/[\s,;|/]+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  const machineLikeTokens = tokens.filter(
    (token) =>
      isEmail(token) ||
      isUrl(token) ||
      isPhoneNumber(token) ||
      isUuid(token) ||
      isSnakeCaseIdentifier(token) ||
      isKebabCaseIdentifier(token) ||
      isUpperCodeIdentifier(token),
  );

  return (
    machineLikeTokens.length > 0 &&
    machineLikeTokens.length >= tokens.length / 2
  );
}

function isShortAcronymLike(value: string) {
  const trimmed = value.trim();
  return /^[A-Z]{2,6}$/.test(trimmed);
}

function isTechnicalIdentifier(value: string) {
  return (
    isUuid(value) ||
    isSnakeCaseIdentifier(value) ||
    isKebabCaseIdentifier(value) ||
    isUpperCodeIdentifier(value)
  );
}

function hasHumanTextFieldHint(normalizedFieldKey: string) {
  return HUMAN_TEXT_FIELD_HINTS.some((pattern) =>
    pattern.test(normalizedFieldKey),
  );
}

function isEntityBackedTranslationField(fieldKey: string) {
  return ENTITY_BACKED_FIELD_KEYS.has(normalizeFieldKey(fieldKey));
}

function getSkipReason(args: {
  fieldKey: string;
  fieldType?: CustomFieldType | null;
  text: string;
}): string | null {
  const normalizedFieldKey = normalizeFieldKey(args.fieldKey);
  const wordCount = countWords(args.text);
  const letterCount = countLetters(args.text);

  if (
    args.fieldType === "number" ||
    args.fieldType === "boolean" ||
    args.fieldType === "link"
  ) {
    return `field_type:${args.fieldType}`;
  }

  if (
    RAW_DATA_FIELD_PATTERNS.some((pattern) =>
      pattern.test(normalizedFieldKey),
    ) &&
    !hasHumanTextFieldHint(normalizedFieldKey)
  ) {
    return "raw_data_field_pattern";
  }

  if (!hasLetters(args.text)) {
    return "no_letters";
  }

  if (args.text.length > MAX_TRANSLATABLE_TEXT_LENGTH) {
    return "too_long";
  }

  if (isEmail(args.text)) {
    return "email";
  }

  if (isUrl(args.text)) {
    return "url";
  }

  if (isPhoneNumber(args.text)) {
    return "phone";
  }

  if (isNumericLike(args.text)) {
    return "numeric_like";
  }

  if (isTimestampLike(args.text)) {
    return "timestamp_like";
  }

  if (isFilePath(args.text)) {
    return "file_path";
  }

  if (isHtmlLike(args.text)) {
    return "html_like";
  }

  if (isJsonLike(args.text)) {
    return "json_like";
  }

  if (isTechnicalIdentifier(args.text)) {
    return "technical_identifier";
  }

  if (isShortAcronymLike(args.text) && wordCount === 1) {
    return "short_acronym";
  }

  if (!hasHumanTextFieldHint(normalizedFieldKey)) {
    if (letterCount <= 2 && wordCount <= 1) {
      return "too_short";
    }

    if (isMostlyMachineText(args.text)) {
      return "mostly_machine_text";
    }
  }

  return null;
}

type ResolvedSourceLocale =
  | {
      kind: "known";
      sourceLocale: string;
    }
  | {
      kind: "unknown";
      fallbackSourceLocale?: string;
      reason: "missing_or_invalid_source_locale";
    };

function resolveDynamicSourceLocale(args: {
  sourceLocale?: string | null;
  sourceLocalePolicy: DynamicTranslationSourceLocalePolicy;
}): ResolvedSourceLocale {
  const normalizedSourceLocale = normalizeLocale(args.sourceLocale);

  if (normalizedSourceLocale) {
    return {
      kind: "known",
      sourceLocale: normalizedSourceLocale,
    };
  }

  if (args.sourceLocalePolicy === "allow_unknown_as_source") {
    return {
      kind: "unknown",
      fallbackSourceLocale: DEFAULT_LOCALE,
      reason: "missing_or_invalid_source_locale",
    };
  }

  return {
    kind: "unknown",
    reason: "missing_or_invalid_source_locale",
  };
}

export async function translateDynamicDisplayValuesBatch(
  items: DynamicDisplayTranslationItem[],
) {
  const results = new Map<string, string | null>();

  type PreparedItem = {
    cacheKey: string;
    groupKey: string;
    text: string;
    sourceLocale: string;
    targetLocale: string;
    fieldKey: string;
    fieldType?: CustomFieldType | null;
    sourceLocalePolicy: DynamicTranslationSourceLocalePolicy;
    sourceLocaleWasUnknown: boolean;
  };

  const preparedByGroup = new Map<string, PreparedItem[]>();

  for (const item of items) {
    const text = normalizeDisplayValue(item.value);
    if (!text) {
      results.set(item.cacheKey, null);
      continue;
    }

    const targetLocale = normalizeLocale(item.targetLocale) ?? DEFAULT_LOCALE;
    const sourceLocaleResolution = resolveDynamicSourceLocale({
      sourceLocale: item.sourceLocale,
      sourceLocalePolicy: item.sourceLocalePolicy,
    });

    if (sourceLocaleResolution.kind === "unknown") {
      observeDynamicTranslation("translation.unknown_source_locale", {
        cacheKey: item.cacheKey,
        fieldKey: item.fieldKey,
        fieldType: item.fieldType,
        targetLocale,
        textLength: text.length,
        sourceLocalePolicy: item.sourceLocalePolicy,
        entityBackedField: isEntityBackedTranslationField(item.fieldKey),
        reason: sourceLocaleResolution.reason,
      });

      if (!sourceLocaleResolution.fallbackSourceLocale) {
        results.set(item.cacheKey, text);
        observeDynamicTranslation("translation.skipped", {
          cacheKey: item.cacheKey,
          fieldKey: item.fieldKey,
          fieldType: item.fieldType,
          targetLocale,
          textLength: text.length,
          sourceLocalePolicy: item.sourceLocalePolicy,
          reason: "unknown_source_locale",
        });
        continue;
      }
    }

    const sourceLocale =
      sourceLocaleResolution.kind === "known"
        ? sourceLocaleResolution.sourceLocale
        : sourceLocaleResolution.fallbackSourceLocale!;

    if (sourceLocale === targetLocale) {
      results.set(item.cacheKey, text);
      observeDynamicTranslation("translation.skipped", {
        cacheKey: item.cacheKey,
        fieldKey: item.fieldKey,
        fieldType: item.fieldType,
        sourceLocale,
        targetLocale,
        sourceLocalePolicy: item.sourceLocalePolicy,
        sourceLocaleWasUnknown: sourceLocaleResolution.kind === "unknown",
        reason: "same_locale",
      });
      continue;
    }

    const skipReason = getSkipReason({
      fieldKey: item.fieldKey,
      fieldType: item.fieldType,
      text,
    });

    if (skipReason) {
      results.set(item.cacheKey, text);
      observeDynamicTranslation("translation.skipped", {
        cacheKey: item.cacheKey,
        fieldKey: item.fieldKey,
        fieldType: item.fieldType,
        sourceLocale,
        targetLocale,
        textLength: text.length,
        sourceLocalePolicy: item.sourceLocalePolicy,
        sourceLocaleWasUnknown: sourceLocaleResolution.kind === "unknown",
        reason: skipReason,
      });
      continue;
    }

    const translationCacheKey = [sourceLocale, targetLocale, text].join("::");
    const cached = dynamicTranslationCache.get(translationCacheKey);
    if (cached) {
      results.set(item.cacheKey, cached);
      observeDynamicTranslation("translation.cache_hit", {
        cacheKey: item.cacheKey,
        fieldKey: item.fieldKey,
        sourceLocale,
        targetLocale,
        textLength: text.length,
        sourceLocalePolicy: item.sourceLocalePolicy,
        sourceLocaleWasUnknown: sourceLocaleResolution.kind === "unknown",
      });
      continue;
    }

    const preparedItem: PreparedItem = {
      cacheKey: item.cacheKey,
      groupKey: translationCacheKey,
      text,
      sourceLocale,
      targetLocale,
      fieldKey: item.fieldKey,
      fieldType: item.fieldType,
      sourceLocalePolicy: item.sourceLocalePolicy,
      sourceLocaleWasUnknown: sourceLocaleResolution.kind === "unknown",
    };

    const group = preparedByGroup.get(translationCacheKey) ?? [];
    group.push(preparedItem);
    preparedByGroup.set(translationCacheKey, group);
  }

  await Promise.all(
    Array.from(preparedByGroup.entries()).map(async ([groupKey, group]) => {
      const representative = group[0];
      if (!representative) {
        return;
      }

      let resolvedText = representative.text;

      try {
        observeDynamicTranslation("translation.provider_attempt", {
          groupKey,
          itemCount: group.length,
          fieldKey: representative.fieldKey,
          fieldType: representative.fieldType,
          sourceLocale: representative.sourceLocale,
          targetLocale: representative.targetLocale,
          textLength: representative.text.length,
          sourceLocalePolicy: representative.sourceLocalePolicy,
          sourceLocaleWasUnknown: representative.sourceLocaleWasUnknown,
          mode: "display_only_fallback",
        });

        const translated = await translateText({
          text: representative.text,
          sourceLocale: representative.sourceLocale,
          targetLocale: representative.targetLocale,
        });

        if (translated?.translatedText?.trim()) {
          resolvedText = translated.translatedText.trim();

          observeDynamicTranslation("translation.provider_success", {
            groupKey,
            itemCount: group.length,
            provider: translated.provider,
            sourceLocale: representative.sourceLocale,
            targetLocale: representative.targetLocale,
            sourceTextLength: representative.text.length,
            translatedTextLength: resolvedText.length,
            sourceLocalePolicy: representative.sourceLocalePolicy,
            sourceLocaleWasUnknown: representative.sourceLocaleWasUnknown,
            mode: "display_only_fallback",
          });
        } else {
          observeDynamicTranslation("translation.provider_fallback", {
            groupKey,
            itemCount: group.length,
            sourceLocale: representative.sourceLocale,
            targetLocale: representative.targetLocale,
            reason: "empty_provider_result",
            sourceLocalePolicy: representative.sourceLocalePolicy,
            sourceLocaleWasUnknown: representative.sourceLocaleWasUnknown,
            mode: "display_only_fallback",
          });
        }
      } catch (error) {
        console.warn(
          "[dynamicDisplayTranslation] falling back to source text",
          {
            groupKey,
            itemCount: group.length,
            sourceLocale: representative.sourceLocale,
            targetLocale: representative.targetLocale,
            sourceLocalePolicy: representative.sourceLocalePolicy,
            sourceLocaleWasUnknown: representative.sourceLocaleWasUnknown,
            mode: "display_only_fallback",
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : String(error),
          },
        );
      }

      rememberDynamicTranslation(groupKey, resolvedText);

      for (const item of group) {
        results.set(item.cacheKey, resolvedText);
      }
    }),
  );

  return results;
}
