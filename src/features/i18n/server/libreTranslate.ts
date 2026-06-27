import "server-only";

import { serverEnv } from "@/lib/env/server";
import { normalizeLocale, type AppLocale } from "@/i18n/config";

type TranslateWithLibreTranslateArgs = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
};

type LibreTranslateResponse = {
  translatedText?: unknown;
  error?: unknown;
};

type LibreTranslateLanguage = {
  code?: unknown;
  name?: unknown;
  targets?: unknown;
};

type TranslateWithLibreTranslateResult = {
  translatedText: string;
  provider: string;
};

type NetworkErrorDetails = {
  message: string;
  code: string | null;
  causeCode: string | null;
  nestedCodes: string[];
};

type SourceLocaleOrigin = "explicit" | "unknown_or_defaulted" | "invalid";

type TranslationMetricContext = {
  operation: "translate" | "languages";
  endpoint: string;
  baseUrl: string;
  provider: "libretranslate";
  sourceLocale?: string;
  targetLocale?: string;
  sourceCode?: string;
  targetCode?: string;
  textLength?: number;
  batchSize?: number;
  sourceLocaleOrigin?: SourceLocaleOrigin;
};

type TranslationMetricResult = {
  ok: boolean;
  outcome:
    | "success"
    | "skipped"
    | "non_ok_response"
    | "provider_error"
    | "timeout"
    | "connection_failed"
    | "request_failed"
    | "invalid_payload"
    | "unsupported_locale"
    | "cooldown"
    | "missing_config"
    | "invalid_locale";
  status?: number;
  statusText?: string;
  durationMs: number;
  providerErrorMessage?: string;
  responseBytes?: number;
  translatedTextLength?: number;
  cache?: "supported_languages" | "unsupported_locale" | "none";
  details?: Record<string, unknown>;
};

type TranslationBatchCapability = {
  supported: false;
  reason: "not_implemented";
};

type SupportedLanguageCatalog = {
  expiresAt: number;
  codes: Set<string>;
  lookup: Map<string, string>;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const NETWORK_FAILURE_COOLDOWN_MS = 60_000;
const SUPPORTED_LANGUAGES_CACHE_MS = 5 * 60_000;
const UNSUPPORTED_LOCALE_CACHE_MS = 10 * 60_000;

const PROVIDER_NAME = "libretranslate" as const;

let networkFailuresBlockedUntil = 0;

let cachedSupportedLanguages: SupportedLanguageCatalog | null = null;

const unsupportedLocaleCache = new Map<string, number>();

function normalizeBaseUrl(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim().replace(/\/+$/, "");
}

function resolveTranslateEndpoint(baseUrl: string) {
  return `${baseUrl}/translate`;
}

function resolveLanguagesEndpoint(baseUrl: string) {
  return `${baseUrl}/languages`;
}

function normalizeLibreLocale(value: string): AppLocale | null {
  return normalizeLocale(value);
}

function mapLocaleForLibreTranslate(value: AppLocale) {
  const mapping: Record<string, string> = {
    en: "en",
    de: "de",
    fr: "fr",
    es: "es",
    it: "it",
    pt: "pt",
    nl: "nl",
    pl: "pl",
    ru: "ru",
    ja: "ja",
    ko: "ko",
    zh: "zh",
    ar: "ar",
    tr: "tr",
    uk: "uk",
    cs: "cs",
    da: "da",
    fi: "fi",
    el: "el",
    hu: "hu",
    no: "no",
    ro: "ro",
    sk: "sk",
    sv: "sv",
    bg: "bg",
    hr: "hr",
    lt: "lt",
    lv: "lv",
    sl: "sl",
    et: "et",
    id: "id",
  };

  return mapping[value] ?? value;
}

function normalizeLanguageCodeToken(value: string) {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

function createLanguageCodeAliases(rawCode: string) {
  const aliases = new Set<string>();
  const normalizedCode = normalizeLanguageCodeToken(rawCode);

  if (!normalizedCode) {
    return aliases;
  }

  aliases.add(normalizedCode);

  const normalizedLocale = normalizeLibreLocale(normalizedCode);
  if (normalizedLocale) {
    aliases.add(normalizedLocale);
  }

  const baseCode = normalizedCode.split("-")[0];
  if (baseCode) {
    aliases.add(baseCode);
  }

  return aliases;
}

function resolveProviderLanguageCode(
  catalog: SupportedLanguageCatalog,
  requestedCode: string,
) {
  return catalog.lookup.get(normalizeLanguageCodeToken(requestedCode)) ?? null;
}

function getBatchCapability(): TranslationBatchCapability {
  return {
    supported: false,
    reason: "not_implemented",
  };
}

function nowMs() {
  return Date.now();
}

function clampString(value: string, maxLength = 300) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function getResponseSizeBytes(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function createMetricTimer() {
  const startedAt = nowMs();
  return {
    finish() {
      return Math.max(0, nowMs() - startedAt);
    },
  };
}

function inferSourceLocaleOrigin(args: {
  rawSourceLocale?: string | null;
  normalizedSourceLocale: AppLocale | null;
}): SourceLocaleOrigin {
  if (!args.normalizedSourceLocale) {
    return "invalid";
  }

  const raw = String(args.rawSourceLocale ?? "")
    .trim()
    .toLowerCase();
  if (!raw || raw !== args.normalizedSourceLocale) {
    return "unknown_or_defaulted";
  }

  return "explicit";
}

function logProviderEvent(
  level: "info" | "warn" | "error",
  event: string,
  context: TranslationMetricContext,
  result: TranslationMetricResult,
) {
  const payload = {
    event,
    provider: context.provider,
    operation: context.operation,
    endpoint: context.endpoint,
    baseUrl: context.baseUrl,
    sourceLocale: context.sourceLocale,
    targetLocale: context.targetLocale,
    sourceCode: context.sourceCode,
    targetCode: context.targetCode,
    sourceLocaleOrigin: context.sourceLocaleOrigin,
    textLength: context.textLength,
    batchSize: context.batchSize,
    ok: result.ok,
    outcome: result.outcome,
    status: result.status,
    statusText: result.statusText,
    durationMs: result.durationMs,
    responseBytes: result.responseBytes,
    translatedTextLength: result.translatedTextLength,
    cache: result.cache,
    providerErrorMessage: result.providerErrorMessage,
    details: result.details,
  };

  if (level === "error") {
    console.error("[translation-provider]", payload);
    return;
  }

  if (level === "warn") {
    console.warn("[translation-provider]", payload);
    return;
  }

  console.info("[translation-provider]", payload);
}

function recordProviderMetric(
  context: TranslationMetricContext,
  result: TranslationMetricResult,
) {
  logProviderEvent(
    result.ok ? "info" : "warn",
    "translation.provider.result",
    context,
    result,
  );
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /aborted|timeout/i.test(error.message))
  );
}

function getNetworkErrorDetails(error: unknown): NetworkErrorDetails {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      code: null,
      causeCode: null,
      nestedCodes: [],
    };
  }

  const code =
    typeof (error as Error & { code?: unknown }).code === "string"
      ? String((error as Error & { code?: unknown }).code)
      : null;

  const cause = (error as Error & { cause?: unknown }).cause;

  const causeCode =
    cause &&
    typeof cause === "object" &&
    typeof (cause as { code?: unknown }).code === "string"
      ? String((cause as { code?: unknown }).code)
      : cause &&
          typeof cause === "object" &&
          typeof (cause as { cause?: { code?: unknown } }).cause?.code ===
            "string"
        ? String((cause as { cause?: { code?: unknown } }).cause?.code)
        : null;

  const causeErrors =
    cause && typeof cause === "object"
      ? (cause as { errors?: unknown[] }).errors
      : undefined;

  const nestedCodes = Array.isArray(causeErrors)
    ? causeErrors
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          return typeof (entry as { code?: unknown }).code === "string"
            ? String((entry as { code?: unknown }).code)
            : null;
        })
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    message: String(error.message ?? ""),
    code,
    causeCode,
    nestedCodes,
  };
}

function isConnectionRefusedError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const message = String(error.message ?? "");
  const cause = (error as Error & { cause?: unknown }).cause;

  if (
    /ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|connection.*closed/i.test(
      message,
    )
  ) {
    return true;
  }

  if (cause && typeof cause === "object") {
    const causeCode = String(
      (cause as { code?: unknown }).code ??
        (cause as { cause?: { code?: unknown } }).cause?.code ??
        "",
    );

    if (causeCode === "ECONNREFUSED" || causeCode === "ECONNRESET") {
      return true;
    }

    const nestedErrors = (cause as { errors?: unknown[] }).errors;
    if (Array.isArray(nestedErrors)) {
      return nestedErrors.some((entry) => {
        if (!(entry instanceof Error)) return false;
        return (
          /ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|connection.*closed/i.test(
            String(entry.message ?? ""),
          ) ||
          String((entry as Error & { code?: unknown }).code ?? "") ===
            "ECONNREFUSED" ||
          String((entry as Error & { code?: unknown }).code ?? "") ===
            "ECONNRESET"
        );
      });
    }
  }

  return false;
}

function shouldSkipDueToCooldown() {
  return nowMs() < networkFailuresBlockedUntil;
}

function startNetworkFailureCooldown() {
  networkFailuresBlockedUntil = nowMs() + NETWORK_FAILURE_COOLDOWN_MS;
}

function clearNetworkFailureCooldown() {
  networkFailuresBlockedUntil = 0;
}

function isLocaleTemporarilyUnsupported(baseUrl: string, locale: string) {
  const key = `${baseUrl}::${locale}`;
  const blockedUntil = unsupportedLocaleCache.get(key) ?? 0;
  return nowMs() < blockedUntil;
}

function markLocaleUnsupported(baseUrl: string, locale: string) {
  const key = `${baseUrl}::${locale}`;
  unsupportedLocaleCache.set(key, nowMs() + UNSUPPORTED_LOCALE_CACHE_MS);
}

function clearUnsupportedLocale(baseUrl: string, locale: string) {
  const key = `${baseUrl}::${locale}`;
  unsupportedLocaleCache.delete(key);
}

function getTimeoutMs() {
  return Math.max(
    1_000,
    Number(
      serverEnv.translation.libreTranslateTimeoutMs?.() ?? DEFAULT_TIMEOUT_MS,
    ),
  );
}

function parseProviderErrorMessage(responseText: string) {
  try {
    const parsed = JSON.parse(responseText) as { error?: unknown };
    return typeof parsed?.error === "string" ? parsed.error.trim() : "";
  } catch {
    return "";
  }
}

function isUnsupportedLocaleMessage(message: string, locale: string) {
  const normalizedMessage = message.trim().toLowerCase();
  const normalizedLocale = locale.trim().toLowerCase();

  return (
    normalizedMessage === `${normalizedLocale} is not supported` ||
    normalizedMessage.includes(`${normalizedLocale} is not supported`)
  );
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json().catch(() => null)) as T | null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSupportedLanguageCatalog(
  baseUrl: string,
): Promise<SupportedLanguageCatalog | null> {
  const endpoint = resolveLanguagesEndpoint(baseUrl);
  const context: TranslationMetricContext = {
    operation: "languages",
    endpoint,
    baseUrl,
    provider: PROVIDER_NAME,
    batchSize: 1,
  };

  if (
    cachedSupportedLanguages &&
    cachedSupportedLanguages.expiresAt > nowMs()
  ) {
    recordProviderMetric(context, {
      ok: true,
      outcome: "success",
      durationMs: 0,
      cache: "supported_languages",
      details: {
        count: cachedSupportedLanguages.codes.size,
        source: "memory",
      },
    });
    return cachedSupportedLanguages;
  }

  const timer = createMetricTimer();

  const languages = await fetchJsonWithTimeout<LibreTranslateLanguage[]>(
    endpoint,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  ).catch((error) => {
    const durationMs = timer.finish();
    const details = getNetworkErrorDetails(error);

    if (isAbortError(error) || isConnectionRefusedError(error)) {
      recordProviderMetric(context, {
        ok: false,
        outcome: isAbortError(error) ? "timeout" : "connection_failed",
        durationMs,
        cache: "none",
        details: {
          message: details.message,
          code: details.code,
          causeCode: details.causeCode,
          nestedCodes: details.nestedCodes,
        },
      });
      startNetworkFailureCooldown();
      return null;
    }

    recordProviderMetric(context, {
      ok: false,
      outcome: "request_failed",
      durationMs,
      cache: "none",
      details: {
        message: details.message,
        code: details.code,
        causeCode: details.causeCode,
        nestedCodes: details.nestedCodes,
      },
    });
    return null;
  });

  if (!Array.isArray(languages)) {
    recordProviderMetric(context, {
      ok: false,
      outcome: "invalid_payload",
      durationMs: timer.finish(),
      cache: "none",
      details: {
        reason: "languages response was not an array",
      },
    });
    return null;
  }

  const codes = new Set<string>();
  const lookup = new Map<string, string>();

  for (const row of languages) {
    const code = typeof row?.code === "string" ? row.code.trim() : "";

    if (code) {
      codes.add(code);

      const normalizedCode = normalizeLanguageCodeToken(code);
      if (normalizedCode) {
        lookup.set(normalizedCode, code);
      }

      for (const alias of createLanguageCodeAliases(code)) {
        if (!lookup.has(alias)) {
          lookup.set(alias, code);
        }
      }
    }
  }

  cachedSupportedLanguages = {
    expiresAt: nowMs() + SUPPORTED_LANGUAGES_CACHE_MS,
    codes,
    lookup,
  };

  recordProviderMetric(context, {
    ok: true,
    outcome: "success",
    durationMs: timer.finish(),
    cache: "none",
    details: {
      count: codes.size,
      source: "provider",
    },
  });

  return cachedSupportedLanguages;
}

export async function translateWithLibreTranslate(
  args: TranslateWithLibreTranslateArgs,
): Promise<TranslateWithLibreTranslateResult | null> {
  const text = String(args.text ?? "");
  if (!text.trim()) {
    return null;
  }

  const sourceLocale = normalizeLibreLocale(args.sourceLocale);
  const targetLocale = normalizeLibreLocale(args.targetLocale);
  const sourceLocaleOrigin = inferSourceLocaleOrigin({
    rawSourceLocale: args.sourceLocale,
    normalizedSourceLocale: sourceLocale,
  });

  const baseUrl = normalizeBaseUrl(serverEnv.translation.libreTranslateUrl());
  const resolvedBaseUrl = baseUrl ?? "missing";
  const endpoint = baseUrl ? resolveTranslateEndpoint(baseUrl) : "missing";

  const context: TranslationMetricContext = {
    operation: "translate",
    endpoint,
    baseUrl: resolvedBaseUrl,
    provider: PROVIDER_NAME,
    sourceLocale: args.sourceLocale,
    targetLocale: args.targetLocale,
    textLength: text.length,
    batchSize: 1,
    sourceLocaleOrigin,
  };

  if (!sourceLocale || !targetLocale) {
    recordProviderMetric(context, {
      ok: false,
      outcome: "invalid_locale",
      durationMs: 0,
      cache: "none",
      details: {
        sourceLocale: args.sourceLocale,
        targetLocale: args.targetLocale,
        sourceLocaleOrigin,
      },
    });
    return null;
  }

  if (sourceLocale === targetLocale) {
    recordProviderMetric(
      {
        ...context,
        sourceCode: sourceLocale,
        targetCode: targetLocale,
      },
      {
        ok: true,
        outcome: "skipped",
        durationMs: 0,
        cache: "none",
        translatedTextLength: text.length,
        details: {
          reason: "same-locale",
          sourceLocaleOrigin,
        },
      },
    );

    return {
      translatedText: text,
      provider: PROVIDER_NAME,
    };
  }

  if (!baseUrl) {
    recordProviderMetric(context, {
      ok: false,
      outcome: "missing_config",
      durationMs: 0,
      cache: "none",
      details: {
        envVar: "LIBRETRANSLATE_URL",
        sourceLocaleOrigin,
      },
    });
    return null;
  }

  if (shouldSkipDueToCooldown()) {
    recordProviderMetric(context, {
      ok: false,
      outcome: "cooldown",
      durationMs: 0,
      cache: "none",
      details: {
        retryAfterMs: Math.max(0, networkFailuresBlockedUntil - nowMs()),
        sourceLocaleOrigin,
      },
    });
    return null;
  }

  const requestedSourceCode = mapLocaleForLibreTranslate(sourceLocale);
  const requestedTargetCode = mapLocaleForLibreTranslate(targetLocale);

  const resolvedContext: TranslationMetricContext = {
    ...context,
    endpoint: resolveTranslateEndpoint(baseUrl),
    baseUrl,
    sourceLocale: sourceLocale,
    targetLocale: targetLocale,
    sourceCode: requestedSourceCode,
    targetCode: requestedTargetCode,
    sourceLocaleOrigin,
  };

  if (
    isLocaleTemporarilyUnsupported(baseUrl, requestedSourceCode) ||
    isLocaleTemporarilyUnsupported(baseUrl, requestedTargetCode)
  ) {
    recordProviderMetric(resolvedContext, {
      ok: false,
      outcome: "unsupported_locale",
      durationMs: 0,
      cache: "unsupported_locale",
      details: {
        sourceCode: requestedSourceCode,
        targetCode: requestedTargetCode,
        reason: "cached-unsupported-locale",
        sourceLocaleOrigin,
      },
    });
    return null;
  }

  const supportedLanguages = await getSupportedLanguageCatalog(baseUrl);
  const resolvedSourceCode =
    supportedLanguages
      ? resolveProviderLanguageCode(supportedLanguages, requestedSourceCode)
      : requestedSourceCode;
  const resolvedTargetCode =
    supportedLanguages
      ? resolveProviderLanguageCode(supportedLanguages, requestedTargetCode)
      : requestedTargetCode;

  const translatedContext: TranslationMetricContext = {
    ...resolvedContext,
    sourceCode: resolvedSourceCode ?? undefined,
    targetCode: resolvedTargetCode ?? undefined,
  };

  if (supportedLanguages) {
    if (!resolvedSourceCode) {
      markLocaleUnsupported(baseUrl, requestedSourceCode);
      recordProviderMetric(translatedContext, {
        ok: false,
        outcome: "unsupported_locale",
        durationMs: 0,
        cache: "supported_languages",
        details: {
          locale: requestedSourceCode,
          role: "source",
          sourceLocaleOrigin,
        },
      });
      return null;
    }

    if (!resolvedTargetCode) {
      markLocaleUnsupported(baseUrl, requestedTargetCode);
      recordProviderMetric(translatedContext, {
        ok: false,
        outcome: "unsupported_locale",
        durationMs: 0,
        cache: "supported_languages",
        details: {
          locale: requestedTargetCode,
          role: "target",
          sourceLocaleOrigin,
        },
      });
      return null;
    }
  }

  const sourceCode = resolvedSourceCode ?? requestedSourceCode;
  const targetCode = resolvedTargetCode ?? requestedTargetCode;

  const apiKey = serverEnv.translation.libreTranslateApiKey();
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const timer = createMetricTimer();

  try {
    const response = await fetch(resolvedContext.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        q: text,
        source: sourceCode,
        target: targetCode,
        format: "text",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const providerErrorMessage = parseProviderErrorMessage(responseText);

      if (response.status === 400) {
        if (isUnsupportedLocaleMessage(providerErrorMessage, targetCode)) {
          markLocaleUnsupported(baseUrl, targetCode);
          recordProviderMetric(resolvedContext, {
            ok: false,
            outcome: "unsupported_locale",
            durationMs: timer.finish(),
            status: response.status,
            statusText: response.statusText,
            responseBytes: getResponseSizeBytes(responseText),
            providerErrorMessage,
            cache: "none",
            details: {
              locale: targetCode,
              role: "target",
              bodyPreview: clampString(responseText),
              sourceLocaleOrigin,
            },
          });
          return null;
        }

        if (isUnsupportedLocaleMessage(providerErrorMessage, sourceCode)) {
          markLocaleUnsupported(baseUrl, sourceCode);
          recordProviderMetric(resolvedContext, {
            ok: false,
            outcome: "unsupported_locale",
            durationMs: timer.finish(),
            status: response.status,
            statusText: response.statusText,
            responseBytes: getResponseSizeBytes(responseText),
            providerErrorMessage,
            cache: "none",
            details: {
              locale: sourceCode,
              role: "source",
              bodyPreview: clampString(responseText),
              sourceLocaleOrigin,
            },
          });
          return null;
        }
      }

      if (response.status >= 500 || response.status === 404) {
        startNetworkFailureCooldown();
      }

      recordProviderMetric(translatedContext, {
        ok: false,
        outcome: "non_ok_response",
        durationMs: timer.finish(),
        status: response.status,
        statusText: response.statusText,
        responseBytes: getResponseSizeBytes(responseText),
        providerErrorMessage,
        cache: "none",
        details: {
          bodyPreview: clampString(responseText),
          sourceLocaleOrigin,
        },
      });

      return null;
    }

    const responseText = await response.text().catch(() => "");
    const payload = responseText
      ? ((JSON.parse(responseText) as LibreTranslateResponse | null) ?? null)
      : null;

    const translatedText =
      typeof payload?.translatedText === "string"
        ? payload.translatedText.trim()
        : "";

    if (!translatedText) {
      recordProviderMetric(translatedContext, {
        ok: false,
        outcome: payload?.error ? "provider_error" : "invalid_payload",
        durationMs: timer.finish(),
        status: response.status,
        statusText: response.statusText,
        responseBytes: getResponseSizeBytes(responseText),
        cache: "none",
        details: {
          providerError: payload?.error,
          bodyPreview: clampString(responseText),
          sourceLocaleOrigin,
        },
      });
      return null;
    }

    clearNetworkFailureCooldown();
    clearUnsupportedLocale(baseUrl, requestedSourceCode);
    clearUnsupportedLocale(baseUrl, requestedTargetCode);
    clearUnsupportedLocale(baseUrl, sourceCode);
    clearUnsupportedLocale(baseUrl, targetCode);

    recordProviderMetric(translatedContext, {
      ok: true,
      outcome: "success",
      durationMs: timer.finish(),
      status: response.status,
      statusText: response.statusText,
      responseBytes: getResponseSizeBytes(responseText),
      translatedTextLength: translatedText.length,
      cache: "none",
      details: {
        batching: getBatchCapability(),
        sourceLocaleOrigin,
      },
    });

    return {
      translatedText,
      provider: PROVIDER_NAME,
    };
  } catch (error) {
    const details = getNetworkErrorDetails(error);

    if (isAbortError(error)) {
      startNetworkFailureCooldown();
      recordProviderMetric(translatedContext, {
        ok: false,
        outcome: "timeout",
        durationMs: timer.finish(),
        cache: "none",
        details: {
          message: details.message,
          code: details.code,
          causeCode: details.causeCode,
          nestedCodes: details.nestedCodes,
          timeoutMs,
          sourceLocaleOrigin,
        },
      });
      return null;
    }

    if (isConnectionRefusedError(error)) {
      startNetworkFailureCooldown();
      recordProviderMetric(translatedContext, {
        ok: false,
        outcome: "connection_failed",
        durationMs: timer.finish(),
        cache: "none",
        details: {
          message: details.message,
          code: details.code,
          causeCode: details.causeCode,
          nestedCodes: details.nestedCodes,
          sourceLocaleOrigin,
          hint: "Check whether LibreTranslate is running on the configured host/port. Try GET /languages manually. If using Docker, inspect container logs.",
        },
      });
      return null;
    }

    recordProviderMetric(translatedContext, {
      ok: false,
      outcome: "request_failed",
      durationMs: timer.finish(),
      cache: "none",
      details: {
        message: details.message,
        code: details.code,
        causeCode: details.causeCode,
        nestedCodes: details.nestedCodes,
        sourceLocaleOrigin,
      },
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
