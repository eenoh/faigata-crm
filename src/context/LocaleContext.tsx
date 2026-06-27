"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  LOCALE_COOKIE_NAME,
  getLocaleCookieOptions,
  getHtmlTextDirection,
  normalizeLocale,
  type AppLocale,
} from "@/i18n/config";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (nextLocale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export const LOCALE_STORAGE_KEY = "faigata_locale";
export const LOCALE_BROADCAST_CHANNEL = "faigata:locale";

export type LocaleSyncPayload = {
  locale: AppLocale;
  changedAt: number;
  source: string;
};

export function writeLocaleCookie(locale: AppLocale) {
  const options = getLocaleCookieOptions();

  document.cookie = [
    `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite}`,
  ].join("; ");
}

export function applyDocumentLocale(locale: AppLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = getHtmlTextDirection(locale);
}

export function buildLocaleSyncPayload(
  locale: AppLocale,
  source: string,
): LocaleSyncPayload {
  return {
    locale,
    changedAt: Date.now(),
    source,
  };
}

export function writeLocaleStorage(payload: LocaleSyncPayload) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function readLocaleStorageValue(
  value: string | null,
): LocaleSyncPayload | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<LocaleSyncPayload>;
    const normalized = normalizeLocale(parsed.locale);

    if (!normalized) return null;

    return {
      locale: normalized,
      changedAt:
        typeof parsed.changedAt === "number" ? parsed.changedAt : Date.now(),
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
    };
  } catch {
    const normalized = normalizeLocale(value);
    if (!normalized) return null;

    return {
      locale: normalized,
      changedAt: Date.now(),
      source: "legacy",
    };
  }
}

export function resolveIncomingLocaleChange(args: {
  payload: LocaleSyncPayload;
  currentLocale: AppLocale;
  lastAppliedChangeAt: number;
  tabId: string;
}) {
  const normalized = normalizeLocale(args.payload.locale);
  if (!normalized) {
    return { shouldApply: false as const, shouldRefresh: false as const };
  }

  if (args.payload.source === args.tabId) {
    return { shouldApply: false as const, shouldRefresh: false as const };
  }

  if (args.payload.changedAt < args.lastAppliedChangeAt) {
    return { shouldApply: false as const, shouldRefresh: false as const };
  }

  if (
    args.payload.changedAt === args.lastAppliedChangeAt &&
    normalized === args.currentLocale
  ) {
    return { shouldApply: false as const, shouldRefresh: false as const };
  }

  return {
    shouldApply: true as const,
    locale: normalized,
    shouldRefresh: normalized !== args.currentLocale,
    nextChangedAt: args.payload.changedAt,
  };
}

function refreshRouter(router: ReturnType<typeof useRouter>) {
  startTransition(() => {
    router.refresh();
  });
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: ReactNode;
}) {
  const router = useRouter();

  const normalizedInitialLocale = normalizeLocale(initialLocale) ?? "en";
  const [locale, setLocaleState] = useState<AppLocale>(normalizedInitialLocale);

  const localeRef = useRef<AppLocale>(normalizedInitialLocale);
  const lastAppliedChangeAtRef = useRef<number>(0);

  const tabIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab-${Math.random().toString(36).slice(2)}`,
  );

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const applyLocaleLocally = useCallback((nextLocale: AppLocale) => {
    localeRef.current = nextLocale;
    setLocaleState((prev) => (prev === nextLocale ? prev : nextLocale));
    writeLocaleCookie(nextLocale);
    applyDocumentLocale(nextLocale);
  }, []);

  const applyIncomingLocale = useCallback(
    (
      payload: LocaleSyncPayload,
      options?: {
        refresh?: boolean;
      },
    ) => {
      const decision = resolveIncomingLocaleChange({
        payload,
        currentLocale: localeRef.current,
        lastAppliedChangeAt: lastAppliedChangeAtRef.current,
        tabId: tabIdRef.current,
      });

      if (!decision.shouldApply || !decision.locale) {
        return;
      }

      lastAppliedChangeAtRef.current = decision.nextChangedAt;
      applyLocaleLocally(decision.locale);

      if (decision.shouldRefresh && options?.refresh !== false) {
        refreshRouter(router);
      }
    },
    [applyLocaleLocally, router],
  );

  const publishLocaleChange = useCallback((nextLocale: AppLocale) => {
    const payload = buildLocaleSyncPayload(nextLocale, tabIdRef.current);
    lastAppliedChangeAtRef.current = payload.changedAt;
    writeLocaleStorage(payload);

    try {
      broadcastChannelRef.current?.postMessage(payload);
    } catch {
      // ignore broadcast errors
    }
  }, []);

  const syncLocale = useCallback(
    (nextLocale: AppLocale, shouldRefresh: boolean) => {
      const normalized = normalizeLocale(nextLocale) ?? "en";
      const localeChanged = normalized !== localeRef.current;

      applyLocaleLocally(normalized);
      publishLocaleChange(normalized);

      if (shouldRefresh && localeChanged) {
        refreshRouter(router);
      }
    },
    [applyLocaleLocally, publishLocaleChange, router],
  );

  const setLocale = useCallback(
    (nextLocale: AppLocale) => {
      syncLocale(nextLocale, true);
    },
    [syncLocale],
  );

  useEffect(() => {
    applyLocaleLocally(normalizedInitialLocale);

    const existingPayload = readLocaleStorageValue(
      typeof window !== "undefined"
        ? localStorage.getItem(LOCALE_STORAGE_KEY)
        : null,
    );

    if (existingPayload) {
      applyIncomingLocale(existingPayload, { refresh: false });
    }
  }, [applyIncomingLocale, applyLocaleLocally, normalizedInitialLocale]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof BroadcastChannel === "undefined"
    ) {
      return;
    }

    const channel = new BroadcastChannel(LOCALE_BROADCAST_CHANNEL);
    broadcastChannelRef.current = channel;

    function handleBroadcast(event: MessageEvent<LocaleSyncPayload>) {
      const payload = event.data;
      if (!payload) return;

      applyIncomingLocale(payload);
    }

    channel.addEventListener("message", handleBroadcast);

    return () => {
      channel.removeEventListener("message", handleBroadcast);
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [applyIncomingLocale]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== LOCALE_STORAGE_KEY) return;

      const payload = readLocaleStorageValue(event.newValue);
      if (!payload) return;

      applyIncomingLocale(payload);
    }

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [applyIncomingLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useAppLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useAppLocale must be used inside LocaleProvider");
  }

  return context;
}
