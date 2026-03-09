// src/app/api/crm/booking-links/[slug]/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

export const runtime = "nodejs";

type Slot = { start: string; end: string };
type AvailabilityMode = "business_hours" | "twenty_four_seven";
type BookingType = "one_on_one" | "group" | "round_robin";

type RouteContext = {
  params: Promise<{ slug?: string }>;
};

const SLOT_STEP_MIN = 15;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function json(body: any, status = 200) {
  return NextResponse.json(body, { status });
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function isValidYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveSlug(url: URL, slugFromParams?: string) {
  if (slugFromParams) return String(slugFromParams).trim() || undefined;

  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("booking-links");
  const guess = idx >= 0 ? parts[idx + 1] : undefined;
  return guess ? String(guess).trim() : undefined;
}

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
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  const ss = Number(get("second"));

  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return (asUtc - utcDate.getTime()) / 60000;
}

function makeUtcFromLocal(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hh: number,
  mm = 0,
  ss = 0,
) {
  const guessUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const offset = tzOffsetMinutes(timeZone, guessUtc);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss) - offset * 60_000);
}

/* -------------------- availability helpers -------------------- */

function clampMinute(v: number) {
  return Math.max(0, Math.min(24 * 60, Math.floor(v)));
}

function parseWorkDays(raw: any): number[] {
  const cleaned = (Array.isArray(raw) ? raw : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x >= 0 && x <= 6);

  return Array.from(new Set(cleaned.length ? cleaned : [...ALL_DAYS]));
}

function dowForYmdInTz(
  timeZone: string,
  y: number,
  m: number,
  d: number,
): number {
  const noonUtc = makeUtcFromLocal(timeZone, y, m, d, 12, 0, 0);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noonUtc);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[wd] ?? 0;
}

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

  if (availabilityMode === "twenty_four_seven") {
    const workStartUtc = makeUtcFromLocal(tz, yy, mm, dd, 0, 0, 0);
    const workEndUtc = makeUtcFromLocal(tz, yy, mm, dd + 1, 0, 0, 0);
    return { workStartUtc, workEndUtc, workDays };
  }

  const startMin = Number.isFinite(Number(args.workStartMinuteRaw))
    ? clampMinute(Number(args.workStartMinuteRaw))
    : 0;

  const endMin = Number.isFinite(Number(args.workEndMinuteRaw))
    ? clampMinute(Number(args.workEndMinuteRaw))
    : 24 * 60;

  if (endMin <= startMin) return null;

  const sh = Math.floor(startMin / 60);
  const sm = startMin % 60;

  const endIsNextDay = endMin >= 24 * 60;
  const eh = endIsNextDay ? 0 : Math.floor(endMin / 60);
  const em = endIsNextDay ? 0 : endMin % 60;

  const workStartUtc = makeUtcFromLocal(tz, yy, mm, dd, sh, sm, 0);
  const workEndUtc = endIsNextDay
    ? makeUtcFromLocal(tz, yy, mm, dd + 1, 0, 0, 0)
    : makeUtcFromLocal(tz, yy, mm, dd, eh, em, 0);

  return { workStartUtc, workEndUtc, workDays };
}

/* -------------------- score helpers -------------------- */

async function logBookingPageViewedOnce(args: {
  teamId: string;
  leadId: string;
  inviteId: string;
  bookingLinkId: string;
  bookingLinkSlug: string;
  tokenPresent: boolean;
  date: string;
  tz: string;
}) {
  const {
    teamId,
    leadId,
    inviteId,
    bookingLinkId,
    bookingLinkSlug,
    tokenPresent,
    date,
    tz,
  } = args;

  if (!teamId || !leadId || !inviteId || !tokenPresent) return;

  try {
    const existingQuery = await supabaseAdmin
      .from("lead_score_events")
      .select("id")
      .eq("team_id", teamId)
      .eq("lead_id", leadId)
      .eq("event_type", "booking_page_viewed")
      .eq("source_table", "booking_link_invites")
      .eq("source_id", inviteId)
      .limit(1);

    if (existingQuery.error) {
      console.error(
        "[availability] failed checking booking_page_viewed event",
        existingQuery.error,
      );
      return;
    }

    const alreadyExists =
      Array.isArray(existingQuery.data) && existingQuery.data.length > 0;

    if (alreadyExists) return;

    const nowIso = new Date().toISOString();

    const insertRes = await supabaseAdmin.from("lead_score_events").insert({
      team_id: teamId,
      lead_id: leadId,
      event_type: "booking_page_viewed",
      reason: "Prospect viewed booking page",
      source_table: "booking_link_invites",
      source_id: inviteId,
      metadata: {
        booking_link_id: bookingLinkId,
        booking_link_slug: bookingLinkSlug,
        invite_id: inviteId,
        viewed_date: date,
        viewed_timezone: tz,
      },
      created_at: nowIso,
    });

    if (insertRes.error) {
      console.error(
        "[availability] failed inserting booking_page_viewed event",
        insertRes.error,
      );
      return;
    }

    try {
      await recomputeLeadScore(teamId, leadId);
    } catch (recomputeErr) {
      console.error(
        "[availability] recomputeLeadScore failed after booking_page_viewed",
        recomputeErr,
      );
    }
  } catch (err) {
    console.error("[availability] logBookingPageViewedOnce failed", err);
  }
}

/* -------------------- google helpers -------------------- */

class GoogleReconnectRequiredError extends Error {
  detail?: string;
  userId?: string;
  constructor(
    message = "google_reconnect_required",
    opts?: { detail?: string; userId?: string },
  ) {
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

function isReconnectStatus(status: number) {
  return status === 401 || status === 403;
}

function normalizeBookingType(raw: unknown): BookingType {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "group") return "group";
  if (s === "round_robin") return "round_robin";
  return "one_on_one";
}

/* -------------------- route -------------------- */

export async function GET(req: NextRequest, ctx: RouteContext) {
  const isDev = process.env.NODE_ENV !== "production";

  try {
    const url = new URL(req.url);
    const { slug: slugFromParams } = await ctx.params;

    const slug = resolveSlug(url, slugFromParams);
    const dateRaw = String(url.searchParams.get("date") ?? "").trim();
    const tzRaw = String(url.searchParams.get("tz") ?? "UTC").trim();
    const token = String(url.searchParams.get("t") ?? "").trim() || null;

    if (!slug) return json({ error: "missing_slug" }, 400);
    if (!dateRaw) return json({ error: "missing_date" }, 400);
    if (!isValidYmd(dateRaw)) return json({ error: "invalid_date" }, 400);

    const tz = isValidTimeZone(tzRaw) ? tzRaw : "UTC";

    const [yy, mm, dd] = dateRaw.split("-").map((x) => Number(x));
    if (!yy || !mm || !dd) return json({ error: "invalid_date" }, 400);

    const sb = supabaseAdmin;

    let linkIdFromToken: string | null = null;
    let inviteIdFromToken: string | null = null;
    let leadIdFromToken: string | null = null;
    let teamIdFromToken: string | null = null;

    if (token) {
      const { data: inv, error: invErr } = await sb
        .from("booking_link_invites")
        .select("id, booking_link_id, lead_id, team_id, used_at, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (invErr) {
        console.error("[availability] invite query error", invErr);
      } else if (inv?.booking_link_id) {
        if (inv.used_at) return json({ slots: [] });
        if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
          return json({ slots: [] });
        }

        linkIdFromToken = String(inv.booking_link_id);
        inviteIdFromToken = String(inv.id ?? "");
        leadIdFromToken = String(inv.lead_id ?? "");
        teamIdFromToken = String(inv.team_id ?? "");
      }
    }

    const baseSelect =
      "id, slug, owner_user_id, team_id, booking_type, duration_minutes, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_notice_days, primary_color, availability_mode, work_start_minute, work_end_minute, work_days";

    const linkQuery = sb.from("booking_links").select(baseSelect);
    const { data: link, error: linkErr } = linkIdFromToken
      ? await linkQuery.eq("id", linkIdFromToken).maybeSingle()
      : await linkQuery.eq("slug", slug).maybeSingle();

    if (linkErr) {
      console.error("[availability] booking link query error", linkErr);
      return json({ error: "booking_link_query_failed" }, 500);
    }
    if (!link) return json({ error: "booking_link_not_found" }, 404);

    if (token && linkIdFromToken && String(link.slug) !== String(slug)) {
      return json({ error: "token_slug_mismatch" }, 409);
    }

    const minNoticeHours = Number((link as any).min_notice_hours ?? 0);
    const maxNoticeDays = Number((link as any).max_notice_days ?? 365);

    const nowMs = Date.now();
    const minBookableMs = nowMs + minNoticeHours * 60 * 60 * 1000;
    const maxBookableMs = nowMs + maxNoticeDays * 24 * 60 * 60 * 1000;

    const reqDayStartUtcMs = makeUtcFromLocal(
      tz,
      yy,
      mm,
      dd,
      0,
      0,
      0,
    ).getTime();

    const minDay = new Date(minBookableMs);
    const minDayStartUtcMs = makeUtcFromLocal(
      tz,
      minDay.getUTCFullYear(),
      minDay.getUTCMonth() + 1,
      minDay.getUTCDate(),
      0,
      0,
      0,
    ).getTime();

    if (reqDayStartUtcMs < minDayStartUtcMs) return json({ slots: [] });
    if (reqDayStartUtcMs > maxBookableMs) return json({ slots: [] });

    const bookingType = normalizeBookingType((link as any).booking_type);

    let hostIds: string[] = [];

    if (bookingType === "group" || bookingType === "round_robin") {
      const { data: hostsRows, error: hostsErr } = await sb
        .from("booking_link_hosts")
        .select("user_id")
        .eq("booking_link_id", (link as any).id);

      if (hostsErr) {
        console.error(
          "[availability] booking_link_hosts query error",
          hostsErr,
        );
        return json({ error: "hosts_query_failed" }, 500);
      }

      hostIds = Array.from(
        new Set(
          (hostsRows ?? []).map((r: any) => String(r.user_id)).filter(Boolean),
        ),
      );

      if (bookingType === "group" && (link as any).owner_user_id) {
        const owner = String((link as any).owner_user_id);
        if (!hostIds.includes(owner)) hostIds.unshift(owner);
      }

      if (!hostIds.length && (link as any).owner_user_id) {
        hostIds = [String((link as any).owner_user_id)];
      }
    } else {
      if ((link as any).owner_user_id) {
        hostIds = [String((link as any).owner_user_id)];
      }
    }

    if (!hostIds.length) return json({ error: "no_hosts_configured" }, 400);

    const availabilityMode =
      (String(
        (link as any).availability_mode || "business_hours",
      ) as AvailabilityMode) || "business_hours";

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

    if (!window) return json({ slots: [] });

    const { workStartUtc, workEndUtc } = window;
    const workStartMs = workStartUtc.getTime();
    const workEndMs = workEndUtc.getTime();
    if (workEndMs <= workStartMs) return json({ slots: [] });

    const durationMin = Number((link as any).duration_minutes ?? 30);
    const bufferBefore = Number((link as any).buffer_before_minutes ?? 0);
    const bufferAfter = Number((link as any).buffer_after_minutes ?? 0);

    const { data: tokenRows, error: tokErr } = await sb
      .from("user_google_calendar_tokens")
      .select("user_id, access_token, refresh_token, expiry_date")
      .in("user_id", hostIds);

    if (tokErr) {
      console.error("[availability] token query error", tokErr);
      return json({ error: "token_query_failed" }, 500);
    }

    const byUser = new Map<string, any>();
    for (const row of tokenRows ?? []) {
      byUser.set(String((row as any).user_id), row);
    }

    const missing = hostIds.filter((uid) => !byUser.get(uid)?.refresh_token);
    if (missing.length) {
      return json(
        { error: "host_calendar_not_connected", missingHostIds: missing },
        400,
      );
    }

    async function saveToken(
      userId: string,
      accessToken: string,
      expiresInSec: number,
    ) {
      const newExpiryDate = new Date(
        Date.now() + expiresInSec * 1000,
      ).toISOString();

      const { error } = await sb
        .from("user_google_calendar_tokens")
        .update({
          access_token: accessToken,
          expiry_date: newExpiryDate,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (!error) {
        const row = byUser.get(userId);
        byUser.set(userId, {
          ...(row ?? {}),
          access_token: accessToken,
          expiry_date: newExpiryDate,
        });
      }
    }

    async function ensureAccessToken(userId: string): Promise<string> {
      const row = byUser.get(userId);
      const refreshToken = String(row?.refresh_token ?? "");
      if (!refreshToken) {
        throw new GoogleReconnectRequiredError("google_reconnect_required", {
          userId,
          detail: "missing_refresh_token",
        });
      }

      const accessToken = (row?.access_token as string | null) ?? null;
      const expiry = row?.expiry_date ? new Date(row.expiry_date).getTime() : 0;
      const needsRefresh =
        !accessToken || !expiry || Date.now() > expiry - 60_000;

      if (!needsRefresh && accessToken) return accessToken;

      const refreshed = await refreshAccessToken(refreshToken);
      await saveToken(userId, refreshed.access_token, refreshed.expires_in);
      return refreshed.access_token;
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

    async function fetchBusyRanges(
      userId: string,
    ): Promise<Array<[number, number]>> {
      const row = byUser.get(userId);
      const refreshToken = String(row?.refresh_token ?? "");

      let accessToken = await ensureAccessToken(userId);
      let fbRes = await callFreeBusy(accessToken);

      if (isReconnectStatus(fbRes.status)) {
        const refreshed = await refreshAccessToken(refreshToken);
        await saveToken(userId, refreshed.access_token, refreshed.expires_in);

        accessToken = refreshed.access_token;
        fbRes = await callFreeBusy(accessToken);
      }

      const fbJson: any = await fbRes.json().catch(() => ({}));
      if (!fbRes.ok) {
        console.error(
          "[availability] freeBusy failed for user",
          userId,
          fbJson,
        );

        if (isReconnectStatus(fbRes.status)) {
          const msg = String(fbJson?.error?.message || fbRes.status);
          throw new GoogleReconnectRequiredError("google_reconnect_required", {
            userId,
            detail: `freebusy_${fbRes.status}:${msg}`.slice(0, 400),
          });
        }

        throw new Error(`google_freebusy_failed:${fbRes.status}`);
      }

      const busy: Array<{ start: string; end: string }> =
        fbJson?.calendars?.primary?.busy ?? [];

      return busy
        .map(
          (b) => [Date.parse(b.start), Date.parse(b.end)] as [number, number],
        )
        .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e));
    }

    let busyPerHost: Array<Array<[number, number]>> = [];
    try {
      busyPerHost = await Promise.all(
        hostIds.map((uid) => fetchBusyRanges(uid)),
      );
    } catch (e: any) {
      if (
        e?.name === "GoogleReconnectRequiredError" ||
        e?.message === "google_reconnect_required"
      ) {
        return json(
          {
            error: "host_calendar_reconnect_required",
            hostId: e?.userId ?? null,
            ...(isDev ? { detail: e?.detail ?? null } : {}),
          },
          400,
        );
      }
      throw e;
    }

    const slots: Slot[] = [];

    const durationMs = durationMin * 60_000;
    const stepMs = SLOT_STEP_MIN * 60_000;
    const bufferBeforeMs = bufferBefore * 60_000;
    const bufferAfterMs = bufferAfter * 60_000;

    for (let t = workStartMs; t + durationMs <= workEndMs; t += stepMs) {
      const start = t;
      const end = t + durationMs;

      if (start < minBookableMs) continue;
      if (start > maxBookableMs) continue;

      const blockedStart = start - bufferBeforeMs;
      const blockedEnd = end + bufferAfterMs;

      if (bookingType === "group") {
        const conflictsAnyHost = busyPerHost.some((ranges) =>
          ranges.some(([bs, be]) => overlap(blockedStart, blockedEnd, bs, be)),
        );

        if (!conflictsAnyHost) {
          slots.push({
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
          });
        }
        continue;
      }

      if (bookingType === "round_robin") {
        const anyHostFree = busyPerHost.some((ranges) => {
          const conflict = ranges.some(([bs, be]) =>
            overlap(blockedStart, blockedEnd, bs, be),
          );
          return !conflict;
        });

        if (anyHostFree) {
          slots.push({
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
          });
        }
        continue;
      }

      const ranges = busyPerHost[0] ?? [];
      const conflict = ranges.some(([bs, be]) =>
        overlap(blockedStart, blockedEnd, bs, be),
      );

      if (!conflict) {
        slots.push({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        });
      }
    }

    // log page view once for invite-based pages
    if (
      token &&
      inviteIdFromToken &&
      leadIdFromToken &&
      teamIdFromToken &&
      (link as any).id
    ) {
      await logBookingPageViewedOnce({
        teamId: teamIdFromToken,
        leadId: leadIdFromToken,
        inviteId: inviteIdFromToken,
        bookingLinkId: String((link as any).id),
        bookingLinkSlug: String((link as any).slug ?? slug),
        tokenPresent: true,
        date: dateRaw,
        tz,
      });
    }

    return json({
      slots,
      hostIds,
      primary_color: (link as any).primary_color ?? null,
      booking_type: bookingType,

      availability_mode: availabilityMode,
      work_start_minute: (link as any).work_start_minute ?? null,
      work_end_minute: (link as any).work_end_minute ?? null,
      work_days: (link as any).work_days ?? null,
      tz,
      date: dateRaw,
    });
  } catch (err: any) {
    console.error("[availability] unexpected error", err);
    return json({ error: "availability_internal_error" }, 500);
  }
}
