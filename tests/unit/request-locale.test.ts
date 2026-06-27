import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
} from "@/i18n/config";

vi.mock("server-only", () => ({}));

async function loadResolveRequestLocale() {
  return import("@/features/i18n/server/requestLocale");
}

function createAdminWithPreferredLanguage(preferredLanguage: string | null) {
  return {
    from(table: string) {
      expect(table).toBe("profiles");

      return {
        select(selection: string) {
          expect(selection).toBe("preferred_language");

          return {
            eq(field: string, value: string) {
              expect(field).toBe("id");
              expect(value).toBe("user-1");

              return {
                maybeSingle: async () => ({
                  data:
                    preferredLanguage === null
                      ? null
                      : { preferred_language: preferredLanguage },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as any;
}

describe("resolveRequestLocale", () => {
  it("prefers the locale header over cookie and profile settings", async () => {
    const { resolveRequestLocale } = await loadResolveRequestLocale();
    const request = new Request("https://example.com", {
      headers: {
        [LOCALE_HEADER_NAME]: "de",
        cookie: `${LOCALE_COOKIE_NAME}=fr`,
      },
    });

    const locale = await resolveRequestLocale({
      request,
      admin: createAdminWithPreferredLanguage("es"),
      userId: "user-1",
    });

    expect(locale).toBe("de");
  });

  it("uses the locale cookie when no locale header is present", async () => {
    const { resolveRequestLocale } = await loadResolveRequestLocale();
    const request = new Request("https://example.com", {
      headers: {
        cookie: `${LOCALE_COOKIE_NAME}=pt-BR`,
      },
    });

    const locale = await resolveRequestLocale({
      request,
      admin: createAdminWithPreferredLanguage("es"),
      userId: "user-1",
    });

    expect(locale).toBe("pt");
  });

  it("falls back to the user profile locale when header and cookie are missing", async () => {
    const { resolveRequestLocale } = await loadResolveRequestLocale();
    const locale = await resolveRequestLocale({
      request: new Request("https://example.com"),
      admin: createAdminWithPreferredLanguage("fr"),
      userId: "user-1",
    });

    expect(locale).toBe("fr");
  });

  it("returns the default locale when no request or profile locale is available", async () => {
    const { resolveRequestLocale } = await loadResolveRequestLocale();
    const locale = await resolveRequestLocale({
      request: new Request("https://example.com"),
      fallback: DEFAULT_LOCALE,
    });

    expect(locale).toBe(DEFAULT_LOCALE);
  });
});
