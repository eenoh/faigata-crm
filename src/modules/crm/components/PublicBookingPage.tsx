"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";

/* -------------------- utils -------------------- */

function slugifyInitial(value: string) {
  const v = (value || "").trim();
  return (v.charAt(0) || "F").toUpperCase();
}

function clampHex(color: string) {
  const c = (color || "").trim();
  return /^#?[0-9a-f]{6}$/i.test(c) ? (c.startsWith("#") ? c : `#${c}`) : null;
}

function lighten(color: string, amount = 0.2): string {
  const c = clampHex(color);
  if (!c) return color;
  const hex = c.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const adj = (x: number) => Math.min(255, Math.max(0, x + 255 * amount)) | 0;
  return `#${adj(r).toString(16).padStart(2, "0")}${adj(g)
    .toString(16)
    .padStart(2, "0")}${adj(b).toString(16).padStart(2, "0")}`;
}

function darken(color: string, amount = 0.2): string {
  const c = clampHex(color);
  if (!c) return color;
  const hex = c.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const adj = (x: number) => Math.min(255, Math.max(0, x - 255 * amount)) | 0;
  return `#${adj(r).toString(16).padStart(2, "0")}${adj(g)
    .toString(16)
    .padStart(2, "0")}${adj(b).toString(16).padStart(2, "0")}`;
}

function isHttpUrl(s?: string | null) {
  return !!s && (s.startsWith("http://") || s.startsWith("https://"));
}

function isValidEmail(email: string) {
  const e = (email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * Hydration-safe date strip:
 * - Use YMD strings everywhere (no local timezone drift)
 * - Format labels with fixed locale + UTC
 */
const STRIP_LOCALE = "en-US";
const WEEKDAY_FMT = new Intl.DateTimeFormat(STRIP_LOCALE, {
  weekday: "short",
  timeZone: "UTC",
});
const MONTHDAY_FMT = new Intl.DateTimeFormat(STRIP_LOCALE, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function ymdFromDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdToUtcDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
}

function addDaysYmd(ymd: string, days: number) {
  const base = ymdToUtcDate(ymd);
  base.setUTCDate(base.getUTCDate() + days);
  const yyyy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtWeekdayYmd(ymd: string) {
  return WEEKDAY_FMT.format(ymdToUtcDate(ymd));
}

function fmtMonthDayYmd(ymd: string) {
  return MONTHDAY_FMT.format(ymdToUtcDate(ymd));
}

/** ✅ Luxon-based label in a specific zone. `iso` is expected to include Z/offset */
function timeLabel(iso: string, zone: string) {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  if (!dt.isValid) return iso;
  return dt.toLocaleString(DateTime.TIME_SIMPLE);
}

function minutesToClock(mins?: number | null) {
  if (mins == null || !Number.isFinite(mins)) return null;
  const m = Math.max(0, Math.min(24 * 60, Math.floor(mins)));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function weekdayLabel(id: number) {
  // matches Create page + DB (Sun=0)
  const map: Record<number, string> = {
    0: "Sun",
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
  };
  return map[id] ?? String(id);
}

/** ✅ part-of-day computed in the viewer tz */
function partOfDay(
  iso: string,
  zone: string,
): "Night" | "Morning" | "Afternoon" | "Evening" {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  const h = dt.isValid ? dt.hour : 0;
  if (h < 6) return "Night";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

function clampMinute(v: number) {
  return Math.max(0, Math.min(24 * 60, Math.floor(v)));
}

/* -------------------- types -------------------- */

type AvailabilityMode = "business_hours" | "twenty_four_seven";

type BookingLink = {
  id: string;
  team_id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  description: string | null;

  primary_color: string | null;

  booking_type: "one_on_one" | "group" | "round_robin";
  duration_minutes: number | null;
  min_notice_hours: number | null;
  max_notice_days: number | null;

  availability_mode?: AvailabilityMode | null;
  work_start_minute?: number | null; // 0..1440
  work_end_minute?: number | null; // 0..1440
  work_days?: number[] | null; // Sun=0..Sat=6

  required_host_ids?: string[] | null;
};

type OrgInfo = {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type Slot = { start: string; end: string };

// ✅ what the availability route can return (we read these to show the REAL label even if link props omitted them)
type AvailabilityMeta = {
  availability_mode?: AvailabilityMode | null;
  work_start_minute?: number | null;
  work_end_minute?: number | null;
  work_days?: number[] | null;
};

function formatType(t: BookingLink["booking_type"]) {
  switch (t) {
    case "one_on_one":
      return "1:1";
    case "group":
      return "Group";
    case "round_robin":
      return "Round robin";
    default:
      return "Booking";
  }
}

function SlotsLoading() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/70"
          aria-hidden="true"
        />
        <div>
          <p className="text-[12px] font-semibold text-white/90">
            Checking availability
          </p>
          <p className="mt-0.5 text-[11px] text-slate-300/70">
            This usually takes a second…
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-9 rounded-lg border border-white/10 bg-white/5"
          >
            <div className="h-full w-full animate-pulse rounded-lg bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------- page -------------------- */

export default function PublicBookingPage({
  link,
  org,
}: {
  link: BookingLink;
  org?: OrgInfo | null;
}) {
  const search = useSearchParams();
  const token = search.get("t"); // read from /b/[slug]?t=...

  const orgName = org?.name || "Faigata";
  const orgInitial = slugifyInitial(orgName);

  const primary = useMemo(() => {
    return (
      clampHex(link.primary_color || "") ||
      clampHex(org?.primary_color || "") ||
      "#4f46e5"
    );
  }, [link.primary_color, org?.primary_color]);

  const headerGradient = useMemo(
    () =>
      `linear-gradient(135deg, ${lighten(primary, 0.22)}, ${darken(
        primary,
        0.06,
      )})`,
    [primary],
  );

  const pageGradient = useMemo(
    () =>
      `radial-gradient(900px 500px at 15% 10%, ${lighten(
        primary,
        0.35,
      )}55, transparent 60%),
       radial-gradient(800px 500px at 85% 20%, ${darken(
         primary,
         0.1,
       )}55, transparent 55%),
       linear-gradient(180deg, #0b1220 0%, #0b1220 35%, #0f172a 100%)`,
    [primary],
  );

  const slotGradient = useMemo(
    () =>
      `linear-gradient(135deg, ${lighten(primary, 0.1)}, ${darken(primary, 0.25)})`,
    [primary],
  );

  const slotGradientHover = useMemo(
    () =>
      `linear-gradient(135deg, ${lighten(primary, 0.18)}, ${darken(primary, 0.18)})`,
    [primary],
  );

  /** ✅ Dynamic tz (updates on focus + periodic refresh) */
  const [tz, setTz] = useState<string>("UTC");
  useEffect(() => {
    const read = () =>
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setTz(read());
    const id = window.setInterval(() => setTz(read()), 30_000);
    const onFocus = () => setTz(read());
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  /* thresholds */
  const minNoticeHours = Number(link.min_notice_hours ?? 0);
  const maxNoticeDays = Number(link.max_notice_days ?? 365);

  /* logo: expect server to pass a REAL URL (public or signed) */
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  useEffect(() => {
    const raw = (org?.logo_url || "").trim();
    setLogoSrc(raw && isHttpUrl(raw) ? raw : null);
  }, [org?.logo_url]);

  /* hydration-safe now snapshot */
  const [nowMs, setNowMs] = useState<number>(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const minBookableMs = useMemo(
    () => nowMs + minNoticeHours * 60 * 60 * 1000,
    [nowMs, minNoticeHours],
  );

  const maxBookableMs = useMemo(
    () => nowMs + maxNoticeDays * 24 * 60 * 60 * 1000,
    [nowMs, maxNoticeDays],
  );

  /* date picker */
  const todayYmd = useMemo(() => {
    const base = nowMs ? new Date(nowMs) : new Date();
    return ymdFromDateLocal(base);
  }, [nowMs]);
  const [anchorYmd, setAnchorYmd] = useState(() =>
    ymdFromDateLocal(new Date()),
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    ymdFromDateLocal(new Date()),
  );

  const minDateForInput = useMemo(() => {
    if (nowMs === 0) return todayYmd;
    return ymdFromDateLocal(new Date(minBookableMs));
  }, [nowMs, minBookableMs, todayYmd]);

  const maxDateForInput = useMemo(() => {
    if (nowMs === 0) return addDaysYmd(todayYmd, maxNoticeDays);
    const d = new Date(maxBookableMs);
    return ymdFromDateLocal(d);
  }, [nowMs, maxBookableMs, maxNoticeDays, todayYmd]);

  useEffect(() => {
    if (nowMs === 0) return;

    if (selectedDate < minDateForInput) {
      setSelectedDate(minDateForInput);
      setAnchorYmd(minDateForInput);
      return;
    }

    if (selectedDate > maxDateForInput) {
      setSelectedDate(maxDateForInput);
      setAnchorYmd(maxDateForInput);
    }
  }, [nowMs, selectedDate, minDateForInput, maxDateForInput]);

  useEffect(() => {
    if (nowMs === 0) return;
    if (anchorYmd < minDateForInput) setAnchorYmd(minDateForInput);
    if (anchorYmd > maxDateForInput) setAnchorYmd(maxDateForInput);
  }, [nowMs, anchorYmd, minDateForInput, maxDateForInput]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysYmd(anchorYmd, i)),
    [anchorYmd],
  );

  const dayIsOutsideMax = useMemo((): boolean => {
    const dayStartMs = ymdToUtcDate(selectedDate).getTime();
    return nowMs > 0 && dayStartMs > maxBookableMs;
  }, [selectedDate, nowMs, maxBookableMs]);

  const canGoPrevWeek = useMemo(() => {
    if (nowMs === 0) return false;
    const anchorStart = ymdToUtcDate(anchorYmd).getTime();
    const minStart = ymdToUtcDate(minDateForInput).getTime();
    return anchorStart > minStart;
  }, [nowMs, anchorYmd, minDateForInput]);

  const canGoNextWeek = useMemo(() => {
    if (nowMs === 0) return false;
    const anchorEnd = ymdToUtcDate(addDaysYmd(anchorYmd, 6)).getTime();
    const maxEnd = ymdToUtcDate(maxDateForInput).getTime();
    return anchorEnd < maxEnd;
  }, [nowMs, anchorYmd, maxDateForInput]);

  /* invitee details (inputs) */
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");

  /* -------------------- HOSTS (NO /hosts CALL) -------------------- */
  const isGroup = link.booking_type === "group";

  const requiredHostIds = useMemo(() => {
    const seeded = (link.required_host_ids ?? []).filter(Boolean) as string[];
    return Array.from(new Set(seeded));
  }, [link.required_host_ids]);

  const hostsCountLabel =
    isGroup && requiredHostIds.length
      ? ` · ${requiredHostIds.length} hosts`
      : "";

  /* -------------------- availability meta (from route) -------------------- */
  const [availabilityMeta, setAvailabilityMeta] =
    useState<AvailabilityMeta | null>(null);

  /**
   * ✅ Availability config
   * IMPORTANT:
   * - Prefer what the availability route returns (source of truth).
   * - Fall back to `link.*` if route meta not present yet.
   * - NO 9–5 defaults here.
   */
  const availabilityMode = useMemo(() => {
    return (
      (availabilityMeta?.availability_mode as AvailabilityMode | null) ||
      (link.availability_mode as AvailabilityMode | null) ||
      "business_hours"
    );
  }, [availabilityMeta?.availability_mode, link.availability_mode]);

  const workStartMinute = useMemo(() => {
    const v =
      availabilityMeta?.work_start_minute ?? link.work_start_minute ?? null;
    return Number.isFinite(v as number) ? clampMinute(v as number) : 0;
  }, [availabilityMeta?.work_start_minute, link.work_start_minute]);

  const workEndMinute = useMemo(() => {
    const v = availabilityMeta?.work_end_minute ?? link.work_end_minute ?? null;
    return Number.isFinite(v as number) ? clampMinute(v as number) : 24 * 60;
  }, [availabilityMeta?.work_end_minute, link.work_end_minute]);

  const workDays = useMemo(() => {
    const raw =
      availabilityMeta?.work_days ??
      (Array.isArray(link.work_days) ? link.work_days : null);

    const cleaned = (raw ?? [])
      .filter((x) => Number.isFinite(x))
      .map((x) => Number(x))
      .filter((x) => x >= 0 && x <= 6);

    // If missing/empty, default to ALL days.
    const daysArr = cleaned.length ? cleaned : [0, 1, 2, 3, 4, 5, 6];
    return Array.from(new Set(daysArr));
  }, [availabilityMeta?.work_days, link.work_days]);

  /* ✅ Availability label (display only) — NO timezone suffix */
  const availabilityLabel = useMemo(() => {
    if (availabilityMode === "twenty_four_seven") return "Availability: 24/7";

    const start = minutesToClock(workStartMinute) ?? "00:00";
    const end = minutesToClock(workEndMinute) ?? "24:00";
    const daysSorted = workDays.slice().sort((a, b) => a - b);

    const dayText =
      daysSorted.length === 7
        ? "Daily"
        : daysSorted.length
          ? daysSorted.map(weekdayLabel).join(", ")
          : "—";

    // ✅ no "(Europe/Vienna)" etc.
    return `Availability: ${dayText} · ${start}–${end}`;
  }, [availabilityMode, workStartMinute, workEndMinute, workDays]);

  /**
   * ✅ Client-side hard guard using Luxon in `tz`:
   * The entire meeting must fit inside the work window.
   * Allows midnight boundary ONLY when endMinute is 1440 and slot ends exactly at local midnight next day.
   */
  function slotWithinLinkAvailability(s: Slot) {
    if (availabilityMode === "twenty_four_seven") return true;

    const start = DateTime.fromISO(s.start, { setZone: true }).setZone(tz);
    if (!start.isValid) return false;

    const startMin = clampMinute(workStartMinute);
    const endMin = clampMinute(workEndMinute);
    if (endMin <= startMin) return false;

    const dur = Number(link.duration_minutes ?? 0);

    const end = s.end
      ? DateTime.fromISO(s.end, { setZone: true }).setZone(tz)
      : Number.isFinite(dur) && dur > 0
        ? start.plus({ minutes: dur })
        : null;

    if (!end || !end.isValid) return false;

    // Luxon weekday: Mon=1..Sun=7. Convert to Sun=0..Sat=6
    const dow = start.weekday % 7; // Sun => 0
    if (workDays.length && !workDays.includes(dow)) return false;

    const startMins = start.hour * 60 + start.minute;

    // Same local day
    if (start.hasSame(end, "day")) {
      const endMins = end.hour * 60 + end.minute;
      return startMins >= startMin && endMins <= endMin;
    }

    // Special case: allow end exactly at local midnight NEXT day when endMin is 1440
    if (endMin === 1440) {
      const isNextDay = end
        .startOf("day")
        .equals(start.plus({ days: 1 }).startOf("day"));
      const isMidnight = end.hour === 0 && end.minute === 0 && end.second === 0;
      if (isNextDay && isMidnight) {
        return startMins >= startMin;
      }
    }

    return false;
  }

  // ✅ NEW: mark reconnect-required so AppHeader can show the warning (and Settings can clear cookie + reconnect)
  function markGoogleReconnectRequired() {
    try {
      window.localStorage.setItem(
        "faigatacrm.googleCalendarReconnectRequired",
        "1",
      );
      window.dispatchEvent(new Event("gc-reconnect-required"));
    } catch {}
  }

  function humanizeAvailabilityError(raw?: string | null) {
    const code = String(raw || "").trim();

    // common codes you return from the route
    if (!code) return "We couldn’t load availability. Please try again.";
    if (code === "availability_internal_error")
      return "We couldn’t check availability right now. Please refresh the page and try again.";
    if (code === "booking_link_not_found")
      return "This booking link doesn’t exist anymore.";
    if (code === "invite_not_found" || code === "invite_expired")
      return "This invite link is no longer valid.";
    if (code === "host_calendar_not_connected")
      return "The host hasn’t connected their calendar yet.";
    if (code === "host_calendar_reconnect_required")
      return "The host needs to reconnect their Google Calendar to show availability.";

    // fallback for status-style errors like "availability_error_500"
    if (/^availability_error_\d+$/.test(code))
      return "We couldn’t load availability right now. Please try again in a moment.";

    // fallback: don’t show raw code
    return "We couldn’t load availability. Please try again.";
  }

  /* availability */
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const PAGE_SIZE = 18;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        setLoadingSlots(true);
        setSlotsError(null);
        setSelectedSlot(null);
        setVisibleCount(PAGE_SIZE);

        if (dayIsOutsideMax || nowMs === 0 || selectedDate < minDateForInput) {
          if (!cancelled) setSlots([]);
          return;
        }

        const qs = new URLSearchParams({
          date: selectedDate,
          tz,
        });

        if (token) qs.set("t", token);

        if (isGroup && requiredHostIds.length) {
          qs.set("hosts", requiredHostIds.join(","));
        }

        // ✅ Server is the source of truth for work hours.
        const res = await fetch(
          `/api/crm/booking-links/${link.slug}/availability?${qs.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );

        const json = (await res.json().catch(() => null)) as {
          slots?: Slot[];
          availability_mode?: AvailabilityMode | null;
          work_start_minute?: number | null;
          work_end_minute?: number | null;
          work_days?: number[] | null;
          error?: string;
        } | null;

        if (!res.ok) {
          // ✅ NEW: if host needs reconnect, tell the app (header + settings)
          if (json?.error === "host_calendar_reconnect_required") {
            markGoogleReconnectRequired();
          }
          throw new Error(json?.error || `availability_error_${res.status}`);
        }

        // ✅ Capture meta from route so the label is always accurate even if page props omitted fields
        if (!cancelled) {
          setAvailabilityMeta({
            availability_mode: json?.availability_mode ?? null,
            work_start_minute: json?.work_start_minute ?? null,
            work_end_minute: json?.work_end_minute ?? null,
            work_days: json?.work_days ?? null,
          });
        }

        const raw = json?.slots || [];

        // ✅ Extra client guard (incl. end time)
        const filtered = raw.filter(slotWithinLinkAvailability);

        if (!cancelled) setSlots(filtered);
      } catch (e: any) {
        if (!cancelled) {
          const rawMsg = String(e?.message ?? "");

          // ✅ NEW: also catch reconnect-required when error comes through as thrown message
          if (rawMsg === "host_calendar_reconnect_required") {
            markGoogleReconnectRequired();
          }

          setSlotsError(humanizeAvailabilityError(rawMsg));
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    link.slug,
    selectedDate,
    tz,
    token,
    dayIsOutsideMax,
    nowMs,
    minDateForInput,
    isGroup,
    requiredHostIds.join(","),
    availabilityMode,
    workStartMinute,
    workEndMinute,
    workDays.join(","),
    link.duration_minutes,
  ]);

  const groupedAll = useMemo(() => {
    const map: Record<"Night" | "Morning" | "Afternoon" | "Evening", Slot[]> = {
      Night: [],
      Morning: [],
      Afternoon: [],
      Evening: [],
    };
    for (const s of slots) map[partOfDay(s.start, tz)].push(s);
    return map;
  }, [slots, tz]);

  const flatOrdered = useMemo(() => {
    return [
      ...groupedAll.Night,
      ...groupedAll.Morning,
      ...groupedAll.Afternoon,
      ...groupedAll.Evening,
    ];
  }, [groupedAll]);

  const visibleSet = useMemo(() => {
    return new Set(flatOrdered.slice(0, visibleCount).map((s) => s.start));
  }, [flatOrdered, visibleCount]);

  const groupedVisible = useMemo(() => {
    const out: typeof groupedAll = {
      Night: [],
      Morning: [],
      Afternoon: [],
      Evening: [],
    };
    (["Night", "Morning", "Afternoon", "Evening"] as const).forEach((k) => {
      out[k] = groupedAll[k].filter((s) => visibleSet.has(s.start));
    });
    return out;
  }, [groupedAll, visibleSet]);

  const canShowMore = flatOrdered.length > visibleCount;

  function isSlotDisabled(s: Slot) {
    const start = Date.parse(s.start);
    if (!Number.isFinite(start)) return true;
    if (nowMs === 0) return true;
    if (start < minBookableMs) return true;
    if (start > maxBookableMs) return true;
    return false;
  }

  // ✅ Selected label in viewer timezone, but do NOT display the tz string
  const selectedSummary = useMemo(() => {
    if (!selectedSlot) return null;

    const dt = DateTime.fromISO(selectedSlot.start, { setZone: true }).setZone(
      tz,
    );
    if (!dt.isValid) return `${selectedSlot.start}`;

    const datePart = dt.toLocaleString({
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timePart = dt.toLocaleString(DateTime.TIME_SIMPLE);

    return `${datePart} · ${timePart}`;
  }, [selectedSlot, tz]);

  /* booking submit */
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const canContinue =
    !!selectedSlot &&
    firstName.trim().length > 0 &&
    isValidEmail(email) &&
    !bookingLoading;

  async function handleContinue() {
    if (!selectedSlot) return;

    const fn = firstName.trim();
    const em = email.trim();

    if (!fn) {
      setBookingError("Please enter your first name.");
      return;
    }
    if (!isValidEmail(em)) {
      setBookingError("Please enter a valid email address.");
      return;
    }

    // ✅ last-second guard before booking
    if (!slotWithinLinkAvailability(selectedSlot)) {
      setBookingError("That time is outside the booking link’s availability.");
      return;
    }

    try {
      setBookingLoading(true);
      setBookingError(null);
      setBookingId(null);

      const res = await fetch(`/api/crm/booking-links/${link.slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          token,
          firstName: fn,
          email: em,
          start: selectedSlot.start,
          end: selectedSlot.end,
          tz,
          ...(isGroup && requiredHostIds.length
            ? { hostIds: requiredHostIds }
            : {}),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok)
        throw new Error(json?.error || `booking_failed_${res.status}`);

      setBookingId(String((json as any).bookingId || ""));
    } catch (e: any) {
      setBookingError(String(e?.message ?? "Failed to complete booking"));
    } finally {
      setBookingLoading(false);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem("faigata:lastPrimaryColor", primary);
      localStorage.setItem("faigata:lastVisitedUrl", window.location.href);
      if (document.referrer)
        localStorage.setItem("faigata:lastReferrer", document.referrer);
    } catch {}
  }, [primary]);

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{ backgroundImage: pageGradient }}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(closest-side at 50% 30%, black 0%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(closest-side at 50% 30%, black 0%, transparent 75%)",
        }}
      />

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur">
          <div
            className="px-6 py-5 text-white"
            style={{ backgroundImage: headerGradient }}
          >
            <div className="flex items-center gap-3">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSrc}
                  alt={orgName}
                  className="h-10 w-10 rounded-2xl border border-white/20 bg-white/10 object-contain p-1"
                  style={{ boxShadow: "0 14px 45px rgba(0,0,0,0.35)" }}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoSrc(null)}
                />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xs font-semibold uppercase"
                  style={{ boxShadow: "0 14px 45px rgba(0,0,0,0.35)" }}
                >
                  {orgInitial}
                </div>
              )}

              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-white/75">
                  Booking with {orgName} · {formatType(link.booking_type)}
                  {link.duration_minutes
                    ? ` · ${link.duration_minutes} min`
                    : ""}
                  {hostsCountLabel}
                </p>
                <h1 className="mt-0.5 truncate text-lg font-semibold">
                  {link.name}
                </h1>
              </div>

              <span
                className="ml-auto hidden rounded-full px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/15 sm:inline-flex"
                style={{ backgroundColor: primary }}
              >
                Secure scheduling
              </span>
            </div>

            {!token && (
              <p className="mt-2 text-[11px] text-white/80">
                Note: this looks like a general scheduling link (not
                personalized to a specific invite).
              </p>
            )}

            <p className="mt-3 max-w-2xl text-xs text-white/85">
              {link.description ||
                "Choose a date and time that works for you. We’ll send a calendar invite after you confirm."}
            </p>

            <p className="mt-2 text-[11px] text-white/75">
              Notice window:{" "}
              <span className="font-semibold text-white/90">
                {minNoticeHours}h min · {maxNoticeDays} days max
              </span>
            </p>

            <p className="mt-1 text-[11px] text-white/75">
              <span className="font-semibold text-white/90">
                {availabilityLabel}
              </span>
            </p>
          </div>

          {/* Body */}
          <div className="grid gap-0 border-t border-white/10 bg-slate-950/70 text-slate-100 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            {/* Left */}
            <div className="border-b border-white/10 px-5 py-4 sm:border-b-0 sm:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
                Your details
              </p>

              <div className="mt-3 space-y-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-300/70">
                    First name
                  </label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px]
                    !text-slate-400 caret-slate-400 outline-none !placeholder:text-slate-400 focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-300/70">
                    Email
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    inputMode="email"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px]
                    !text-slate-400 caret-slate-400 outline-none !placeholder:text-slate-400 focus:border-white/30"
                  />
                  {email.trim().length > 0 && !isValidEmail(email) && (
                    <p className="mt-1 text-[11px] text-rose-200/90">
                      Please enter a valid email.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300/70">
                  Selected
                </p>

                {selectedSlot ? (
                  <p className="mt-1 text-[12px] font-semibold text-white">
                    {selectedSummary}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-300/70">
                    Pick a date and time to continue.
                  </p>
                )}

                {bookingError && (
                  <p className="mt-2 text-[11px] text-rose-200/90">
                    {bookingError}
                  </p>
                )}

                {bookingId ? (
                  <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
                    <p className="text-[12px] font-semibold text-emerald-100">
                      Booking confirmed
                    </p>
                    <p className="mt-0.5 text-[11px] text-emerald-100/70">
                      Your booking has been saved.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!canContinue}
                    onClick={handleContinue}
                    className={[
                      "mt-3 w-full rounded-lg px-3 py-2 text-[12px] font-semibold transition",
                      canContinue
                        ? "bg-white/10 hover:bg-white/15 border border-white/15 cursor-pointer"
                        : "bg-white/5 border border-white/10 opacity-60 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {bookingLoading ? "Booking…" : "Continue"}
                  </button>
                )}
              </div>

              <p className="mt-3 text-[11px] text-slate-300/70">
                {isGroup
                  ? "Availability is computed across all required closers’ calendars for this meeting."
                  : "Availability is pulled from the host’s connected Google Calendar."}
              </p>
            </div>

            {/* Right */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
                  Choose a date
                </p>

                {/* ✅ hide tz string (still used internally) */}
                <span className="ml-auto text-[11px] text-slate-300/70">
                  Times shown in your local timezone
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  min={minDateForInput}
                  max={maxDateForInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (v < minDateForInput || v > maxDateForInput) return;
                    setSelectedDate(v);
                    setAnchorYmd(v);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/90 outline-none"
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canGoPrevWeek}
                  className={[
                    "rounded-lg border px-2 py-2 text-xs text-white/80",
                    canGoPrevWeek
                      ? "border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
                      : "border-white/10 bg-white/5 opacity-45 cursor-not-allowed",
                  ].join(" ")}
                  onClick={() => {
                    if (!canGoPrevWeek) return;
                    setAnchorYmd((d) => addDaysYmd(d, -7));
                  }}
                  aria-label="Previous week"
                >
                  ←
                </button>

                <div className="grid flex-1 grid-cols-7 gap-2">
                  {days.map((ymd) => {
                    const active = ymd === selectedDate;
                    const dayStartMs = ymdToUtcDate(ymd).getTime();

                    const disabled =
                      nowMs === 0 ||
                      dayStartMs < ymdToUtcDate(minDateForInput).getTime() ||
                      dayStartMs > maxBookableMs;

                    return (
                      <button
                        key={ymd}
                        type="button"
                        disabled={disabled}
                        className={[
                          "rounded-xl border px-2 py-2 text-center transition",
                          disabled
                            ? "border-white/10 bg-white/5 opacity-45 cursor-not-allowed"
                            : active
                              ? "border-white/25 bg-white/12 cursor-pointer"
                              : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer",
                        ].join(" ")}
                        onClick={() => {
                          if (disabled) return;
                          setSelectedDate(ymd);
                        }}
                      >
                        <div className="text-[10px] font-semibold uppercase text-white/75">
                          {fmtWeekdayYmd(ymd)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-white">
                          {fmtMonthDayYmd(ymd)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={!canGoNextWeek}
                  className={[
                    "rounded-lg border px-2 py-2 text-xs text-white/80",
                    canGoNextWeek
                      ? "border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
                      : "border-white/10 bg-white/5 opacity-45 cursor-not-allowed",
                  ].join(" ")}
                  onClick={() => {
                    if (!canGoNextWeek) return;
                    setAnchorYmd((d) => addDaysYmd(d, 7));
                  }}
                  aria-label="Next week"
                >
                  →
                </button>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
                  Choose a time
                </p>

                <div className="mt-3">
                  {loadingSlots ? (
                    <SlotsLoading />
                  ) : slotsError ? (
                    <div className="text-[11px] text-rose-200/90">
                      {slotsError}
                    </div>
                  ) : selectedDate < minDateForInput ? (
                    <div className="text-[11px] text-slate-300/70">
                      This date is before the earliest bookable date (
                      {minDateForInput}).
                    </div>
                  ) : dayIsOutsideMax ? (
                    <div className="text-[11px] text-slate-300/70">
                      This date is outside the booking window ({maxNoticeDays}{" "}
                      days).
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-[12px] font-semibold text-white/90">
                        No available time slots for this day.
                      </p>
                      <p className="mt-1 text-[11px] text-slate-300/70">
                        Try another date — the host(s) may be fully booked or
                        unavailable.
                      </p>
                    </div>
                  ) : (
                    <>
                      {(
                        ["Night", "Morning", "Afternoon", "Evening"] as const
                      ).map((section) => {
                        const list = groupedVisible[section];
                        if (!list.length) return null;

                        return (
                          <div key={section} className="mb-4">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-[11px] font-semibold text-white/85">
                                {section}
                              </span>
                              <span className="text-[11px] text-slate-300/60">
                                ({groupedAll[section].length})
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              {list.map((s) => {
                                const active = selectedSlot?.start === s.start;
                                const disabled = isSlotDisabled(s);

                                return (
                                  <button
                                    key={s.start}
                                    type="button"
                                    disabled={disabled}
                                    className={[
                                      "rounded-lg border px-2 py-2 text-[11px] font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-white/30 active:scale-[0.99]",
                                      disabled
                                        ? "border-white/10 bg-white/5 text-white/35 cursor-not-allowed"
                                        : active
                                          ? "border-white/35 text-white cursor-pointer"
                                          : "border-white/10 text-white hover:border-white/25 cursor-pointer",
                                    ].join(" ")}
                                    style={
                                      disabled
                                        ? undefined
                                        : {
                                            backgroundImage: slotGradient,
                                            backgroundSize: "200% 200%",
                                            backgroundPosition: active
                                              ? "100% 50%"
                                              : "0% 50%",
                                            boxShadow: active
                                              ? "0 10px 30px rgba(0,0,0,0.35)"
                                              : undefined,
                                          }
                                    }
                                    onMouseEnter={(e) => {
                                      if (disabled) return;
                                      e.currentTarget.style.backgroundImage =
                                        slotGradientHover;
                                      e.currentTarget.style.backgroundPosition =
                                        "100% 50%";
                                    }}
                                    onMouseLeave={(e) => {
                                      if (disabled) return;
                                      e.currentTarget.style.backgroundImage =
                                        slotGradient;
                                      e.currentTarget.style.backgroundPosition =
                                        active ? "100% 50%" : "0% 50%";
                                    }}
                                    onClick={() => {
                                      if (disabled) return;
                                      setSelectedSlot(s);
                                      setBookingError(null);
                                      setBookingId(null);
                                    }}
                                  >
                                    {timeLabel(s.start, tz)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {canShowMore && (
                        <button
                          type="button"
                          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/85 hover:bg-white/10 cursor-pointer"
                          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                        >
                          Show more times
                        </button>
                      )}

                      <p className="mt-3 text-[11px] text-slate-300/70">
                        Tip: disabled times are outside your notice window (
                        {minNoticeHours}h / {maxNoticeDays} days max).
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-300/70">
            Powered by{" "}
            <span className="font-semibold text-white/90">Faigata</span>
          </div>
        </div>
      </div>
    </div>
  );
}
