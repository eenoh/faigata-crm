import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/lib/supabase/types";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  normalizeLocale,
  type AppLocale,
} from "@/i18n/config";

import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import frMessages from "../../messages/fr.json";
import esMessages from "../../messages/es.json";
import ptMessages from "../../messages/pt.json";
import itMessages from "../../messages/it.json";
import nlMessages from "../../messages/nl.json";
import plMessages from "../../messages/pl.json";
import trMessages from "../../messages/tr.json";
import ukMessages from "../../messages/uk.json";
import ruMessages from "../../messages/ru.json";
import arMessages from "../../messages/ar.json";
import heMessages from "../../messages/he.json";
import hiMessages from "../../messages/hi.json";
import bnMessages from "../../messages/bn.json";
import urMessages from "../../messages/ur.json";
import zhMessages from "../../messages/zh.json";
import jaMessages from "../../messages/ja.json";
import koMessages from "../../messages/ko.json";
import idMessages from "../../messages/id.json";
import viMessages from "../../messages/vi.json";
import thMessages from "../../messages/th.json";
import swMessages from "../../messages/sw.json";

// English is the canonical catalog shape; other locale files can stay partial
// and safely fall back to it until they are translated.
type Messages = typeof enMessages;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown>
    ? DeepPartial<T[K]>
    : T[K];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMessages<T extends Record<string, unknown>>(
  fallback: T,
  overrides: DeepPartial<T>,
): T {
  const result: Record<string, unknown> = { ...fallback };

  for (const [key, value] of Object.entries(overrides)) {
    const fallbackValue = result[key];

    if (isRecord(fallbackValue) && isRecord(value)) {
      result[key] = mergeMessages(fallbackValue, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

const MESSAGE_CATALOGS: Record<AppLocale, DeepPartial<Messages>> = {
  en: enMessages,
  de: deMessages as DeepPartial<Messages>,
  fr: frMessages as DeepPartial<Messages>,
  es: esMessages as DeepPartial<Messages>,
  pt: ptMessages as DeepPartial<Messages>,
  it: itMessages as DeepPartial<Messages>,
  nl: nlMessages as DeepPartial<Messages>,
  pl: plMessages as DeepPartial<Messages>,
  tr: trMessages as DeepPartial<Messages>,
  uk: ukMessages as DeepPartial<Messages>,
  ru: ruMessages as DeepPartial<Messages>,
  ar: arMessages as DeepPartial<Messages>,
  he: heMessages as DeepPartial<Messages>,
  hi: hiMessages as DeepPartial<Messages>,
  bn: bnMessages as DeepPartial<Messages>,
  ur: urMessages as DeepPartial<Messages>,
  zh: zhMessages as DeepPartial<Messages>,
  ja: jaMessages as DeepPartial<Messages>,
  ko: koMessages as DeepPartial<Messages>,
  id: idMessages as DeepPartial<Messages>,
  vi: viMessages as DeepPartial<Messages>,
  th: thMessages as DeepPartial<Messages>,
  sw: swMessages as DeepPartial<Messages>,
};

async function loadMessages(locale: AppLocale): Promise<Messages> {
  const catalog = MESSAGE_CATALOGS[locale] ?? MESSAGE_CATALOGS[DEFAULT_LOCALE];
  return mergeMessages(enMessages, catalog);
}

async function resolveProfileLocale() {
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op in request config
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", user.id)
    .maybeSingle();

  return normalizeLocale(
    (data as { preferred_language?: string | null } | null)?.preferred_language,
  );
}

export default getRequestConfig(async () => {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);

  const locale =
    normalizeLocale(headerStore.get(LOCALE_HEADER_NAME)) ??
    normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ??
    (await resolveProfileLocale()) ??
    DEFAULT_LOCALE;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
