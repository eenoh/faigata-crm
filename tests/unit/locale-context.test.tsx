// @vitest-environment jsdom

import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

const localeModule = () => import("@/context/LocaleContext");

describe("locale context helpers", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.cookie = "";
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    refreshMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    root = null;
    container = null;
    vi.clearAllMocks();
  });

  it("writes locale changes to the cookie, DOM, and localStorage", async () => {
    const {
      applyDocumentLocale,
      buildLocaleSyncPayload,
      writeLocaleCookie,
      writeLocaleStorage,
    } = await localeModule();

    const payload = buildLocaleSyncPayload("de", "tab-1");
    writeLocaleCookie("de");
    applyDocumentLocale("de");
    writeLocaleStorage(payload);

    expect(document.cookie).toContain("faigata_locale=de");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
    expect(
      JSON.parse(localStorage.getItem("faigata_locale") ?? "{}"),
    ).toMatchObject({
      locale: "de",
      source: "tab-1",
      changedAt: expect.any(Number),
    });
  });

  it("accepts storage or broadcast payloads from another tab when they are newer", async () => {
    const { resolveIncomingLocaleChange } = await localeModule();

    const result = resolveIncomingLocaleChange({
      payload: {
        locale: "fr",
        changedAt: 20,
        source: "other-tab",
      },
      currentLocale: "en",
      lastAppliedChangeAt: 10,
      tabId: "tab-1",
    });

    expect(result).toEqual({
      shouldApply: true,
      locale: "fr",
      shouldRefresh: true,
      nextChangedAt: 20,
    });
  });

  it("ignores payloads from the same tab or older refreshes", async () => {
    const { resolveIncomingLocaleChange } = await localeModule();

    expect(
      resolveIncomingLocaleChange({
        payload: {
          locale: "de",
          changedAt: 20,
          source: "tab-1",
        },
        currentLocale: "en",
        lastAppliedChangeAt: 10,
        tabId: "tab-1",
      }),
    ).toEqual({
      shouldApply: false,
      shouldRefresh: false,
    });

    expect(
      resolveIncomingLocaleChange({
        payload: {
          locale: "de",
          changedAt: 5,
          source: "other-tab",
        },
        currentLocale: "en",
        lastAppliedChangeAt: 10,
        tabId: "tab-1",
      }),
    ).toEqual({
      shouldApply: false,
      shouldRefresh: false,
    });
  });

  it("reloads locale-sensitive clients after setLocale and cross-tab sync", async () => {
    const {
      LOCALE_STORAGE_KEY,
      LocaleProvider,
      useAppLocale,
    } = await localeModule();
    const localeEvents: string[] = [];

    function LocaleProbe() {
      const { locale, setLocale } = useAppLocale();

      useEffect(() => {
        localeEvents.push(locale);
      }, [locale]);

      return (
        <button id="set-locale" onClick={() => setLocale("de")}>
          set locale
        </button>
      );
    }

    await act(async () => {
      root = createRoot(container!);
      root.render(
        <LocaleProvider initialLocale="en">
          <LocaleProbe />
        </LocaleProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(localeEvents.at(-1)).toBe("en");
    expect(document.cookie).toContain("faigata_locale=en");

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>("#set-locale")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(localeEvents).toContain("de");
    expect(refreshMock).toHaveBeenCalledTimes(1);

    const externalPayload = {
      locale: "fr",
      changedAt: Date.now() + 1_000,
      source: "other-tab",
    };

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOCALE_STORAGE_KEY,
          newValue: JSON.stringify(externalPayload),
        }),
      );
    });

    expect(localeEvents).toContain("fr");
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });
});
