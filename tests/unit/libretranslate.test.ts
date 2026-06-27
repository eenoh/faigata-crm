import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("translateWithLibreTranslate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    delete process.env.LIBRETRANSLATE_URL;
    delete process.env.LIBRETRANSLATE_API_KEY;
    delete process.env.LIBRETRANSLATE_TIMEOUT_MS;
    delete process.env.TRANSLATION_PROVIDER;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when the provider times out", async () => {
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { code: "en", name: "English" },
          { code: "de", name: "Deutsch" },
        ],
      })
      .mockRejectedValueOnce(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const { translateWithLibreTranslate } = await import(
      "@/features/i18n/server/libreTranslate"
    );

    const result = await translateWithLibreTranslate({
      text: "Hello world",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches unsupported locales and skips repeated provider calls", async () => {
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ code: "en", name: "English" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { translateWithLibreTranslate } = await import(
      "@/features/i18n/server/libreTranslate"
    );

    const first = await translateWithLibreTranslate({
      text: "Hello world",
      sourceLocale: "en",
      targetLocale: "de",
    });
    const second = await translateWithLibreTranslate({
      text: "Hello again",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enters network cooldown after connection failures", async () => {
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const connectionError = new Error("fetch failed");
    (connectionError as Error & { cause?: unknown }).cause = {
      code: "ECONNREFUSED",
    };

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectionError)
      .mockRejectedValueOnce(connectionError);
    vi.stubGlobal("fetch", fetchMock);

    const { translateWithLibreTranslate } = await import(
      "@/features/i18n/server/libreTranslate"
    );

    const first = await translateWithLibreTranslate({
      text: "Hello world",
      sourceLocale: "en",
      targetLocale: "de",
    });
    const second = await translateWithLibreTranslate({
      text: "Hello again",
      sourceLocale: "en",
      targetLocale: "de",
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses provider-advertised locale variants for chinese targets", async () => {
    process.env.LIBRETRANSLATE_URL = "http://translator.local";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          { code: "en", name: "English" },
          { code: "zh-CN", name: "Chinese (Simplified)" },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({ translatedText: "\u4f60\u597d\u4e16\u754c" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { translateWithLibreTranslate } = await import(
      "@/features/i18n/server/libreTranslate"
    );

    const result = await translateWithLibreTranslate({
      text: "Hello world",
      sourceLocale: "en",
      targetLocale: "zh",
    });

    expect(result).toEqual({
      translatedText: "\u4f60\u597d\u4e16\u754c",
      provider: "libretranslate",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const translateCall = fetchMock.mock.calls[1];
    expect(translateCall?.[0]).toBe("http://translator.local/translate");
    expect(translateCall?.[1]).toMatchObject({
      method: "POST",
    });
    expect(JSON.parse(String(translateCall?.[1]?.body))).toMatchObject({
      q: "Hello world",
      source: "en",
      target: "zh-CN",
      format: "text",
    });
  });
});
