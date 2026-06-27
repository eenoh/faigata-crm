"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

/* ===================== HEADER ALERT BRIDGE ===================== */

type HeaderAlertKind = "warning" | "error";

type HeaderAlertPayload = {
  id: string;
  kind: HeaderAlertKind;
  text: string;
  title?: string;
};

const HEADER_ALERT_EVENT = "faigata:header-alert";
const HEADER_ALERT_CLEAR_EVENT = "faigata:header-alert-clear";

function pushHeaderAlert(payload: HeaderAlertPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HEADER_ALERT_EVENT, { detail: payload }),
  );
}

function clearHeaderAlert(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HEADER_ALERT_CLEAR_EVENT, { detail: { id } }),
  );
}

/* ===================== EXISTING TYPES ===================== */

type BusyBlock = { start: string; end: string };

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string | null;
};

const HOUR_START = 0;
const HOUR_END = 23;
const ROW_HEIGHT_CLASS = "h-10";

function getLocalTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function startOfWeek(dt: DateTime) {
  return dt.minus({ days: dt.weekday - 1 }).startOf("day");
}

function clamp(dt: DateTime, min: DateTime, max: DateTime) {
  if (dt < min) return min;
  if (dt > max) return max;
  return dt;
}

async function crmLocaleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocaleHeader(init?.headers),
  });
}

/* ===================== ERROR UI HELPERS ===================== */

type CalendarErrorView = {
  kind: "warning" | "error";
  title: string;
  message: string;
  action?:
    | { label: string; onClick: () => void }
    | { label: string; href: string };
  secondary?: { label: string; onClick: () => void };
  showRetry?: boolean;
};

function mapCalendarErrorToHeaderAlert(
  err: string,
  t: ReturnType<typeof useTranslations<"CalendarPage">>,
): HeaderAlertPayload | null {
  if (err === "host_calendar_reconnect_required") {
    return {
      id: "calendar",
      kind: "warning",
      text: t("headerAlert.reconnect.text"),
      title: t("headerAlert.reconnect.title"),
    };
  }

  if (err === "host_calendar_not_connected") {
    return null;
  }

  if (err === "unauthorized") {
    return {
      id: "calendar",
      kind: "error",
      text: t("headerAlert.unauthorized.text"),
      title: t("headerAlert.unauthorized.title"),
    };
  }

  if (err.startsWith("failed_")) {
    return {
      id: "calendar",
      kind: "error",
      text: t("headerAlert.loadFailed.text"),
      title: err,
    };
  }

  return {
    id: "calendar",
    kind: "error",
    text: t("headerAlert.generic.text"),
    title: err,
  };
}

function buildCalendarErrorView(
  err: string,
  opts: {
    routerPush: (href: string) => void;
    onRetry: () => void;
    t: ReturnType<typeof useTranslations<"CalendarPage">>;
  },
): CalendarErrorView {
  const { t } = opts;

  if (err === "host_calendar_reconnect_required") {
    return {
      kind: "warning",
      title: t("errors.reconnectRequired.title"),
      message: t("errors.reconnectRequired.message"),
      action: {
        label: t("actions.openIntegrations"),
        onClick: () => opts.routerPush("/profile/integrations"),
      },
      secondary: {
        label: t("actions.retry"),
        onClick: opts.onRetry,
      },
      showRetry: false,
    };
  }

  if (err === "host_calendar_not_connected") {
    return {
      kind: "warning",
      title: t("errors.notConnected.title"),
      message: t("errors.notConnected.message"),
      action: {
        label: t("actions.openIntegrations"),
        onClick: () => opts.routerPush("/profile/integrations"),
      },
      secondary: {
        label: t("actions.retry"),
        onClick: opts.onRetry,
      },
      showRetry: false,
    };
  }

  if (err === "unauthorized") {
    return {
      kind: "error",
      title: t("errors.unauthorized.title"),
      message: t("errors.unauthorized.message"),
      action: {
        label: t("actions.goToLogin"),
        onClick: () => opts.routerPush("/login"),
      },
      secondary: {
        label: t("actions.retry"),
        onClick: opts.onRetry,
      },
      showRetry: false,
    };
  }

  if (err.startsWith("failed_")) {
    return {
      kind: "error",
      title: t("errors.loadFailed.title"),
      message: t("errors.loadFailed.message"),
      secondary: {
        label: t("actions.retry"),
        onClick: opts.onRetry,
      },
      showRetry: true,
    };
  }

  return {
    kind: "error",
    title: t("errors.generic.title"),
    message: t("errors.generic.message"),
    secondary: {
      label: t("actions.retry"),
      onClick: opts.onRetry,
    },
    showRetry: true,
  };
}

function LoadingSkeleton({
  rows = 10,
  isDark,
}: {
  rows?: number;
  isDark: boolean;
}) {
  const skel = isDark ? "bg-slate-800/70" : "bg-slate-200";
  const border = isDark ? "border-slate-800" : "border-slate-100";
  const softBg = isDark ? "bg-slate-900/30" : "bg-slate-50";
  const cellBg = isDark ? "bg-slate-950" : "bg-white";

  return (
    <div className="p-4">
      <div className="animate-pulse">
        <div className="flex items-center justify-between">
          <div className={`h-4 w-52 rounded ${skel}`} />
          <div className={`h-3 w-28 rounded ${skel}`} />
        </div>

        <div
          className={`mt-4 grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-0 overflow-hidden rounded-xl border ${border}`}
        >
          <div className={`h-10 border-b border-r ${border} ${softBg}`} />
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={`h-${i}`}
              className={`h-10 border-b ${border} ${softBg}`}
            />
          ))}

          <div className={`h-10 border-b border-r ${border} ${cellBg}`} />
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={`a-${i}`}
              className={`h-10 border-b ${border} ${cellBg}`}
            />
          ))}

          {Array.from({ length: rows }).map((_, r) => (
            <div key={`r-${r}`} className="contents">
              <div
                className={`h-10 border-b border-r ${border} ${cellBg} px-3 py-2`}
              >
                <div className={`h-3 w-10 rounded ${skel}`} />
              </div>
              {Array.from({ length: 7 }).map((_, c) => (
                <div
                  key={`c-${r}-${c}`}
                  className={`h-10 border-b ${border} ${cellBg}`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className={`mt-3 h-3 w-80 rounded ${skel}`} />
      </div>
    </div>
  );
}

export default function CalendarClient() {
  const t = useTranslations("CalendarPage");
  const locale = useLocale();
  const router = useRouter();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [tz, setTz] = useState("UTC");
  const [busy, setBusy] = useState<BusyBlock[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const alertId = "calendar";

    if (!err) {
      clearHeaderAlert(alertId);
      return;
    }

    const mapped = mapCalendarErrorToHeaderAlert(err, t);
    if (!mapped) {
      clearHeaderAlert(alertId);
      return;
    }

    pushHeaderAlert(mapped);
  }, [err, t]);

  useEffect(() => {
    return () => clearHeaderAlert("calendar");
  }, []);

  const [weekAnchor, setWeekAnchor] = useState(() =>
    DateTime.now().startOf("day"),
  );

  useEffect(() => setTz(getLocalTz()), []);

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor.setZone(tz).setLocale(locale)),
    [weekAnchor, tz, locale],
  );
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        weekStart.plus({ days: i }).setLocale(locale),
      ),
    [weekStart, locale],
  );

  const hours = useMemo(
    () =>
      Array.from(
        { length: HOUR_END - HOUR_START + 1 },
        (_, i) => HOUR_START + i,
      ),
    [],
  );

  const pageTitle = isDark ? "text-slate-100" : "text-slate-900";
  const pageSub = isDark ? "text-slate-400" : "text-slate-600";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const cardDivider = isDark ? "border-slate-800" : "border-slate-100";
  const gridBorder = isDark ? "border-slate-800" : "border-slate-100";
  const gridSoftLine = isDark ? "border-slate-900" : "border-slate-50";

  const headerText = isDark ? "text-slate-200" : "text-slate-800";
  const metaText = isDark ? "text-slate-400" : "text-slate-500";

  const btn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const timeColBg = isDark ? "bg-slate-950" : "bg-white";
  const timeColText = isDark ? "text-slate-400" : "text-slate-500";

  const allDayBg = isDark ? "bg-slate-900/30" : "bg-slate-50/40";
  const allDayLabel = isDark ? "text-slate-400" : "text-slate-500";

  const dayName = isDark ? "text-slate-200" : "text-slate-800";
  const dayDate = (isToday: boolean) =>
    isToday
      ? isDark
        ? "text-indigo-300 font-semibold"
        : "text-indigo-600 font-semibold"
      : isDark
        ? "text-slate-400"
        : "text-slate-500";

  const todayPill = isDark
    ? "bg-indigo-500/15 text-indigo-200"
    : "bg-indigo-50 text-indigo-700";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const from = weekStart.toUTC().toISO();
        const to = weekStart.plus({ days: 7 }).toUTC().toISO();

        const { data: sessionRes, error: sessionErr } =
          await supabase.auth.getSession();
        const token = sessionRes.session?.access_token;
        if (sessionErr || !token) throw new Error("unauthorized");

        const url =
          `/api/crm/calendar/freebusy?tz=${encodeURIComponent(tz)}` +
          `&from=${encodeURIComponent(from!)}` +
          `&to=${encodeURIComponent(to!)}`;

        const res = await crmLocaleFetch(url, {
          cache: "no-store",
          signal: controller.signal,
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = (await res.json().catch(() => ({}))) as any;
        if (!res.ok) throw new Error(json?.error || `failed_${res.status}`);

        if (!cancelled) {
          setBusy(Array.isArray(json?.busy) ? json.busy : []);
          setEvents(Array.isArray(json?.events) ? json.events : []);
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? "failed_unknown"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tz, weekStart, reloadKey]);

  const busyInWeek = useMemo(
    () =>
      busy
        .map((b) => ({
          start: DateTime.fromISO(b.start, { setZone: true })
            .setZone(tz)
            .setLocale(locale),
          end: DateTime.fromISO(b.end, { setZone: true })
            .setZone(tz)
            .setLocale(locale),
        }))
        .filter((b) => b.start.isValid && b.end.isValid),
    [busy, tz, locale],
  );

  const eventsInWeek = useMemo(
    () =>
      events
        .map((e) => ({
          ...e,
          startDT: DateTime.fromISO(e.start, { setZone: true })
            .setZone(tz)
            .setLocale(locale),
          endDT: DateTime.fromISO(e.end, { setZone: true })
            .setZone(tz)
            .setLocale(locale),
        }))
        .filter((e) => e.startDT.isValid && e.endDT.isValid),
    [events, tz, locale],
  );

  const allDayEventsByDay = useMemo(() => {
    const map = new Map<string, ApiEvent[]>();
    for (const d of days) map.set(d.toISODate()!, []);

    for (const ev of eventsInWeek) {
      if (!ev.allDay) continue;

      const startDay = ev.startDT.startOf("day");
      const endDay = ev.endDT.startOf("day");

      for (let cur = startDay; cur < endDay; cur = cur.plus({ days: 1 })) {
        const key = cur.toISODate()!;
        const list = map.get(key);
        if (list) {
          list.push({
            id: ev.id,
            title: ev.title,
            start: ev.start,
            end: ev.end,
            allDay: true,
            location: ev.location ?? null,
          });
        }
      }
    }

    for (const [k, v] of map.entries()) {
      v.sort((a, b) => a.title.localeCompare(b.title));
      map.set(k, v);
    }

    return map;
  }, [eventsInWeek, days]);

  const spanMins = (HOUR_END - HOUR_START + 1) * 60;

  function topFor(dt: DateTime) {
    const mins = dt.hour * 60 + dt.minute - HOUR_START * 60;
    return (mins / spanMins) * 100;
  }

  function heightFor(start: DateTime, end: DateTime) {
    const dur = Math.max(0, end.diff(start, "minutes").minutes);
    return (dur / spanMins) * 100;
  }

  function layoutDayEvents(day: DateTime) {
    const dayStart = day.startOf("day");
    const dayEnd = day.endOf("day");

    const visibleStart = dayStart.plus({ hours: HOUR_START });
    const visibleEnd = dayStart.plus({ hours: HOUR_END + 1 });

    const timed = eventsInWeek
      .filter((e) => !e.allDay)
      .filter((e) => e.endDT > dayStart && e.startDT < dayEnd)
      .map((e) => ({
        ...e,
        s: clamp(e.startDT, visibleStart, visibleEnd),
        en: clamp(e.endDT, visibleStart, visibleEnd),
      }))
      .filter((e) => e.en > e.s)
      .sort((a, b) => a.s.toMillis() - b.s.toMillis());

    type LaidOut = (typeof timed)[number] & { col: number; cols: number };

    const active: LaidOut[] = [];
    const out: LaidOut[] = [];

    for (const ev of timed) {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].en <= ev.s) active.splice(i, 1);
      }

      const used = new Set(active.map((a) => a.col));
      let col = 0;
      while (used.has(col)) col++;

      const laid: LaidOut = { ...ev, col, cols: 1 };
      active.push(laid);
      out.push(laid);

      const clusterSize = Math.max(...active.map((a) => a.col)) + 1;
      for (const a of active) a.cols = Math.max(a.cols, clusterSize);
    }

    return out;
  }

  const titleRange = `${weekStart.toFormat("MMM d")} – ${weekStart
    .plus({ days: 6 })
    .toFormat("MMM d, yyyy")}`;
  const now = DateTime.now().setZone(tz).setLocale(locale);

  const eventStyle = isDark
    ? {
        borderColor: "rgba(99,102,241,0.70)",
        backgroundColor: "rgba(99,102,241,0.18)",
        color: "rgba(224,231,255,0.96)",
      }
    : {
        borderColor: "#4f46e5",
        backgroundColor: "rgba(79,70,229,0.12)",
        color: "#1e1b4b",
      };

  const allDayChipStyle = isDark
    ? {
        borderColor: "rgba(99,102,241,0.65)",
        backgroundColor: "rgba(99,102,241,0.16)",
        color: "rgba(224,231,255,0.95)",
      }
    : {
        borderColor: "#4f46e5",
        backgroundColor: "rgba(79,70,229,0.10)",
        color: "#3730a3",
      };

  const busyStyle = isDark
    ? "rgba(148,163,184,0.10)"
    : "rgba(148,163,184,0.07)";

  const hourLineBorder = isDark
    ? "rgba(148,163,184,0.12)"
    : "rgba(148,163,184,0.18)";

  const warnShell = isDark
    ? "border-amber-500/20 bg-amber-500/10"
    : "border-amber-200 bg-amber-50";
  const warnText = isDark ? "text-amber-200" : "text-amber-900";
  const warnSub = isDark ? "text-amber-200/70" : "text-amber-800";
  const warnIcon = isDark ? "text-amber-300" : "text-amber-600";

  const errShell = isDark
    ? "border-rose-500/20 bg-rose-500/10"
    : "border-rose-200 bg-rose-50";
  const errText = isDark ? "text-rose-200" : "text-rose-900";
  const errSub = isDark ? "text-rose-200/70" : "text-rose-800";
  const errIcon = isDark ? "text-rose-300" : "text-rose-600";

  const actionBtn = isDark
    ? "cursor-pointer border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900/60"
    : "cursor-pointer border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

  const subtleBtn = isDark
    ? [
        "cursor-pointer",
        "border-slate-700/60",
        "bg-slate-900/60",
        "text-slate-100",
        "hover:bg-slate-900",
        "hover:border-slate-600",
        "shadow-sm",
        "ring-1 ring-inset ring-slate-800/60",
        "active:scale-[0.98]",
        "transition",
      ].join(" ")
    : [
        "cursor-pointer",
        "border-slate-200",
        "bg-slate-50",
        "text-slate-800",
        "hover:bg-white",
        "hover:border-slate-300",
        "shadow-sm",
        "ring-1 ring-inset ring-slate-200",
        "active:scale-[0.98]",
        "transition",
      ].join(" ");

  const errorView = err
    ? buildCalendarErrorView(err, {
        routerPush: (href) => router.push(href),
        onRetry: retry,
        t,
      })
    : null;

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className={`text-lg font-semibold ${pageTitle}`}>
            {t("page.title")}
          </h1>
          <p className={`mt-1 text-sm ${pageSub}`}>{t("page.description")}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`inline-flex cursor-pointer items-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${btn}`}
            onClick={() => setWeekAnchor((d) => d.minus({ weeks: 1 }))}
            disabled={loading}
          >
            <ChevronLeftIcon className="h-4 w-4" />
            {t("actions.prev")}
          </button>

          <button
            className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${btn}`}
            onClick={() => setWeekAnchor(DateTime.now().startOf("day"))}
            disabled={loading}
          >
            {t("actions.today")}
          </button>

          <button
            className={`inline-flex cursor-pointer items-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 ${btn}`}
            onClick={() => setWeekAnchor((d) => d.plus({ weeks: 1 }))}
            disabled={loading}
          >
            {t("actions.next")}
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className={`mt-4 overflow-hidden rounded-2xl border shadow-sm ${card}`}
      >
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${cardDivider}`}
        >
          <div className={`text-sm font-semibold ${headerText}`}>
            {titleRange}
          </div>
          <div className={`flex items-center gap-2 text-xs ${metaText}`}>
            <ClockIcon className="h-4 w-4" />
            {t("meta.timesShownIn", { tz })}
            {loading && (
              <span
                className={`ml-2 inline-flex items-center gap-2 ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                <span
                  className={`h-3 w-3 animate-spin rounded-full border-2 ${
                    isDark
                      ? "border-slate-600 border-t-transparent"
                      : "border-slate-300 border-t-transparent"
                  }`}
                />
                {t("states.loading")}
              </span>
            )}
          </div>
        </div>

        {errorView ? (
          <div className="p-4">
            <div
              className={[
                "rounded-2xl border p-4 sm:p-5",
                errorView.kind === "warning" ? warnShell : errShell,
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                {errorView.kind === "warning" ? (
                  <ExclamationTriangleIcon
                    className={`h-5 w-5 mt-0.5 ${warnIcon}`}
                  />
                ) : (
                  <XCircleIcon className={`h-5 w-5 mt-0.5 ${errIcon}`} />
                )}

                <div className="min-w-0 flex-1">
                  <div
                    className={[
                      "text-sm font-semibold",
                      errorView.kind === "warning" ? warnText : errText,
                    ].join(" ")}
                  >
                    {errorView.title}
                  </div>

                  <div
                    className={[
                      "mt-1 text-sm leading-relaxed",
                      errorView.kind === "warning" ? warnSub : errSub,
                    ].join(" ")}
                  >
                    {errorView.message}
                  </div>

                  {err &&
                    ![
                      "host_calendar_reconnect_required",
                      "host_calendar_not_connected",
                      "unauthorized",
                    ].includes(err) &&
                    err.startsWith("failed_") && (
                      <div
                        className={[
                          "mt-2 text-[11px] font-medium",
                          isDark ? "text-slate-400" : "text-slate-500",
                        ].join(" ")}
                      >
                        {t("errors.codeLabel")}{" "}
                        <span className="font-semibold">{err}</span>
                      </div>
                    )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {errorView.action && "onClick" in errorView.action && (
                      <button
                        type="button"
                        onClick={errorView.action.onClick}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm ${actionBtn}`}
                      >
                        {errorView.action.label}
                      </button>
                    )}

                    {errorView.secondary && (
                      <button
                        type="button"
                        onClick={errorView.secondary.onClick}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${subtleBtn}`}
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                        {errorView.secondary.label}
                      </button>
                    )}

                    {!errorView.secondary && errorView.showRetry && (
                      <button
                        type="button"
                        onClick={retry}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${subtleBtn}`}
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                        {t("actions.retry")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : loading ? (
          <LoadingSkeleton rows={12} isDark={isDark} />
        ) : (
          <div className="grid grid-rows-[auto_auto_1fr]">
            <div
              className={`grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b ${gridBorder}`}
            >
              <div
                className={`px-3 py-3 text-[11px] font-semibold ${metaText}`}
              >
                {t("labels.time")}
              </div>
              {days.map((d) => {
                const isToday = d.hasSame(now, "day");
                return (
                  <div
                    key={d.toISO()}
                    className="px-3 py-3 flex items-center justify-between"
                  >
                    <div>
                      <div className={`text-[11px] font-semibold ${dayName}`}>
                        {d.toFormat("ccc")}
                      </div>
                      <div className={`text-[11px] ${dayDate(isToday)}`}>
                        {d.toFormat("MMM d")}
                      </div>
                    </div>

                    {isToday && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${todayPill}`}
                      >
                        {t("labels.today")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              className={`grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b ${gridBorder} ${allDayBg}`}
            >
              <div
                className={`px-3 py-2 text-[10px] font-semibold ${allDayLabel}`}
              >
                {t("labels.allDay")}
              </div>

              {days.map((d) => {
                const key = d.toISODate()!;
                const list = allDayEventsByDay.get(key) ?? [];
                return (
                  <div key={key} className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {list.slice(0, 2).map((e) => (
                        <span
                          key={e.id}
                          className="max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold"
                          style={allDayChipStyle}
                          title={e.title}
                        >
                          {e.title}
                        </span>
                      ))}
                      {list.length > 2 && (
                        <span
                          className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-500"}`}
                        >
                          +{list.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
              <div className={`border-r ${gridBorder} ${timeColBg}`}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className={`${ROW_HEIGHT_CLASS} border-b px-3 py-1 text-[11px] ${timeColText} ${
                      isDark ? "border-slate-900" : "border-slate-50"
                    }`}
                  >
                    {DateTime.fromObject({ hour: h })
                      .setLocale(locale)
                      .toFormat("ha")}
                  </div>
                ))}
              </div>

              {days.map((day) => {
                const dayStart = day.startOf("day");
                const dayEnd = day.endOf("day");

                const dayBusy = busyInWeek.filter(
                  (b) => b.end > dayStart && b.start < dayEnd,
                );
                const laid = layoutDayEvents(day);

                const showNow = day.hasSame(now, "day");
                const nowTop = showNow ? topFor(now) : 0;

                return (
                  <div
                    key={day.toISO()}
                    className={`relative border-r last:border-r-0 ${gridBorder}`}
                  >
                    <div className="relative">
                      {hours.map((h) => (
                        <div
                          key={h}
                          className={`${ROW_HEIGHT_CLASS} border-b ${gridSoftLine}`}
                        />
                      ))}

                      {hours.map((h) => (
                        <div
                          key={`line-${h}`}
                          className="absolute left-0 right-0 border-t"
                          style={{
                            top: `${((h - HOUR_START) / (HOUR_END - HOUR_START + 1)) * 100}%`,
                            borderColor: hourLineBorder,
                          }}
                        />
                      ))}

                      {dayBusy.map((b, idx) => {
                        const visibleStart = dayStart.plus({
                          hours: HOUR_START,
                        });
                        const visibleEnd = dayStart.plus({
                          hours: HOUR_END + 1,
                        });

                        if (b.end <= visibleStart || b.start >= visibleEnd)
                          return null;

                        const s =
                          b.start < visibleStart ? visibleStart : b.start;
                        const e = b.end > visibleEnd ? visibleEnd : b.end;

                        const top = topFor(s);
                        const height = Math.max(1.2, heightFor(s, e));

                        return (
                          <div
                            key={`busy-${idx}`}
                            className="absolute left-2 right-2 rounded-xl"
                            style={{
                              top: `${top}%`,
                              height: `${height}%`,
                              backgroundColor: busyStyle,
                            }}
                          />
                        );
                      })}

                      {showNow && (
                        <div
                          className="absolute left-0 right-0 z-20 flex items-center"
                          style={{ top: `${nowTop}%` }}
                        >
                          <div className="h-[2px] w-full bg-rose-500/70" />
                          <div className="ml-[-6px] h-2.5 w-2.5 rounded-full bg-rose-500 shadow" />
                        </div>
                      )}

                      {laid.map((ev) => {
                        const top = topFor(ev.s);
                        const height = Math.max(1.8, heightFor(ev.s, ev.en));

                        const gutter = 10;
                        const cols = Math.max(1, ev.cols);
                        const colW = (100 - gutter) / cols;

                        const left = colW * ev.col + gutter / 2;
                        const width = colW - 1.2;

                        const timeLabel = `${ev.s.toFormat("HH:mm")} – ${ev.en.toFormat("HH:mm")}`;
                        const showSecondLine = height > 10;

                        return (
                          <div
                            key={ev.id}
                            className="absolute z-10 rounded-xl px-2 py-1 shadow-sm overflow-hidden"
                            style={{
                              top: `${top}%`,
                              height: `${height}%`,
                              left: `${left}%`,
                              width: `${width}%`,
                              border: `1px solid ${eventStyle.borderColor}`,
                              backgroundColor: eventStyle.backgroundColor,
                              color: eventStyle.color,
                            }}
                            title={`${ev.title} · ${timeLabel}${ev.location ? ` · ${ev.location}` : ""}`}
                          >
                            <div className="truncate text-[10px] font-semibold">
                              {ev.title}, {timeLabel}
                            </div>

                            {showSecondLine && ev.location && (
                              <div
                                className={`truncate text-[10px] ${isDark ? "text-slate-300" : "text-slate-600"}`}
                              >
                                {ev.location}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p
        className={`mt-3 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}
      >
        {t("footer.help")}
      </p>
    </div>
  );
}
