import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

vi.mock("server-only", () => ({}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type Row = Record<string, any>;

function hashSourceText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createAdminMock(initial?: { sources?: Row[]; translations?: Row[] }) {
  const store = {
    custom_value_translation_sources: [...(initial?.sources ?? [])],
    custom_value_translations: [...(initial?.translations ?? [])],
  };

  const admin = {
    from(table: string) {
      if (table === "custom_value_translation_sources") {
        return {
          upsert(payload: Row | Row[]) {
            const rows = Array.isArray(payload) ? payload : [payload];

            for (const row of rows) {
              const index = store.custom_value_translation_sources.findIndex(
                (item) => item.id === row.id,
              );

              if (index >= 0) {
                store.custom_value_translation_sources[index] = {
                  ...store.custom_value_translation_sources[index],
                  ...row,
                };
              } else {
                store.custom_value_translation_sources.push({ ...row });
              }
            }

            return Promise.resolve({ data: null, error: null });
          },
          delete() {
            return {
              eq(field: string, value: string) {
                return {
                  in(inField: string, values: string[]) {
                    store.custom_value_translation_sources =
                      store.custom_value_translation_sources.filter(
                        (row) =>
                          row[field] !== value ||
                          !values.includes(row[inField]),
                      );
                    store.custom_value_translations =
                      store.custom_value_translations.filter((translation) =>
                        store.custom_value_translation_sources.some(
                          (source) => source.id === translation.source_id,
                        ),
                      );

                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "custom_value_translations") {
        return {
          select() {
            return {
              in(field: string, values: string[]) {
                return Promise.resolve({
                  data: store.custom_value_translations.filter((row) =>
                    values.includes(row[field]),
                  ),
                  error: null,
                });
              },
            };
          },
          upsert(payload: Row | Row[]) {
            const rows = Array.isArray(payload) ? payload : [payload];

            for (const row of rows) {
              const index = store.custom_value_translations.findIndex(
                (item) =>
                  item.source_id === row.source_id &&
                  item.locale === row.locale,
              );

              if (index >= 0) {
                store.custom_value_translations[index] = {
                  ...store.custom_value_translations[index],
                  ...row,
                };
              } else {
                store.custom_value_translations.push({ ...row });
              }
            }

            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin: admin as any, store };
}

async function loadResolveTranslationBatch() {
  const module = await import("@/features/i18n/server/customValueTranslations");
  return module.resolveTranslationBatch;
}

describe("custom value translations", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.LIBRETRANSLATE_URL;
    delete process.env.LIBRETRANSLATE_API_KEY;
    delete process.env.LIBRETRANSLATE_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and caches automatic translations", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/languages")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { code: "en", name: "English" },
            { code: "de", name: "Deutsch" },
          ],
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({ translatedText: "Hallo Welt" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { admin, store } = createAdminMock();
    const item = {
      teamId: "team-1",
      entityTable: "booking_links",
      entityId: "booking-link-1",
      fieldKey: "name",
      sourceText: "Hello world",
      sourceLocale: "en",
      requestedLocale: "de",
    };

    const first = await resolveTranslationBatch({
      admin,
      items: [item],
    });
    const second = await resolveTranslationBatch({
      admin,
      items: [item],
    });

    expect(first[0]?.value).toBe("Hallo Welt");
    expect(second[0]?.value).toBe("Hallo Welt");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.custom_value_translations).toHaveLength(1);
    expect(store.custom_value_translations[0]?.locale).toBe("de");
    expect(store.custom_value_translations[0]?.translated_text).toBe(
      "Hallo Welt",
    );
  });

  it("refreshes stale automatic translations when the source text changes", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/languages")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { code: "en", name: "English" },
            { code: "de", name: "Deutsch" },
          ],
        };
      }

      const translateCallCount = fetchMock.mock.calls.filter(([value]) =>
        String(value).endsWith("/translate"),
      ).length;

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            translatedText:
              translateCallCount === 1 ? "Hallo Welt" : "Hallo da",
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { admin, store } = createAdminMock();
    const baseItem = {
      teamId: "team-1",
      entityTable: "booking_links",
      entityId: "booking-link-1",
      fieldKey: "name",
      sourceLocale: "en",
      requestedLocale: "de",
    };

    const first = await resolveTranslationBatch({
      admin,
      items: [{ ...baseItem, sourceText: "Hello world" }],
    });
    const second = await resolveTranslationBatch({
      admin,
      items: [{ ...baseItem, sourceText: "Hello there" }],
    });

    expect(first[0]?.value).toBe("Hallo Welt");
    expect(second[0]?.value).toBe("Hallo da");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(store.custom_value_translations[0]?.translated_text).toBe(
      "Hallo da",
    );
  });

  it("refreshes stale automatic translations when source_hash_at_translation is outdated", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    process.env.LIBRETRANSLATE_URL = "http://translator.local";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/languages")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { code: "en", name: "English" },
            { code: "de", name: "Deutsch" },
          ],
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({ translatedText: "Aktualisierter Text" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const sourceId = "team-1::booking_links:booking-link-1:name";
    const staleSourceText = "Hello world";
    const currentSourceText = "Hello there";

    const { admin, store } = createAdminMock({
      sources: [
        {
          id: sourceId,
          team_id: "team-1",
          entity_table: "booking_links",
          entity_id: "booking-link-1",
          field_key: "name",
          source_text: staleSourceText,
          source_locale: "en",
          source_hash: hashSourceText(staleSourceText),
        },
      ],
      translations: [
        {
          id: `${sourceId}:de`,
          source_id: sourceId,
          locale: "de",
          translated_text: "Veralteter Text",
          is_manual: false,
          provider: "libretranslate",
          source_hash_at_translation: hashSourceText(staleSourceText),
        },
      ],
    });

    const result = await resolveTranslationBatch({
      admin,
      items: [
        {
          teamId: "team-1",
          entityTable: "booking_links",
          entityId: "booking-link-1",
          fieldKey: "name",
          sourceText: currentSourceText,
          sourceLocale: "en",
          requestedLocale: "de",
        },
      ],
    });

    expect(result[0]?.value).toBe("Aktualisierter Text");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.custom_value_translation_sources).toHaveLength(1);
    expect(store.custom_value_translation_sources[0]?.source_text).toBe(
      currentSourceText,
    );
    expect(store.custom_value_translation_sources[0]?.source_hash).toBe(
      hashSourceText(currentSourceText),
    );
    expect(store.custom_value_translations).toHaveLength(1);
    expect(store.custom_value_translations[0]?.translated_text).toBe(
      "Aktualisierter Text",
    );
    expect(store.custom_value_translations[0]?.source_hash_at_translation).toBe(
      hashSourceText(currentSourceText),
    );
  });

  it("returns canonical source text when requested locale matches source locale", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    process.env.LIBRETRANSLATE_URL = "http://translator.local";

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { admin, store } = createAdminMock({
      translations: [
        {
          id: "team-1::booking_links:booking-link-1:name:en",
          source_id: "team-1::booking_links:booking-link-1:name",
          locale: "en",
          translated_text: "Should never be used",
          is_manual: false,
          provider: "libretranslate",
          source_hash_at_translation: hashSourceText("Hello world"),
        },
      ],
    });

    const result = await resolveTranslationBatch({
      admin,
      items: [
        {
          teamId: "team-1",
          entityTable: "booking_links",
          entityId: "booking-link-1",
          fieldKey: "name",
          sourceText: "Hello world",
          sourceLocale: "en",
          requestedLocale: "en",
        },
      ],
    });

    expect(result[0]?.value).toBe("Hello world");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.custom_value_translations[0]?.translated_text).toBe(
      "Should never be used",
    );
  });

  it("prefers manual translations over automatic provider results", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sourceId = "team-1::booking_links:booking-link-1:name";
    const sourceText = "Hello world";
    const { admin } = createAdminMock({
      translations: [
        {
          id: `${sourceId}:de`,
          source_id: sourceId,
          locale: "de",
          translated_text: "Manuell ueberschrieben",
          is_manual: true,
          provider: null,
          source_hash_at_translation: hashSourceText(sourceText),
        },
      ],
    });

    const result = await resolveTranslationBatch({
      admin,
      items: [
        {
          teamId: "team-1",
          entityTable: "booking_links",
          entityId: "booking-link-1",
          fieldKey: "name",
          sourceText,
          sourceLocale: "en",
          requestedLocale: "de",
        },
      ],
    });

    expect(result[0]?.value).toBe("Manuell ueberschrieben");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the source text when the requested locale is unsupported", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ code: "en", name: "English" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { admin, store } = createAdminMock();
    const result = await resolveTranslationBatch({
      admin,
      items: [
        {
          teamId: "team-1",
          entityTable: "pipeline_stages",
          entityId: "stage-1",
          fieldKey: "name",
          sourceText: "Qualified",
          sourceLocale: "en",
          requestedLocale: "de",
        },
      ],
    });

    expect(result[0]?.value).toBe("Qualified");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.custom_value_translations).toHaveLength(0);
  });

  it("falls back to the source text when LibreTranslate is not configured", async () => {
    const resolveTranslationBatch = await loadResolveTranslationBatch();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { admin, store } = createAdminMock();
    const result = await resolveTranslationBatch({
      admin,
      items: [
        {
          teamId: "team-1",
          entityTable: "pipeline_stages",
          entityId: "stage-1",
          fieldKey: "name",
          sourceText: "Qualified",
          sourceLocale: "en",
          requestedLocale: "de",
        },
      ],
    });

    expect(result[0]?.value).toBe("Qualified");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.custom_value_translations).toHaveLength(0);
  });
});
