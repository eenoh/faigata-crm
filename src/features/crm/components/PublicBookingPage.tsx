"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import { useLocale, useTranslations } from "next-intl";
import {
  darkenHexColor as darken,
  lightenHexColor as lighten,
  normalizeHexColor,
} from "@/features/crm/utils/booking";

/* -------------------- utils -------------------- */

function slugifyInitial(value: string) {
  const v = (value || "").trim();
  return (v.charAt(0) || "F").toUpperCase();
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

function fmtWeekdayYmd(ymd: string, formatter: Intl.DateTimeFormat) {
  return formatter.format(ymdToUtcDate(ymd));
}

function fmtMonthDayYmd(ymd: string, formatter: Intl.DateTimeFormat) {
  return formatter.format(ymdToUtcDate(ymd));
}

/** Luxon-based label in a specific zone. `iso` is expected to include Z/offset */
function timeLabel(iso: string, zone: string, locale: string) {
  const dt = DateTime.fromISO(iso, { setZone: true })
    .setZone(zone)
    .setLocale(locale);
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

/** part-of-day computed in the viewer tz */
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

function normalizeDisplayText(value?: string | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
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
  confirmation_heading?: string | null;
  confirmation_subheading?: string | null;

  primary_color: string | null;

  booking_type: "one_on_one" | "group" | "round_robin";
  duration_minutes: number | null;
  min_notice_hours: number | null;
  max_notice_days: number | null;

  availability_mode?: AvailabilityMode | null;
  work_start_minute?: number | null;
  work_end_minute?: number | null;
  work_days?: number[] | null;

  required_host_ids?: string[] | null;
};

type OrgInfo = {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type Slot = { start: string; end: string };

type AvailabilityMeta = {
  availability_mode?: AvailabilityMode | null;
  work_start_minute?: number | null;
  work_end_minute?: number | null;
  work_days?: number[] | null;
};

function SlotsLoading() {
  const t = useTranslations("PublicBookingPage");

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <div
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/70"
          aria-hidden="true"
        />
        <div>
          <p className="text-[12px] font-semibold text-white/90">
            {t("states.checkingAvailabilityTitle")}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-300/70">
            {t("states.checkingAvailabilitySubtitle")}
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
  const t = useTranslations("PublicBookingPage");
  const locale = useLocale();

  const weekdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: "UTC",
      }),
    [locale],
  );

  const monthDayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    [locale],
  );

  const search = useSearchParams();
  const token = search.get("t");

  const orgName = org?.name || "Faigata";
  const orgInitial = slugifyInitial(orgName);

  const primary = useMemo(() => {
    return (
      normalizeHexColor(link.primary_color || "") ||
      normalizeHexColor(org?.primary_color || "") ||
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
      `linear-gradient(135deg, ${lighten(primary, 0.18)}, ${darken(
        primary,
        0.18,
      )})`,
    [primary],
  );

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

  const minNoticeHours = Number(link.min_notice_hours ?? 0);
  const maxNoticeDays = Number(link.max_notice_days ?? 365);

  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  useEffect(() => {
    const raw = (org?.logo_url || "").trim();
    setLogoSrc(raw && isHttpUrl(raw) ? raw : null);
  }, [org?.logo_url]);

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

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");

  const isGroup = link.booking_type === "group";

  const requiredHostIds = useMemo(() => {
    const seeded = (link.required_host_ids ?? []).filter(Boolean) as string[];
    return Array.from(new Set(seeded));
  }, [link.required_host_ids]);

  const requiredHostIdsKey = useMemo(
    () => requiredHostIds.join(","),
    [requiredHostIds],
  );

  const hostsCountLabel =
    isGroup && requiredHostIds.length
      ? t("header.hostsCount", { count: requiredHostIds.length })
      : "";

  const [availabilityMeta, setAvailabilityMeta] =
    useState<AvailabilityMeta | null>(null);

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

    const daysArr = cleaned.length ? cleaned : [0, 1, 2, 3, 4, 5, 6];
    return Array.from(new Set(daysArr));
  }, [availabilityMeta?.work_days, link.work_days]);

  const workDaysKey = useMemo(() => workDays.join(","), [workDays]);

  const availabilityLabel = useMemo(() => {
    if (availabilityMode === "twenty_four_seven") {
      return t("header.availabilityAlways");
    }

    const start = minutesToClock(workStartMinute) ?? "00:00";
    const end = minutesToClock(workEndMinute) ?? "24:00";

    const weekdayMap: Record<number, string> = {
      0: t("weekdays.sun"),
      1: t("weekdays.mon"),
      2: t("weekdays.tue"),
      3: t("weekdays.wed"),
      4: t("weekdays.thu"),
      5: t("weekdays.fri"),
      6: t("weekdays.sat"),
    };

    const daysSorted = workDays.slice().sort((a, b) => a - b);
    const dayText =
      daysSorted.length === 7
        ? t("header.availabilityDaily")
        : daysSorted.length
          ? daysSorted.map((day) => weekdayMap[day] ?? String(day)).join(", ")
          : "—";

    return t("header.availabilityWindow", {
      days: dayText,
      start,
      end,
    });
  }, [availabilityMode, workStartMinute, workEndMinute, workDays, t]);

  const confirmationHeading = useMemo(
    () =>
      normalizeDisplayText(link.confirmation_heading) ??
      t("details.bookingConfirmed"),
    [link.confirmation_heading, t],
  );

  const confirmationSubheading = useMemo(
    () =>
      normalizeDisplayText(link.confirmation_subheading) ??
      t("details.bookingSaved"),
    [link.confirmation_subheading, t],
  );

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

    const dow = start.weekday % 7;
    if (workDays.length && !workDays.includes(dow)) return false;

    const startMins = start.hour * 60 + start.minute;

    if (start.hasSame(end, "day")) {
      const endMins = end.hour * 60 + end.minute;
      return startMins >= startMin && endMins <= endMin;
    }

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

  function markGoogleReconnectRequired() {
    try {
      window.localStorage.setItem(
        "faigatacrm.googleCalendarReconnectRequired",
        "1",
      );
      window.dispatchEvent(new Event("gc-reconnect-required"));
    } catch {
      // ignore
    }
  }

  function humanizeAvailabilityError(raw?: string | null) {
    const code = String(raw || "").trim();

    if (!code) return t("errors.loadAvailability");
    if (code === "availability_internal_error")
      return t("errors.availabilityInternal");
    if (code === "booking_link_not_found") return t("errors.linkNotFound");
    if (code === "invite_not_found" || code === "invite_expired")
      return t("errors.inviteInvalid");
    if (code === "host_calendar_not_connected")
      return t("errors.hostCalendarNotConnected");
    if (code === "host_calendar_reconnect_required")
      return t("errors.hostCalendarReconnectRequired");
    if (code === "invite_query_failed" || code === "booking_link_query_failed")
      return t("errors.loadAvailabilitySoon");
    if (code === "hosts_query_failed") return t("errors.loadAvailabilitySoon");

    if (/^availability_error_\d+$/.test(code))
      return t("errors.loadAvailabilitySoon");

    return t("errors.loadAvailability");
  }

  function humanizeBookingError(raw?: string | null) {
    const code = String(raw || "").trim();

    if (!code) return t("errors.bookingFailed");
    if (code === "missing_firstName") return t("errors.firstNameRequired");
    if (code === "missing_email") return t("errors.validEmailRequired");
    if (
      code === "missing_start" ||
      code === "missing_end" ||
      code === "invalid_start_or_end" ||
      code === "end_before_start"
    ) {
      return t("errors.slotOutsideAvailability");
    }
    if (
      code === "invite_not_found" ||
      code === "invite_expired" ||
      code === "invite_already_used" ||
      code === "token_slug_mismatch"
    ) {
      return t("errors.inviteInvalid");
    }
    if (code === "booking_link_not_found") return t("errors.linkNotFound");
    if (code === "host_calendar_not_connected")
      return t("errors.hostCalendarNotConnected");
    if (code === "host_calendar_reconnect_required")
      return t("errors.hostCalendarReconnectRequired");
    if (code === "no_available_closers_for_slot") {
      return t("errors.slotOutsideAvailability");
    }
    if (
      code === "invite_query_failed" ||
      code === "booking_link_query_failed" ||
      code === "hosts_query_failed" ||
      code === "calendar_event_create_failed" ||
      code === "booking_create_failed" ||
      code === "no_hosts_configured" ||
      code === "no_host_configured" ||
      code === "no_organizer_configured"
    ) {
      return t("errors.bookingFailed");
    }
    if (/^booking_failed_\d+$/.test(code)) {
      return t("errors.bookingFailed");
    }
    if (/^[a-z0-9_]+$/i.test(code)) {
      return t("errors.bookingFailed");
    }

    return code;
  }

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
          if (json?.error === "host_calendar_reconnect_required") {
            markGoogleReconnectRequired();
          }
          throw new Error(json?.error || `availability_error_${res.status}`);
        }

        if (!cancelled) {
          setAvailabilityMeta({
            availability_mode: json?.availability_mode ?? null,
            work_start_minute: json?.work_start_minute ?? null,
            work_end_minute: json?.work_end_minute ?? null,
            work_days: json?.work_days ?? null,
          });
        }

        const raw = json?.slots || [];
        const filtered = raw.filter(slotWithinLinkAvailability);

        if (!cancelled) setSlots(filtered);
      } catch (e: any) {
        if (!cancelled) {
          const rawMsg = String(e?.message ?? "");

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
  }, [
    link.slug,
    selectedDate,
    tz,
    token,
    dayIsOutsideMax,
    nowMs,
    minDateForInput,
    isGroup,
    requiredHostIdsKey,
    link.duration_minutes,
    availabilityMode,
    workStartMinute,
    workEndMinute,
    workDaysKey,
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

  const selectedSummary = useMemo(() => {
    if (!selectedSlot) return null;

    const dt = DateTime.fromISO(selectedSlot.start, { setZone: true })
      .setZone(tz)
      .setLocale(locale);
    if (!dt.isValid) return `${selectedSlot.start}`;

    const datePart = dt.toLocaleString({
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timePart = dt.toLocaleString(DateTime.TIME_SIMPLE);

    return `${datePart} · ${timePart}`;
  }, [selectedSlot, tz, locale]);

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
      setBookingError(t("errors.firstNameRequired"));
      return;
    }
    if (!isValidEmail(em)) {
      setBookingError(t("errors.validEmailRequired"));
      return;
    }

    if (!slotWithinLinkAvailability(selectedSlot)) {
      setBookingError(t("errors.slotOutsideAvailability"));
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
      setBookingError(humanizeBookingError(e?.message));
    } finally {
      setBookingLoading(false);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem("faigata:lastPrimaryColor", primary);
      localStorage.setItem("faigata:lastVisitedUrl", window.location.href);
      if (document.referrer) {
        localStorage.setItem("faigata:lastReferrer", document.referrer);
      }
    } catch {
      // ignore
    }
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
                  {t("header.bookingWith", {
                    orgName,
                    type: t(`types.${link.booking_type}`),
                    duration: link.duration_minutes ?? 0,
                    hostsCount: hostsCountLabel,
                  })}
                </p>
                <h1 className="mt-0.5 truncate text-lg font-semibold">
                  {link.name}
                </h1>
              </div>

              <span
                className="ml-auto hidden rounded-full px-3 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/15 sm:inline-flex"
                style={{ backgroundColor: primary }}
              >
                {t("header.secureScheduling")}
              </span>
            </div>

            {!token && (
              <p className="mt-2 text-[11px] text-white/80">
                {t("header.generalLinkNotice")}
              </p>
            )}

            <p className="mt-3 max-w-2xl text-xs text-white/85">
              {link.description || t("header.defaultDescription")}
            </p>

            <p className="mt-2 text-[11px] text-white/75">
              {t("header.noticeWindow")}{" "}
              <span className="font-semibold text-white/90">
                {t("header.noticeWindowValue", {
                  minNoticeHours,
                  maxNoticeDays,
                })}
              </span>
            </p>

            <p className="mt-1 text-[11px] text-white/75">
              <span className="font-semibold text-white/90">
                {availabilityLabel}
              </span>
            </p>
          </div>

          <div className="grid gap-0 border-t border-white/10 bg-slate-950/70 text-slate-100 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="border-b border-white/10 px-5 py-4 sm:border-b-0 sm:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
                {t("details.title")}
              </p>

              <div className="mt-3 space-y-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-300/70">
                    {t("details.firstName")}
                  </label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t("details.firstNamePlaceholder")}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-100 caret-slate-100 outline-none placeholder:text-slate-400 focus:border-white/30"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-300/70">
                    {t("details.email")}
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("details.emailPlaceholder")}
                    inputMode="email"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-100 caret-slate-100 outline-none placeholder:text-slate-400 focus:border-white/30"
                  />
                  {email.trim().length > 0 && !isValidEmail(email) && (
                    <p className="mt-1 text-[11px] text-rose-200/90">
                      {t("details.validEmail")}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300/70">
                  {t("details.selected")}
                </p>

                {selectedSlot ? (
                  <p className="mt-1 text-[12px] font-semibold text-white">
                    {selectedSummary}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-300/70">
                    {t("details.pickToContinue")}
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
                      {confirmationHeading}
                    </p>
                    <p className="mt-0.5 text-[11px] text-emerald-100/70">
                      {confirmationSubheading}
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
                        ? "cursor-pointer border border-white/15 bg-white/10 hover:bg-white/15"
                        : "cursor-not-allowed border border-white/10 bg-white/5 opacity-60",
                    ].join(" ")}
                  >
                    {bookingLoading
                      ? t("details.booking")
                      : t("details.continue")}
                  </button>
                )}

                {bookingId && selectedSummary && (
                  <p className="mt-2 text-[11px] text-emerald-100/70">
                    {selectedSummary}
                  </p>
                )}
              </div>

              <p className="mt-3 text-[11px] text-slate-300/70">
                {isGroup
                  ? t("details.groupAvailabilityHelp")
                  : t("details.singleAvailabilityHelp")}
              </p>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
                  {t("calendar.chooseDate")}
                </p>

                <span className="ml-auto text-[11px] text-slate-300/70">
                  {t("calendar.localTimezone")}
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
                      ? "cursor-pointer border-white/10 bg-white/5 hover:bg-white/10"
                      : "cursor-not-allowed border-white/10 bg-white/5 opacity-45",
                  ].join(" ")}
                  onClick={() => {
                    if (!canGoPrevWeek) return;
                    setAnchorYmd((d) => addDaysYmd(d, -7));
                  }}
                  aria-label={t("calendar.previousWeek")}
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
                            ? "cursor-not-allowed border-white/10 bg-white/5 opacity-45"
                            : active
                              ? "cursor-pointer border-white/25 bg-white/12"
                              : "cursor-pointer border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
                        ].join(" ")}
                        onClick={() => {
                          if (disabled) return;
                          setSelectedDate(ymd);
                        }}
                      >
                        <div className="text-[10px] font-semibold uppercase text-white/75">
                          {fmtWeekdayYmd(ymd, weekdayFormatter)}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-white">
                          {fmtMonthDayYmd(ymd, monthDayFormatter)}
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
                      ? "cursor-pointer border-white/10 bg-white/5 hover:bg-white/10"
                      : "cursor-not-allowed border-white/10 bg-white/5 opacity-45",
                  ].join(" ")}
                  onClick={() => {
                    if (!canGoNextWeek) return;
                    setAnchorYmd((d) => addDaysYmd(d, 7));
                  }}
                  aria-label={t("calendar.nextWeek")}
                >
                  →
                </button>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/80">
                  {t("calendar.chooseTime")}
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
                      {t("calendar.beforeEarliestDate", {
                        minDate: minDateForInput,
                      })}
                    </div>
                  ) : dayIsOutsideMax ? (
                    <div className="text-[11px] text-slate-300/70">
                      {t("calendar.outsideWindow", {
                        maxNoticeDays,
                      })}
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-[12px] font-semibold text-white/90">
                        {t("calendar.noSlotsTitle")}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-300/70">
                        {t("calendar.noSlotsDescription")}
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
                                {t(`partsOfDay.${section.toLowerCase()}`)}
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
                                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
                                        : active
                                          ? "cursor-pointer border-white/35 text-white"
                                          : "cursor-pointer border-white/10 text-white hover:border-white/25",
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
                                    {timeLabel(s.start, tz, locale)}
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
                          className="mt-2 w-full cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/85 hover:bg-white/10"
                          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                        >
                          {t("calendar.showMore")}
                        </button>
                      )}

                      <p className="mt-3 text-[11px] text-slate-300/70">
                        {t("calendar.tip", {
                          minNoticeHours,
                          maxNoticeDays,
                        })}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-300/70">
            {t.rich("footer.poweredBy", {
              strong: (chunks) => (
                <span className="font-semibold text-white/90">{chunks}</span>
              ),
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
