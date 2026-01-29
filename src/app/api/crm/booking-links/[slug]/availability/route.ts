// src/app/api/crm/booking-links/[slug]/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Slot = { start: string; end: string };
type AvailabilityMode = "business_hours" | "twenty_four_seven";

type RouteContext = {
  params: Promise<{ slug?: string }>;
};

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** returns minutes offset of `timeZone` from UTC at the given UTC instant */
function tzOffsetMinutes(timeZone: string, utcDate: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  const ss = Number(get("second"));

  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return (asUtc - utcDate.getTime()) / 60000;
}

/**
 * Create a UTC Date that corresponds to a "local wall time" in `timeZone`.
 * (No external libs; works for DST transitions reasonably well for scheduling)
 */
function makeUtcFromLocal(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hh: number,
  mm = 0,
  ss = 0
) {
  const guessUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const offset = tzOffsetMinutes(timeZone, guessUtc);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss) - offset * 60_000);
}

/* -------------------- availability helpers -------------------- */

function clampMinute(v: number) {
  // allow 0..1440 (1440 == 24:00 boundary)
  return Math.max(0, Math.min(24 * 60, Math.floor(v)));
}

function parseWorkDays(raw: any): number[] {
  const cleaned = (Array.isArray(raw) ? raw : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x >= 0 && x <= 6);

  // IMPORTANT: if missing, default to ALL days (not Mon–Fri)
  return Array.from(new Set(cleaned.length ? cleaned : [0, 1, 2, 3, 4, 5, 6]));
}

/**
 * Day-of-week (Sun=0..Sat=6) for a given Y-M-D *in the requested tz*.
 * Uses local NOON to avoid DST midnight edge cases.
 */
function dowForYmdInTz(timeZone: string, y: number, m: number, d: number): number {
  const noonUtc = makeUtcFromLocal(timeZone, y, m, d, 12, 0, 0);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noonUtc);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/**
 * Build the UTC window [workStartUtc, workEndUtc] for the requested day based on:
 * - availability_mode
 * - work_start_minute / work_end_minute (0..1440)
 * - work_days
 *
 * IMPORTANT:
 * - NO hardcoded 09:00–17:00.
 * - If business_hours but minutes are missing, default to open window 00:00–24:00.
 * - If end==1440, endUtc becomes next day 00:00.
 */
function computeWorkWindowUtc(args: {
  tz: string;
  yy: number;
  mm: number;
  dd: number;
  availabilityMode: AvailabilityMode;
  workStartMinuteRaw: any;
  workEndMinuteRaw: any;
  workDaysRaw: any;
}): { workStartUtc: Date; workEndUtc: Date; workDays: number[] } | null {
  const { tz, yy, mm, dd, availabilityMode } = args;

  const workDays = parseWorkDays(args.workDaysRaw);

  if (availabilityMode !== "twenty_four_seven") {
    const dow = dowForYmdInTz(tz, yy, mm, dd);
    if (workDays.length && !workDays.includes(dow)) return null;
  }

  // If 24/7 => full day window
  if (availabilityMode === "twenty_four_seven") {
    const startUtc = makeUtcFromLocal(tz, yy, mm, dd, 0, 0, 0);
    // end is next day 00:00
    const endUtc = makeUtcFromLocal(tz, yy, mm, dd + 1, 0, 0, 0);
    return { workStartUtc: startUtc, workEndUtc: endUtc, workDays };
  }

  // business_hours: use stored minutes; if missing => open window
  const startMin = Number.isFinite(Number(args.workStartMinuteRaw))
    ? clampMinute(Number(args.workStartMinuteRaw))
    : 0;

  const endMin = Number.isFinite(Number(args.workEndMinuteRaw))
    ? clampMinute(Number(args.workEndMinuteRaw))
    : 24 * 60;

  // invalid window => no availability
  if (endMin <= startMin) return null;

  const sh = Math.floor(startMin / 60);
  const sm = startMin % 60;

  // endMin can be 1440 => next day 00:00
  const endIsNextDay = endMin >= 24 * 60;
  const eh = endIsNextDay ? 0 : Math.floor(endMin / 60);
  const em = endIsNextDay ? 0 : endMin % 60;

  const workStartUtc = makeUtcFromLocal(tz, yy, mm, dd, sh, sm, 0);
  const workEndUtc = endIsNextDay
    ? makeUtcFromLocal(tz, yy, mm, dd + 1, 0, 0, 0)
    : makeUtcFromLocal(tz, yy, mm, dd, eh, em, 0);

  return { workStartUtc, workEndUtc, workDays };
}

/* -------------------- google helpers (fixed behavior) -------------------- */

class GoogleReconnectRequiredError extends Error {
  detail?: string;
  userId?: string;
  constructor(message = "google_reconnect_required", opts?: { detail?: string; userId?: string }) {
    super(message);
    this.name = "GoogleReconnectRequiredError";
    this.detail = opts?.detail;
    this.userId = opts?.userId;
  }
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("server_missing_google_env");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("[availability] refresh failed", json);
    const code = String(json?.error || "unknown");
    const desc = String(json?.error_description || "");
    throw new GoogleReconnectRequiredError("google_reconnect_required", {
      detail: `${code}:${desc}`.slice(0, 400),
    });
  }

  return {
    access_token: json.access_token as string,
    expires_in: Number(json.expires_in ?? 0),
  };
}

/* -------------------- route -------------------- */

export async function GET(req: NextRequest, ctx: RouteContext) {
  const isDev = process.env.NODE_ENV !== "production";

  try {
    const url = new URL(req.url);

    // ✅ Next expects ctx.params to be a Promise → await it
    const { slug: slugFromParams } = await ctx.params;

    let slug = slugFromParams;
    if (!slug) {
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("booking-links");
      slug = idx >= 0 ? parts[idx + 1] : undefined;
    }

    const date = url.searchParams.get("date"); // YYYY-MM-DD
    const tz = url.searchParams.get("tz") || "UTC";
    const token = url.searchParams.get("t"); // optional invite token

    if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "missing_date" }, { status: 400 });

    // If token present, resolve booking link from invite
    let linkIdFromToken: string | null = null;

    if (token) {
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("booking_link_invites")
        .select("booking_link_id, used_at, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (invErr) {
        console.error("[availability] invite query error", invErr);
      } else if (inv?.booking_link_id) {
        if (inv.used_at) return NextResponse.json({ slots: [] });
        if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
          return NextResponse.json({ slots: [] });
        }
        linkIdFromToken = String(inv.booking_link_id);
      }
    }

    // includes availability fields
    const baseSelect =
      "id, slug, owner_user_id, booking_type, duration_minutes, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_notice_days, primary_color, availability_mode, work_start_minute, work_end_minute, work_days";

    const { data: link, error: linkErr } = linkIdFromToken
      ? await supabaseAdmin.from("booking_links").select(baseSelect).eq("id", linkIdFromToken).maybeSingle()
      : await supabaseAdmin.from("booking_links").select(baseSelect).eq("slug", slug).maybeSingle();

    if (linkErr) {
      console.error("[availability] booking link query error", linkErr);
      return NextResponse.json({ error: "booking_link_query_failed" }, { status: 500 });
    }
    if (!link) return NextResponse.json({ error: "booking_link_not_found" }, { status: 404 });

    // If token present, ensure URL slug matches link.slug
    if (token && linkIdFromToken && String(link.slug) !== String(slug)) {
      return NextResponse.json({ error: "token_slug_mismatch" }, { status: 409 });
    }

    const minNoticeHours = Number(link.min_notice_hours ?? 0);
    const maxNoticeDays = Number(link.max_notice_days ?? 365);
    const nowMs = Date.now();
    const minBookableMs = nowMs + minNoticeHours * 60 * 60 * 1000;
    const maxBookableMs = nowMs + maxNoticeDays * 24 * 60 * 60 * 1000;

    const [yy, mm, dd] = date.split("-").map((x) => Number(x));
    if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

    const reqDayStartUtcMs = makeUtcFromLocal(tz, yy, mm, dd, 0, 0, 0).getTime();

    const minDay = new Date(minBookableMs);
    const minDayStartUtcMs = makeUtcFromLocal(
      tz,
      minDay.getUTCFullYear(),
      minDay.getUTCMonth() + 1,
      minDay.getUTCDate(),
      0,
      0,
      0
    ).getTime();

    if (reqDayStartUtcMs < minDayStartUtcMs) return NextResponse.json({ slots: [] });
    if (reqDayStartUtcMs > maxBookableMs) return NextResponse.json({ slots: [] });

    const bookingType = String(link.booking_type || "one_on_one");

    /* Determine hosts */
    let hostIds: string[] = [];

    if (bookingType === "group" || bookingType === "round_robin") {
      const { data: hostsRows, error: hostsErr } = await supabaseAdmin
        .from("booking_link_hosts")
        .select("user_id")
        .eq("booking_link_id", link.id);

      if (hostsErr) {
        console.error("[availability] booking_link_hosts query error", hostsErr);
        return NextResponse.json({ error: "hosts_query_failed" }, { status: 500 });
      }

      hostIds = Array.from(new Set((hostsRows ?? []).map((r: any) => String(r.user_id)).filter(Boolean)));

      if (bookingType === "group" && link.owner_user_id) {
        const owner = String(link.owner_user_id);
        if (!hostIds.includes(owner)) hostIds.unshift(owner);
      }

      if (!hostIds.length && link.owner_user_id) hostIds = [String(link.owner_user_id)];
    } else {
      if (link.owner_user_id) hostIds = [String(link.owner_user_id)];
    }

    if (!hostIds.length) return NextResponse.json({ error: "no_hosts_configured" }, { status: 400 });

    /* Compute availability window from booking_links */
    const availabilityMode =
      (String(link.availability_mode || "business_hours") as AvailabilityMode) || "business_hours";

    const window = computeWorkWindowUtc({
      tz,
      yy,
      mm,
      dd,
      availabilityMode,
      workStartMinuteRaw: (link as any).work_start_minute,
      workEndMinuteRaw: (link as any).work_end_minute,
      workDaysRaw: (link as any).work_days,
    });

    if (!window) return NextResponse.json({ slots: [] });

    const { workStartUtc, workEndUtc } = window;
    if (workEndUtc.getTime() <= workStartUtc.getTime()) return NextResponse.json({ slots: [] });

    /* Pull tokens */
    const durationMin = Number(link.duration_minutes ?? 30);
    const bufferBefore = Number(link.buffer_before_minutes ?? 0);
    const bufferAfter = Number(link.buffer_after_minutes ?? 0);
    const slotStepMin = 15;

    const { data: tokenRows, error: tokErr } = await supabaseAdmin
      .from("user_google_calendar_tokens")
      .select("user_id, access_token, refresh_token, expiry_date")
      .in("user_id", hostIds);

    if (tokErr) {
      console.error("[availability] token query error", tokErr);
      return NextResponse.json({ error: "token_query_failed" }, { status: 500 });
    }

    const byUser = new Map<string, any>();
    for (const row of tokenRows ?? []) byUser.set(String((row as any).user_id), row);

    // if refresh_token missing, it's not connected (or needs reconnect)
    const missing = hostIds.filter((uid) => !byUser.get(uid)?.refresh_token);
    if (missing.length) {
      return NextResponse.json({ error: "host_calendar_not_connected", missingHostIds: missing }, { status: 400 });
    }

    async function getAccessTokenForUser(userId: string): Promise<string> {
      const row = byUser.get(userId);
      let accessToken = (row?.access_token as string | null) ?? null;
      const expiry = row?.expiry_date ? new Date(row.expiry_date).getTime() : 0;
      const isExpired = !accessToken || !expiry || Date.now() > expiry - 60_000;

      if (!isExpired) return accessToken!;

      const refreshed = await refreshAccessToken(String(row.refresh_token));
      accessToken = refreshed.access_token;

      const newExpiryDate = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      await supabaseAdmin
        .from("user_google_calendar_tokens")
        .update({
          access_token: accessToken,
          expiry_date: newExpiryDate,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      byUser.set(userId, { ...(row ?? {}), access_token: accessToken, expiry_date: newExpiryDate });

      return accessToken!;
    }

    async function callFreeBusy(accessToken: string) {
      return fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: workStartUtc.toISOString(),
          timeMax: workEndUtc.toISOString(),
          timeZone: tz,
          items: [{ id: "primary" }],
        }),
      });
    }

    async function fetchBusyRanges(userId: string): Promise<Array<[number, number]>> {
      const row = byUser.get(userId);
      if (!row?.refresh_token) {
        throw new GoogleReconnectRequiredError("google_reconnect_required", {
          userId,
          detail: "missing_refresh_token",
        });
      }

      let accessToken = await getAccessTokenForUser(userId);
      let fbRes = await callFreeBusy(accessToken);

      if (fbRes.status === 401 || fbRes.status === 403) {
        const refreshed = await refreshAccessToken(String(row.refresh_token));
        accessToken = refreshed.access_token;

        const newExpiryDate = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        await supabaseAdmin
          .from("user_google_calendar_tokens")
          .update({
            access_token: accessToken,
            expiry_date: newExpiryDate,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        byUser.set(userId, { ...(row ?? {}), access_token: accessToken, expiry_date: newExpiryDate });

        fbRes = await callFreeBusy(accessToken);
      }

      const fbJson: any = await fbRes.json().catch(() => ({}));
      if (!fbRes.ok) {
        console.error("[availability] freeBusy failed for user", userId, fbJson);

        if (fbRes.status === 401 || fbRes.status === 403) {
          const msg = String(fbJson?.error?.message || fbRes.status);
          throw new GoogleReconnectRequiredError("google_reconnect_required", {
            userId,
            detail: `freebusy_${fbRes.status}:${msg}`.slice(0, 400),
          });
        }

        throw new Error(`google_freebusy_failed:${fbRes.status}`);
      }

      const busy: Array<{ start: string; end: string }> = fbJson?.calendars?.primary?.busy ?? [];
      return busy
        .map((b) => [Date.parse(b.start), Date.parse(b.end)] as [number, number])
        .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e));
    }

    let busyPerHost: Array<Array<[number, number]>> = [];
    try {
      busyPerHost = await Promise.all(hostIds.map((uid) => fetchBusyRanges(uid)));
    } catch (e: any) {
      if (e?.name === "GoogleReconnectRequiredError" || e?.message === "google_reconnect_required") {
        return NextResponse.json(
          {
            error: "host_calendar_reconnect_required",
            hostId: e?.userId ?? null,
            ...(isDev ? { detail: e?.detail ?? null } : {}),
          },
          { status: 400 }
        );
      }
      throw e;
    }

    const slots: Slot[] = [];

    for (
      let t = workStartUtc.getTime();
      t + durationMin * 60_000 <= workEndUtc.getTime();
      t += slotStepMin * 60_000
    ) {
      const start = t;
      const end = t + durationMin * 60_000;

      if (start < minBookableMs) continue;
      if (start > maxBookableMs) continue;

      const blockedStart = start - bufferBefore * 60_000;
      const blockedEnd = end + bufferAfter * 60_000;

      if (bookingType === "group") {
        const conflictsAnyHost = busyPerHost.some((ranges) =>
          ranges.some(([bs, be]) => overlap(blockedStart, blockedEnd, bs, be))
        );
        if (!conflictsAnyHost) {
          slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
        }
      } else if (bookingType === "round_robin") {
        const anyHostFree = busyPerHost.some((ranges) => {
          const conflict = ranges.some(([bs, be]) => overlap(blockedStart, blockedEnd, bs, be));
          return !conflict;
        });
        if (anyHostFree) {
          slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
        }
      } else {
        const ranges = busyPerHost[0] ?? [];
        const conflict = ranges.some(([bs, be]) => overlap(blockedStart, blockedEnd, bs, be));
        if (!conflict) {
          slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
        }
      }
    }

    return NextResponse.json({
      slots,
      hostIds,
      primary_color: link.primary_color ?? null,
      booking_type: bookingType,

      availability_mode: availabilityMode,
      work_start_minute: (link as any).work_start_minute ?? null,
      work_end_minute: (link as any).work_end_minute ?? null,
      work_days: (link as any).work_days ?? null,
    });
  } catch (err: any) {
    console.error("[availability] unexpected error", err);
    return NextResponse.json({ error: "availability_internal_error" }, { status: 500 });
  }
}
