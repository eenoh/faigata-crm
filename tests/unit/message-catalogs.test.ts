import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/config";

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

const MESSAGE_CATALOGS: Record<AppLocale, unknown> = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
  es: esMessages,
  pt: ptMessages,
  it: itMessages,
  nl: nlMessages,
  pl: plMessages,
  tr: trMessages,
  uk: ukMessages,
  ru: ruMessages,
  ar: arMessages,
  he: heMessages,
  hi: hiMessages,
  bn: bnMessages,
  ur: urMessages,
  zh: zhMessages,
  ja: jaMessages,
  ko: koMessages,
  id: idMessages,
  vi: viMessages,
  th: thMessages,
  sw: swMessages,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSchemaMismatches(
  reference: unknown,
  candidate: unknown,
  path: string[] = [],
): string[] {
  if (isRecord(candidate)) {
    if (!isRecord(reference)) {
      return [path.join(".") || "<root>"];
    }

    return Object.entries(candidate).flatMap(([key, value]) => {
      if (!(key in reference)) {
        return [[...path, key].join(".")];
      }

      return collectSchemaMismatches(reference[key], value, [...path, key]);
    });
  }

  if (Array.isArray(candidate)) {
    return Array.isArray(reference) ? [] : [path.join(".") || "<root>"];
  }

  return [];
}

describe("message catalogs", () => {
  it("uses messages/en.json as the canonical key schema for every locale file", () => {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale === "en") continue;

      expect(
        collectSchemaMismatches(enMessages, MESSAGE_CATALOGS[locale]),
        `Unexpected translation keys found in ${locale}.json`,
      ).toEqual([]);
    }
  });

  it("defines a language option label in messages/en.json for every supported locale", () => {
    const options = (
      enMessages as {
        Common?: {
          languages?: {
            options?: Partial<Record<AppLocale, string>>;
          };
        };
      }
    ).Common?.languages?.options;

    expect(options).toBeTruthy();
    expect(Object.keys(options ?? {}).sort()).toEqual([...SUPPORTED_LOCALES].sort());

    for (const locale of SUPPORTED_LOCALES) {
      expect(options?.[locale]).toEqual(expect.any(String));
      expect(options?.[locale]?.trim()).not.toBe("");
    }
  });
});
