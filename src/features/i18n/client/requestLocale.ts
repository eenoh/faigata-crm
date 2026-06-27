import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  normalizeLocale,
} from "@/i18n/config";

function readCookieLocale() {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${LOCALE_COOKIE_NAME}=`;

  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();

    if (trimmed.startsWith(prefix)) {
      return normalizeLocale(decodeURIComponent(trimmed.slice(prefix.length)));
    }
  }

  return null;
}

export function resolveClientRequestLocale(preferredLocale?: string | null) {
  return (
    normalizeLocale(preferredLocale) ??
    (typeof document !== "undefined"
      ? normalizeLocale(document.documentElement.lang)
      : null) ??
    readCookieLocale() ??
    DEFAULT_LOCALE
  );
}

export function withLocaleHeader(
  headers?: HeadersInit,
  preferredLocale?: string | null,
) {
  const nextHeaders = new Headers(headers);
  const locale = resolveClientRequestLocale(preferredLocale);

  nextHeaders.set(LOCALE_HEADER_NAME, locale);

  return nextHeaders;
}

export function createLocaleRequestInit(
  init?: RequestInit,
  preferredLocale?: string | null,
): RequestInit {
  return {
    ...init,
    headers: withLocaleHeader(init?.headers, preferredLocale),
  };
}
