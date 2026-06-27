import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const translateTextMock = vi.fn();

vi.mock("@/features/i18n/server/translationProvider", () => ({
  translateText: translateTextMock,
}));

const KNOWN_SOURCE_LOCALE_POLICY = "known" as any;
const UNKNOWN_SOURCE_LOCALE_POLICY = "unknown" as any;

describe("translateDynamicDisplayValuesBatch", () => {
  beforeEach(() => {
    vi.resetModules();
    translateTextMock.mockReset();
  });

  it("does not translate raw identifiers", async () => {
    const { translateDynamicDisplayValuesBatch } =
      await import("@/features/i18n/server/dynamicDisplayTranslation");

    const idValue = "123e4567-e89b-12d3-a456-426614174000";
    const results = await translateDynamicDisplayValuesBatch([
      {
        cacheKey: "lead-1:id",
        fieldKey: "lead_id",
        value: idValue,
        sourceLocale: "en",
        sourceLocalePolicy: KNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "de",
      },
    ]);

    expect(results.get("lead-1:id")).toBe(idValue);
    expect(translateTextMock).not.toHaveBeenCalled();
  });

  it("does not translate urls or emails under the skip rules", async () => {
    const { translateDynamicDisplayValuesBatch } =
      await import("@/features/i18n/server/dynamicDisplayTranslation");

    const urlValue = "https://example.com/booking-link";
    const emailValue = "lead@example.com";

    const results = await translateDynamicDisplayValuesBatch([
      {
        cacheKey: "lead-1:url",
        fieldKey: "website",
        value: urlValue,
        sourceLocale: "en",
        sourceLocalePolicy: KNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "de",
      },
      {
        cacheKey: "lead-1:email",
        fieldKey: "email",
        value: emailValue,
        sourceLocale: "en",
        sourceLocalePolicy: KNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "de",
      },
    ]);

    expect(results.get("lead-1:url")).toBe(urlValue);
    expect(results.get("lead-1:email")).toBe(emailValue);
    expect(translateTextMock).not.toHaveBeenCalled();
  });

  it("returns the source value when source locale is explicitly unknown", async () => {
    const { translateDynamicDisplayValuesBatch } =
      await import("@/features/i18n/server/dynamicDisplayTranslation");

    const value = "Llamar mañana";

    const results = await translateDynamicDisplayValuesBatch([
      {
        cacheKey: "lead-1:notes",
        fieldKey: "notes",
        value,
        sourceLocale: null,
        sourceLocalePolicy: UNKNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "de",
      },
    ]);

    expect(results.get("lead-1:notes")).toBe(value);
    expect(translateTextMock).not.toHaveBeenCalled();
  });

  it("translates human-readable values when the source locale is known", async () => {
    translateTextMock.mockResolvedValue({
      translatedText: "Anruf vereinbart",
      provider: "libretranslate",
    });

    const { translateDynamicDisplayValuesBatch } =
      await import("@/features/i18n/server/dynamicDisplayTranslation");

    const results = await translateDynamicDisplayValuesBatch([
      {
        cacheKey: "lead-1:notes",
        fieldKey: "notes",
        value: "Call scheduled",
        sourceLocale: "en",
        sourceLocalePolicy: KNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "de",
      },
    ]);

    expect(results.get("lead-1:notes")).toBe("Anruf vereinbart");
    expect(translateTextMock).toHaveBeenCalledTimes(1);
    expect(translateTextMock).toHaveBeenCalledWith({
      text: "Call scheduled",
      sourceLocale: "en",
      targetLocale: "de",
    });
  });

  it("translates from a non-default source locale instead of assuming english", async () => {
    translateTextMock.mockResolvedValue({
      translatedText: "Call scheduled",
      provider: "libretranslate",
    });

    const { translateDynamicDisplayValuesBatch } =
      await import("@/features/i18n/server/dynamicDisplayTranslation");

    const sourceText = "Anruf vereinbart";

    const results = await translateDynamicDisplayValuesBatch([
      {
        cacheKey: "lead-1:notes",
        fieldKey: "notes",
        value: sourceText,
        sourceLocale: "de",
        sourceLocalePolicy: KNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "en",
      },
    ]);

    expect(results.get("lead-1:notes")).toBe("Call scheduled");
    expect(translateTextMock).toHaveBeenCalledTimes(1);
    expect(translateTextMock).toHaveBeenCalledWith({
      text: sourceText,
      sourceLocale: "de",
      targetLocale: "en",
    });
  });

  it("returns the original value when source and target locales match", async () => {
    const { translateDynamicDisplayValuesBatch } =
      await import("@/features/i18n/server/dynamicDisplayTranslation");

    const value = "Qualified";

    const results = await translateDynamicDisplayValuesBatch([
      {
        cacheKey: "stage-1:name",
        fieldKey: "name",
        value,
        sourceLocale: "en",
        sourceLocalePolicy: KNOWN_SOURCE_LOCALE_POLICY,
        targetLocale: "en",
      },
    ]);

    expect(results.get("stage-1:name")).toBe(value);
    expect(translateTextMock).not.toHaveBeenCalled();
  });
});
