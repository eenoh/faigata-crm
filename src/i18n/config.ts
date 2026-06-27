import { hasLocale } from "next-intl";

export const SUPPORTED_LOCALES = [
  "en",
  "de",
  "fr",
  "es",
  "pt",
  "it",
  "nl",
  "pl",
  "tr",
  "uk",
  "ru",
  "ar",
  "he",
  "hi",
  "bn",
  "ur",
  "zh",
  "ja",
  "ko",
  "id",
  "vi",
  "th",
  "sw",
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE_NAME = "faigata_locale";
export const LOCALE_HEADER_NAME = "x-faigata-locale";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Fran\u00e7ais",
  es: "Espa\u00f1ol",
  pt: "Portugu\u00eas",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  tr: "T\u00fcrk\u00e7e",
  uk: "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430",
  ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
  ar: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
  he: "\u05e2\u05d1\u05e8\u05d9\u05ea",
  hi: "\u0939\u093f\u0902\u0926\u0940",
  bn: "\u09ac\u09be\u0982\u09b2\u09be",
  ur: "\u0627\u0631\u062f\u0648",
  zh: "\u4e2d\u6587",
  ja: "\u65e5\u672c\u8a9e",
  ko: "\ud55c\uad6d\uc5b4",
  id: "Bahasa Indonesia",
  vi: "Ti\u1ebfng Vi\u1ec7t",
  th: "\u0e44\u0e17\u0e22",
  sw: "Kiswahili",
};

const LOCALE_ENGLISH_LABELS: Record<AppLocale, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  uk: "Ukrainian",
  ru: "Russian",
  ar: "Arabic",
  he: "Hebrew",
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  id: "Indonesian",
  vi: "Vietnamese",
  th: "Thai",
  sw: "Swahili",
};

const RTL_LOCALES = new Set<AppLocale>(["ar", "he", "ur"]);

export function normalizeLocale(
  locale: string | null | undefined,
): AppLocale | null {
  if (!locale) return null;

  const normalized = locale.trim().toLowerCase().replace(/_/g, "-");
  const directMatch = hasLocale(SUPPORTED_LOCALES, normalized)
    ? (normalized as AppLocale)
    : null;

  if (directMatch) {
    return directMatch;
  }

  const baseLocale = normalized.split("-")[0];
  return hasLocale(SUPPORTED_LOCALES, baseLocale)
    ? (baseLocale as AppLocale)
    : null;
}

export function getLocaleLabel(
  locale: AppLocale,
  displayLocale: string = locale,
): string {
  const nativeLabel = LOCALE_LABELS[locale];

  try {
    const formatter = new Intl.DisplayNames([displayLocale], {
      type: "language",
    });
    const localizedLabel = formatter.of(locale) ?? LOCALE_ENGLISH_LABELS[locale];

    if (
      localizedLabel.localeCompare(nativeLabel, undefined, {
        sensitivity: "accent",
      }) === 0
    ) {
      return nativeLabel;
    }

    return `${nativeLabel} (${localizedLabel})`;
  } catch {
    if (nativeLabel === LOCALE_ENGLISH_LABELS[locale]) {
      return nativeLabel;
    }

    return `${nativeLabel} (${LOCALE_ENGLISH_LABELS[locale]})`;
  }
}

export function getHtmlTextDirection(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(normalizeLocale(locale) ?? DEFAULT_LOCALE)
    ? "rtl"
    : "ltr";
}

export function getLocaleCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365,
  };
}
