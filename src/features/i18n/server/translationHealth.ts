import "server-only";

import {
  getTranslationProviderMetadata,
  type TranslationProviderName,
} from "@/features/i18n/server/translationProvider";
import { serverEnv } from "@/lib/env/server";

type TranslationHealthReason =
  | "ok"
  | "missing_config"
  | "unsupported_provider"
  | "unreachable"
  | "invalid_response";

export type TranslationHealthStatus = {
  ok: boolean;
  provider: TranslationProviderName;
  checkedAt: string;
  latencyMs: number | null;
  configured: boolean;
  reachable: boolean;
  reason: TranslationHealthReason;
  details: Record<string, unknown> | null;
};

type LibreTranslateLanguage = {
  code?: unknown;
  name?: unknown;
  targets?: unknown;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeBaseUrl(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  return value.trim().replace(/\/+$/, "");
}

function resolveLanguagesEndpoint(baseUrl: string) {
  return `${baseUrl}/languages`;
}

function getTimeoutMs() {
  return Math.max(
    1_000,
    Number(
      serverEnv.translation.libreTranslateTimeoutMs?.() ?? DEFAULT_TIMEOUT_MS,
    ),
  );
}

function createFailureStatus(args: {
  provider: TranslationProviderName;
  checkedAt: string;
  latencyMs?: number | null;
  configured: boolean;
  reachable: boolean;
  reason: TranslationHealthReason;
  details?: Record<string, unknown>;
}) {
  return {
    ok: false,
    provider: args.provider,
    checkedAt: args.checkedAt,
    latencyMs: args.latencyMs ?? null,
    configured: args.configured,
    reachable: args.reachable,
    reason: args.reason,
    details: args.details ?? null,
  } satisfies TranslationHealthStatus;
}

function observeTranslationHealth(status: TranslationHealthStatus) {
  console.info("[translationHealth]", {
    event: "translation.provider.health",
    provider: status.provider,
    ok: status.ok,
    configured: status.configured,
    reachable: status.reachable,
    latencyMs: status.latencyMs,
    reason: status.reason,
    details: status.details,
  });
}

function getErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: String(error),
    };
  }

  const code =
    typeof (error as Error & { code?: unknown }).code === "string"
      ? String((error as Error & { code?: unknown }).code)
      : undefined;

  return {
    name: error.name,
    message: error.message,
    ...(code ? { code } : {}),
  };
}

function hasValidLanguagesPayload(
  value: unknown,
): value is LibreTranslateLanguage[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((entry) => {
    const rawCode = (entry as LibreTranslateLanguage | null)?.code;
    const code = typeof rawCode === "string" ? rawCode.trim() : "";

    return Boolean(code);
  });
}

async function checkLibreTranslateHealth(
  provider: TranslationProviderName,
): Promise<TranslationHealthStatus> {
  const checkedAt = nowIso();
  const baseUrl = normalizeBaseUrl(serverEnv.translation.libreTranslateUrl());
  const timeoutMs = getTimeoutMs();

  if (!baseUrl) {
    return createFailureStatus({
      provider,
      checkedAt,
      configured: false,
      reachable: false,
      reason: "missing_config",
      details: {
        envVar: "LIBRETRANSLATE_URL",
      },
    });
  }

  const endpoint = resolveLanguagesEndpoint(baseUrl);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);

    if (!response.ok) {
      return createFailureStatus({
        provider,
        checkedAt,
        latencyMs,
        configured: true,
        reachable: false,
        reason: "unreachable",
        details: {
          endpoint,
          status: response.status,
          statusText: response.statusText,
        },
      });
    }

    const payload = (await response.json().catch(() => null)) as
      | LibreTranslateLanguage[]
      | null;

    if (!hasValidLanguagesPayload(payload)) {
      return createFailureStatus({
        provider,
        checkedAt,
        latencyMs,
        configured: true,
        reachable: true,
        reason: "invalid_response",
        details: {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          payloadType: Array.isArray(payload) ? "array" : typeof payload,
        },
      });
    }

    return {
      ok: true,
      provider,
      checkedAt,
      latencyMs,
      configured: true,
      reachable: true,
      reason: "ok",
      details: {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        languageCount: payload.length,
      },
    };
  } catch (error) {
    return createFailureStatus({
      provider,
      checkedAt,
      latencyMs: Math.max(0, Date.now() - startedAt),
      configured: true,
      reachable: false,
      reason: "unreachable",
      details: {
        endpoint,
        timeoutMs,
        error: getErrorDetails(error),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkTranslationHealth(): Promise<TranslationHealthStatus> {
  const metadata = getTranslationProviderMetadata();

  let status: TranslationHealthStatus;

  switch (metadata.name) {
    case "libretranslate":
      status = await checkLibreTranslateHealth(metadata.name);
      break;
    default:
      status = createFailureStatus({
        provider: metadata.name,
        checkedAt: nowIso(),
        configured: true,
        reachable: false,
        reason: "unsupported_provider",
        details: {
          provider: metadata.name,
        },
      });
  }

  observeTranslationHealth(status);
  return status;
}
