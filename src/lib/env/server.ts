import "server-only";

import { publicEnv } from "@/lib/env/public";
import {
  getBooleanEnv,
  getOptionalEnv,
  getOptionalUrlEnv,
  getNumberEnv,
  getRequiredEnv,
  getRequiredUrlEnv,
} from "@/lib/env/shared";
import type { StripeMode } from "@/lib/stripe/types";

function prefixFor(mode: StripeMode) {
  return mode === "live" ? "LIVE" : "TEST";
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function tryParseUrl(value: string) {
  new URL(value);
  return value;
}

function toHttpsUrl(hostOrUrl: string) {
  const value = hostOrUrl.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function resolveVercelAppUrl() {
  const vercelEnv = getOptionalEnv("VERCEL_ENV");
  const host =
    (vercelEnv === "production"
      ? getOptionalEnv("VERCEL_PROJECT_PRODUCTION_URL")
      : undefined) ||
    getOptionalEnv("VERCEL_BRANCH_URL") ||
    getOptionalEnv("VERCEL_URL") ||
    getOptionalEnv("VERCEL_PROJECT_PRODUCTION_URL");

  if (!host) return undefined;

  try {
    return normalizeUrl(tryParseUrl(toHttpsUrl(host)));
  } catch {
    return undefined;
  }
}

function resolveServerAppUrl() {
  return normalizeUrl(
    publicEnv.configuredAppUrl || resolveVercelAppUrl() || "http://localhost:3000",
  );
}

function getPlatformWebhookSecrets() {
  return Array.from(
    new Set(
      [
        getOptionalEnv("STRIPE_WEBHOOK_SECRET"),
        getOptionalEnv("STRIPE_PLATFORM_WEBHOOK_SECRET_TEST"),
        getOptionalEnv("STRIPE_PLATFORM_WEBHOOK_SECRET_LIVE"),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export const serverEnv = {
  appUrl: () => resolveServerAppUrl(),
  isProduction: () => getOptionalEnv("NODE_ENV") === "production",
  databaseUrl: () => getRequiredEnv("DATABASE_URL"),
  supabase: {
    serviceRoleKey: () => getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  },
  translation: {
    provider: () => getOptionalEnv("TRANSLATION_PROVIDER"),
    libreTranslateUrl: () => getOptionalUrlEnv("LIBRETRANSLATE_URL"),
    libreTranslateApiKey: () => getOptionalEnv("LIBRETRANSLATE_API_KEY"),
    libreTranslateTimeoutMs: () => getNumberEnv("LIBRETRANSLATE_TIMEOUT_MS", 15000),
  },
  google: {
    clientId: () => getOptionalEnv("GOOGLE_CLIENT_ID"),
    clientSecret: () => getOptionalEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: () => getOptionalUrlEnv("GOOGLE_REDIRECT_URI"),
  },
  stripe: {
    livemode: () => getBooleanEnv("STRIPE_LIVEMODE", false),
    secretKey: (mode: StripeMode) =>
      getRequiredEnv(`STRIPE_SECRET_KEY_${prefixFor(mode)}`),
    connectClientId: (mode: StripeMode) =>
      getRequiredEnv(`STRIPE_CLIENT_ID_${prefixFor(mode)}`),
    connectRedirectUri: (mode: StripeMode) =>
      getRequiredUrlEnv(`STRIPE_CONNECT_REDIRECT_URI_${prefixFor(mode)}`),
    webhookSecret: (mode: StripeMode) =>
      getRequiredEnv(`STRIPE_WEBHOOK_SECRET_${prefixFor(mode)}`),
    platformWebhookSecret: () => getRequiredEnv("STRIPE_WEBHOOK_SECRET"),
    platformWebhookSecrets: () => getPlatformWebhookSecrets(),
  },
};
