// src/modules/crm/components/CalendarClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

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
  return dt.minus({ days: dt.weekday - 1 }).startOf("day"); // Mon start
}

function clamp(dt: DateTime, min: DateTime, max: DateTime) {
  if (dt < min) return min;
  if (dt > max) return max;
  return dt;
}

function LoadingSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="p-4">
      <div className="animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-52 rounded bg-slate-200" />
          <div className="h-3 w-28 rounded bg-slate-200" />
        </div>

        <div className="mt-4 grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-0 overflow-hidden rounded-xl border border-slate-100">
          <div className="h-10 border-b border-r border-slate-100 bg-slate-50" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={`h-${i}`}
              className="h-10 border-b border-slate-100 bg-slate-50"
            />
          ))}

          <div className="h-10 border-b border-r border-slate-100 bg-white" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={`a-${i}`}
              className="h-10 border-b border-slate-100 bg-white"
            />
          ))}

          {Array.from({ length: rows }).map((_, r) => (
            <div key={`r-${r}`} className="contents">
              <div className="h-10 border-b border-r border-slate-100 bg-white px-3 py-2">
                <div className="h-3 w-10 rounded bg-slate-200" />
              </div>
              {Array.from({ length: 7 }).map((_, c) => (
                <div
                  key={`c-${r}-${c}`}
                  className="h-10 border-b border-slate-100 bg-white"
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-3 h-3 w-80 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export default function CalendarClient() {
  const [tz, setTz] = useState("UTC");
  const [busy, setBusy] = useState<BusyBlock[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [weekAnchor, setWeekAnchor] = useState(() =>
    DateTime.now().startOf("day"),
  );

  useEffect(() => setTz(getLocalTz()), []);

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor.setZone(tz)),
    [weekAnchor, tz],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i })),
    [weekStart],
  );

  const hours = useMemo(
    () =>
      Array.from(
        { length: HOUR_END - HOUR_START + 1 },
        (_, i) => HOUR_START + i,
      ),
    [],
  );

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

        const res = await fetch(url, {
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
        if (!cancelled) setErr(String(e?.message ?? "Failed to load calendar"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tz, weekStart]);

  const busyInWeek = useMemo(
    () =>
      busy
        .map((b) => ({
          start: DateTime.fromISO(b.start, { setZone: true }).setZone(tz),
          end: DateTime.fromISO(b.end, { setZone: true }).setZone(tz),
        }))
        .filter((b) => b.start.isValid && b.end.isValid),
    [busy, tz],
  );

  const eventsInWeek = useMemo(
    () =>
      events
        .map((e) => ({
          ...e,
          startDT: DateTime.fromISO(e.start, { setZone: true }).setZone(tz),
          endDT: DateTime.fromISO(e.end, { setZone: true }).setZone(tz),
        }))
        .filter((e) => e.startDT.isValid && e.endDT.isValid),
    [events, tz],
  );

  const allDayEventsByDay = useMemo(() => {
    const map = new Map<string, ApiEvent[]>();
    for (const d of days) map.set(d.toISODate()!, []);

    for (const ev of eventsInWeek) {
      if (!ev.allDay) continue;

      const startDay = ev.startDT.startOf("day");
      const endDay = ev.endDT.startOf("day"); // end exclusive for all-day

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

  const titleRange = `${weekStart.toFormat("MMM d")} – ${weekStart.plus({ days: 6 }).toFormat("MMM d, yyyy")}`;
  const now = DateTime.now().setZone(tz);

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Calendar</h1>
          <p className="mt-1 text-sm text-slate-600">
            Week view with event titles (00:00 – 24:00).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            onClick={() => setWeekAnchor((d) => d.minus({ weeks: 1 }))}
            disabled={loading}
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Prev
          </button>

          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            onClick={() => setWeekAnchor(DateTime.now().startOf("day"))}
            disabled={loading}
          >
            Today
          </button>

          <button
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            onClick={() => setWeekAnchor((d) => d.plus({ weeks: 1 }))}
            disabled={loading}
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">
            {titleRange}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ClockIcon className="h-4 w-4" />
            Times shown in {tz}
            {loading && (
              <span className="ml-2 inline-flex items-center gap-2 text-slate-400">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                Loading…
              </span>
            )}
          </div>
        </div>

        {err ? (
          <div className="p-4 text-sm text-rose-700">
            {err === "unauthorized"
              ? "You’re not signed in (or your session expired). Please log in again."
              : err === "host_calendar_not_connected"
                ? "Your Google Calendar isn’t connected yet."
                : err === "host_calendar_reconnect_required"
                  ? "Please reconnect Google Calendar in Settings."
                  : err}
          </div>
        ) : loading ? (
          <LoadingSkeleton rows={12} />
        ) : (
          <div className="grid grid-rows-[auto_auto_1fr]">
            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
              <div className="px-3 py-3 text-[11px] font-semibold text-slate-500">
                Time
              </div>
              {days.map((d) => {
                const isToday = d.hasSame(now, "day");
                return (
                  <div
                    key={d.toISO()}
                    className="px-3 py-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[11px] font-semibold text-slate-800">
                        {d.toFormat("ccc")}
                      </div>
                      <div
                        className={`text-[11px] ${isToday ? "text-indigo-600 font-semibold" : "text-slate-500"}`}
                      >
                        {d.toFormat("MMM d")}
                      </div>
                    </div>

                    {isToday && (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        Today
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-slate-100 bg-slate-50/40">
              <div className="px-3 py-2 text-[10px] font-semibold text-slate-500">
                All-day
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
                          style={{
                            borderColor: "#4f46e5",
                            backgroundColor: "rgba(79,70,229,0.10)",
                            color: "#3730a3",
                          }}
                          title={e.title}
                        >
                          {e.title}
                        </span>
                      ))}
                      {list.length > 2 && (
                        <span className="text-[10px] text-slate-500">
                          +{list.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-slate-100 bg-white">
                {hours.map((h) => (
                  <div
                    key={h}
                    className={`${ROW_HEIGHT_CLASS} border-b border-slate-50 px-3 py-1 text-[11px] text-slate-500`}
                  >
                    {DateTime.fromObject({ hour: h }).toFormat("ha")}
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
                    className="relative border-r border-slate-100 last:border-r-0"
                  >
                    <div className="relative">
                      {hours.map((h) => (
                        <div
                          key={h}
                          className={`${ROW_HEIGHT_CLASS} border-b border-slate-50`}
                        />
                      ))}

                      {hours.map((h) => (
                        <div
                          key={`line-${h}`}
                          className="absolute left-0 right-0 border-t"
                          style={{
                            top: `${((h - HOUR_START) / (HOUR_END - HOUR_START + 1)) * 100}%`,
                            borderColor: "rgba(148,163,184,0.18)",
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
                              backgroundColor: "rgba(148,163,184,0.07)",
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
                              border: "1px solid #4f46e5",
                              backgroundColor: "rgba(79,70,229,0.12)",
                              color: "#1e1b4b",
                            }}
                            title={`${ev.title} · ${timeLabel}${ev.location ? ` · ${ev.location}` : ""}`}
                          >
                            <div className="truncate text-[10px] font-semibold">
                              {ev.title}, {timeLabel}
                            </div>

                            {showSecondLine && ev.location && (
                              <div className="truncate text-[10px] text-slate-600">
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

      <p className="mt-3 text-xs text-slate-500">
        Showing every hour (00:00 – 24:00). Event labels include “, HH:mm –
        HH:mm”.
      </p>
    </div>
  );
}
