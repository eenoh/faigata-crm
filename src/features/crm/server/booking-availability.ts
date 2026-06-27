import {
  pickFirstRouteParam,
  normalizeString,
} from "@/features/crm/server/request";
import type { PublicBookingType } from "@/features/crm/server/booking-public";

export type Slot = { start: string; end: string };
export type BusyRange = [number, number];
export type AvailabilityMode = "business_hours" | "twenty_four_seven";

const SLOT_STEP_MINUTES = 15;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function overlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function isValidYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolvePublicBookingSlug(url: URL, slugFromParams?: unknown) {
  const routeSlug = pickFirstRouteParam(slugFromParams);
  if (routeSlug) {
    return routeSlug;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.indexOf("booking-links");
  return index >= 0 ? normalizeString(parts[index + 1]) || undefined : undefined;
}

export function tzOffsetMinutes(timeZone: string, utcDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const getValue = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const year = Number(getValue("year"));
  const month = Number(getValue("month"));
  const day = Number(getValue("day"));
  const hour = Number(getValue("hour"));
  const minute = Number(getValue("minute"));
  const second = Number(getValue("second"));

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUtc - utcDate.getTime()) / 60000;
}

export function makeUtcFromLocal(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
) {
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = tzOffsetMinutes(timeZone, guessUtc);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000,
  );
}

function clampMinute(value: number) {
  return Math.max(0, Math.min(24 * 60, Math.floor(value)));
}

function parseWorkDays(raw: unknown) {
  const cleaned = (Array.isArray(raw) ? raw : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6);

  return Array.from(new Set(cleaned.length ? cleaned : [...ALL_DAYS]));
}

function dayOfWeekForDateInTimeZone(
  timeZone: string,
  year: number,
  month: number,
  day: number,
) {
  const noonUtc = makeUtcFromLocal(timeZone, year, month, day, 12, 0, 0);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noonUtc);

  const indexByWeekday: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return indexByWeekday[weekday] ?? 0;
}

export function computeWorkWindowUtc(args: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  availabilityMode: AvailabilityMode;
  workStartMinuteRaw: unknown;
  workEndMinuteRaw: unknown;
  workDaysRaw: unknown;
}) {
  const workDays = parseWorkDays(args.workDaysRaw);

  if (args.availabilityMode !== "twenty_four_seven") {
    const dayOfWeek = dayOfWeekForDateInTimeZone(
      args.timeZone,
      args.year,
      args.month,
      args.day,
    );
    if (workDays.length && !workDays.includes(dayOfWeek)) {
      return null;
    }
  }

  if (args.availabilityMode === "twenty_four_seven") {
    return {
      workStartUtc: makeUtcFromLocal(
        args.timeZone,
        args.year,
        args.month,
        args.day,
        0,
        0,
        0,
      ),
      workEndUtc: makeUtcFromLocal(
        args.timeZone,
        args.year,
        args.month,
        args.day + 1,
        0,
        0,
        0,
      ),
      workDays,
    };
  }

  const startMinute = Number.isFinite(Number(args.workStartMinuteRaw))
    ? clampMinute(Number(args.workStartMinuteRaw))
    : 0;
  const endMinute = Number.isFinite(Number(args.workEndMinuteRaw))
    ? clampMinute(Number(args.workEndMinuteRaw))
    : 24 * 60;

  if (endMinute <= startMinute) {
    return null;
  }

  const startHour = Math.floor(startMinute / 60);
  const startMinuteOfHour = startMinute % 60;
  const endIsNextDay = endMinute >= 24 * 60;
  const endHour = endIsNextDay ? 0 : Math.floor(endMinute / 60);
  const endMinuteOfHour = endIsNextDay ? 0 : endMinute % 60;

  return {
    workStartUtc: makeUtcFromLocal(
      args.timeZone,
      args.year,
      args.month,
      args.day,
      startHour,
      startMinuteOfHour,
      0,
    ),
    workEndUtc: endIsNextDay
      ? makeUtcFromLocal(
          args.timeZone,
          args.year,
          args.month,
          args.day + 1,
          0,
          0,
          0,
        )
      : makeUtcFromLocal(
          args.timeZone,
          args.year,
          args.month,
          args.day,
          endHour,
          endMinuteOfHour,
          0,
        ),
    workDays,
  };
}

export function buildAvailabilitySlots(args: {
  bookingType: PublicBookingType;
  busyPerHost: BusyRange[][];
  workStartMs: number;
  workEndMs: number;
  minBookableMs: number;
  maxBookableMs: number;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}) {
  const slots: Slot[] = [];
  const durationMs = args.durationMinutes * 60_000;
  const stepMs = SLOT_STEP_MINUTES * 60_000;
  const bufferBeforeMs = args.bufferBeforeMinutes * 60_000;
  const bufferAfterMs = args.bufferAfterMinutes * 60_000;

  for (
    let start = args.workStartMs;
    start + durationMs <= args.workEndMs;
    start += stepMs
  ) {
    const end = start + durationMs;
    if (start < args.minBookableMs || start > args.maxBookableMs) {
      continue;
    }

    const blockedStart = start - bufferBeforeMs;
    const blockedEnd = end + bufferAfterMs;

    if (args.bookingType === "group") {
      const anyHostConflicts = args.busyPerHost.some((ranges) =>
        ranges.some(([busyStart, busyEnd]) =>
          overlap(blockedStart, blockedEnd, busyStart, busyEnd),
        ),
      );
      if (!anyHostConflicts) {
        slots.push({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        });
      }
      continue;
    }

    if (args.bookingType === "round_robin") {
      const anyHostFree = args.busyPerHost.some((ranges) => {
        const hasConflict = ranges.some(([busyStart, busyEnd]) =>
          overlap(blockedStart, blockedEnd, busyStart, busyEnd),
        );
        return !hasConflict;
      });
      if (anyHostFree) {
        slots.push({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        });
      }
      continue;
    }

    const primaryHostBusyRanges = args.busyPerHost[0] ?? [];
    const hasConflict = primaryHostBusyRanges.some(([busyStart, busyEnd]) =>
      overlap(blockedStart, blockedEnd, busyStart, busyEnd),
    );
    if (!hasConflict) {
      slots.push({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
    }
  }

  return slots;
}