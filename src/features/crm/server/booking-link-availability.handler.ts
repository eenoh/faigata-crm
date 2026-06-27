import { NextRequest, NextResponse } from "next/server";
import {
  buildAvailabilitySlots,
  computeWorkWindowUtc,
  isValidTimeZone,
  isValidYmd,
  makeUtcFromLocal,
  resolvePublicBookingSlug,
  type AvailabilityMode,
  type BusyRange,
} from "@/features/crm/server/booking-availability";
import {
  fetchGoogleFreeBusy,
  getGoogleAccessTokensForUsers,
  isGoogleReconnectRequiredError,
} from "@/features/crm/server/google-calendar";
import {
  getBookingInviteByToken,
  getBookingInviteState,
  getBookingLinkHostIds,
  getInviteLinkMismatchError,
  getPublicBookingLink,
  normalizePublicBookingType,
} from "@/features/crm/server/booking-public";
import { logBookingPageViewedOnce } from "@/features/crm/server/booking-scoring";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { serverEnv } from "@/lib/env/server";

type RouteContext = {
  params: Promise<{ slug?: string | string[] }>;
};

type BookingInviteLookupRow = {
  id: string | null;
  booking_link_id: string | null;
  lead_id: string | null;
  team_id: string | null;
  used_at: string | null;
  expires_at: string | null;
};

type PublicBookingLinkRow = {
  id: string;
  slug: string | null;
  owner_user_id: string | null;
  team_id: string | null;
  booking_type: string | null;
  duration_minutes: number | null;
  buffer_before_minutes: number | null;
  buffer_after_minutes: number | null;
  min_notice_hours: number | null;
  max_notice_days: number | null;
  primary_color: string | null;
  availability_mode: string | null;
  work_start_minute: number | null;
  work_end_minute: number | null;
  work_days: number[] | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function normalizeAvailabilityMode(raw: unknown): AvailabilityMode {
  return String(raw ?? "").trim() === "twenty_four_seven"
    ? "twenty_four_seven"
    : "business_hours";
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const isDev = !serverEnv.isProduction();

  try {
    const url = new URL(req.url);
    const params = await ctx.params;
    const slug = resolvePublicBookingSlug(url, params?.slug);
    const dateRaw = String(url.searchParams.get("date") ?? "").trim();
    const timeZoneRaw = String(url.searchParams.get("tz") ?? "UTC").trim();
    const token = String(url.searchParams.get("t") ?? "").trim() || null;

    if (!slug) {
      return json({ error: "missing_slug" }, 400);
    }

    if (!dateRaw) {
      return json({ error: "missing_date" }, 400);
    }

    if (!isValidYmd(dateRaw)) {
      return json({ error: "invalid_date" }, 400);
    }

    const timeZone = isValidTimeZone(timeZoneRaw) ? timeZoneRaw : "UTC";
    const [year, month, day] = dateRaw.split("-").map((value) => Number(value));

    if (!year || !month || !day) {
      return json({ error: "invalid_date" }, 400);
    }

    const admin = getCrmAdminClient();

    let inviteId: string | null = null;
    let inviteLeadId: string | null = null;
    let inviteTeamId: string | null = null;
    let inviteLinkId: string | null = null;

    if (token) {
      const inviteResult = await getBookingInviteByToken(
        admin,
        token,
        "id, booking_link_id, lead_id, team_id, used_at, expires_at",
      );

      const inviteError = inviteResult.error;
      const invite = (inviteResult.data ??
        null) as BookingInviteLookupRow | null;

      if (inviteError) {
        console.error("[availability] invite query error", inviteError);
      } else if (invite?.booking_link_id) {
        const state = getBookingInviteState(invite);

        if (state === "used" || state === "expired") {
          return json({ slots: [] });
        }

        inviteId = invite.id ? String(invite.id) : null;
        inviteLeadId = invite.lead_id ? String(invite.lead_id) : null;
        inviteTeamId = invite.team_id ? String(invite.team_id) : null;
        inviteLinkId = invite.booking_link_id
          ? String(invite.booking_link_id)
          : null;
      }
    }

    const linkResult = await getPublicBookingLink({
      admin,
      slug,
      linkId: inviteLinkId,
      select:
        "id, slug, owner_user_id, team_id, booking_type, duration_minutes, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_notice_days, primary_color, availability_mode, work_start_minute, work_end_minute, work_days",
    });

    const linkError = linkResult.error;
    const link = (linkResult.data ?? null) as PublicBookingLinkRow | null;

    if (linkError) {
      console.error("[availability] booking link query error", linkError);
      return json({ error: "booking_link_query_failed" }, 500);
    }

    if (!link) {
      return json({ error: "booking_link_not_found" }, 404);
    }

    if (token && inviteLinkId && String(link.slug ?? "") !== slug) {
      return json({ error: "token_slug_mismatch" }, 409);
    }

    if (token && inviteLinkId) {
      const mismatchError = getInviteLinkMismatchError(
        {
          booking_link_id: inviteLinkId,
          team_id: inviteTeamId,
        },
        link,
      );

      if (mismatchError) {
        return json({ error: mismatchError }, 409);
      }
    }

    const minNoticeHours = Number(link.min_notice_hours ?? 0);
    const maxNoticeDays = Number(link.max_notice_days ?? 365);
    const nowMs = Date.now();
    const minBookableMs = nowMs + minNoticeHours * 60 * 60 * 1000;
    const maxBookableMs = nowMs + maxNoticeDays * 24 * 60 * 60 * 1000;

    const requestedDayStartUtcMs = makeUtcFromLocal(
      timeZone,
      year,
      month,
      day,
      0,
      0,
      0,
    ).getTime();

    const minDay = new Date(minBookableMs);
    const minDayStartUtcMs = makeUtcFromLocal(
      timeZone,
      minDay.getUTCFullYear(),
      minDay.getUTCMonth() + 1,
      minDay.getUTCDate(),
      0,
      0,
      0,
    ).getTime();

    if (requestedDayStartUtcMs < minDayStartUtcMs) {
      return json({ slots: [] });
    }

    if (requestedDayStartUtcMs > maxBookableMs) {
      return json({ slots: [] });
    }

    const bookingType = normalizePublicBookingType(link.booking_type);

    const { hostIds, error: hostsError } = await getBookingLinkHostIds({
      admin,
      bookingLinkId: String(link.id),
      bookingType,
      ownerUserId: link.owner_user_id,
      includeOwnerForGroup: bookingType === "group",
    });

    if (hostsError) {
      console.error(
        "[availability] booking_link_hosts query error",
        hostsError,
      );
      return json({ error: "hosts_query_failed" }, 500);
    }

    if (!hostIds.length) {
      return json({ error: "no_hosts_configured" }, 400);
    }

    const availabilityMode = normalizeAvailabilityMode(link.availability_mode);

    const workWindow = computeWorkWindowUtc({
      timeZone,
      year,
      month,
      day,
      availabilityMode,
      workStartMinuteRaw: link.work_start_minute,
      workEndMinuteRaw: link.work_end_minute,
      workDaysRaw: link.work_days,
    });

    if (!workWindow) {
      return json({ slots: [] });
    }

    const workStartMs = workWindow.workStartUtc.getTime();
    const workEndMs = workWindow.workEndUtc.getTime();

    if (workEndMs <= workStartMs) {
      return json({ slots: [] });
    }

    const durationMinutes = Number(link.duration_minutes ?? 30);
    const bufferBeforeMinutes = Number(link.buffer_before_minutes ?? 0);
    const bufferAfterMinutes = Number(link.buffer_after_minutes ?? 0);

    let accessTokens: Map<string, string | null>;
    let missingUserIds: string[];

    try {
      ({ accessTokens, missingUserIds } = await getGoogleAccessTokensForUsers(
        admin,
        hostIds,
      ));
    } catch (error: any) {
      if (isGoogleReconnectRequiredError(error)) {
        return json(
          {
            error: "host_calendar_reconnect_required",
            hostId: error?.userId ?? null,
            ...(isDev ? { detail: error?.detail ?? null } : {}),
          },
          400,
        );
      }

      throw error;
    }

    if (missingUserIds.length) {
      return json(
        {
          error: "host_calendar_not_connected",
          missingHostIds: missingUserIds,
        },
        400,
      );
    }

    let busyPerHost: BusyRange[][] = [];

    try {
      busyPerHost = await Promise.all(
        hostIds.map(async (hostId) => {
          const accessToken = accessTokens.get(hostId);

          if (!accessToken) {
            return [];
          }

          const busyRanges = await fetchGoogleFreeBusy({
            accessToken,
            timezone: timeZone,
            timeMinISO: workWindow.workStartUtc.toISOString(),
            timeMaxISO: workWindow.workEndUtc.toISOString(),
            reconnectMessage: "google_reconnect_required",
            reconnectUserId: hostId,
            reconnectDetail: `freebusy:${hostId}`,
          });

          return busyRanges
            .map(
              (range) =>
                [Date.parse(range.start), Date.parse(range.end)] as BusyRange,
            )
            .filter(
              ([start, end]) => Number.isFinite(start) && Number.isFinite(end),
            );
        }),
      );
    } catch (error: any) {
      if (isGoogleReconnectRequiredError(error)) {
        return json(
          {
            error: "host_calendar_reconnect_required",
            hostId: error?.userId ?? null,
            ...(isDev ? { detail: error?.detail ?? null } : {}),
          },
          400,
        );
      }

      throw error;
    }

    const slots = buildAvailabilitySlots({
      bookingType,
      busyPerHost,
      workStartMs,
      workEndMs,
      minBookableMs,
      maxBookableMs,
      durationMinutes,
      bufferBeforeMinutes,
      bufferAfterMinutes,
    });

    if (token && inviteId && inviteLeadId && inviteTeamId && link.id) {
      await logBookingPageViewedOnce({
        admin,
        teamId: inviteTeamId,
        leadId: inviteLeadId,
        inviteId,
        bookingLinkId: String(link.id),
        bookingLinkSlug: String(link.slug ?? slug),
        viewedDate: dateRaw,
        viewedTimeZone: timeZone,
      });
    }

    return json({
      slots,
      hostIds,
      primary_color: link.primary_color ?? null,
      booking_type: bookingType,
      availability_mode: availabilityMode,
      work_start_minute: link.work_start_minute ?? null,
      work_end_minute: link.work_end_minute ?? null,
      work_days: link.work_days ?? null,
      tz: timeZone,
      date: dateRaw,
    });
  } catch (error: any) {
    console.error("[availability] unexpected error", error);
    return json({ error: "availability_internal_error" }, 500);
  }
}
