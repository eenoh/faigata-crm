import "server-only";

import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, LOCALE_HEADER_NAME, normalizeLocale, type AppLocale } from "@/i18n/config";
import type { AppSupabaseClient } from "@/lib/supabase/types";

function readCookieLocale(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((chunk) => chunk.trim());
  const entry = cookies.find((chunk) =>
    chunk.toLowerCase().startsWith(`${LOCALE_COOKIE_NAME.toLowerCase()}=`),
  );

  if (!entry) {
    return null;
  }

  const [, rawValue = ""] = entry.split("=", 2);
  return normalizeLocale(decodeURIComponent(rawValue));
}

export async function resolveRequestLocale(args: {
  request: Request;
  admin?: AppSupabaseClient;
  userId?: string | null;
  fallback?: AppLocale;
}): Promise<AppLocale> {
  const localeFromHeader = normalizeLocale(
    args.request.headers.get(LOCALE_HEADER_NAME),
  );
  if (localeFromHeader) {
    return localeFromHeader;
  }

  const localeFromCookie = readCookieLocale(args.request);
  if (localeFromCookie) {
    return localeFromCookie;
  }

  if (args.admin && args.userId) {
    const { data, error } = await args.admin
      .from("profiles")
      .select("preferred_language")
      .eq("id", args.userId)
      .maybeSingle();

    if (!error) {
      const preferred = normalizeLocale(
        (data as { preferred_language?: string | null } | null)
          ?.preferred_language,
      );

      if (preferred) {
        return preferred;
      }
    }
  }

  return args.fallback ?? DEFAULT_LOCALE;
}
