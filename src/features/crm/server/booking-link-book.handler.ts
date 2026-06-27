import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import {
  fetchGoogleFreeBusy,
  createGoogleCalendarEvent,
  getGoogleAccessTokenForUser,
  isGoogleReconnectRequiredError,
  type GoogleCalendarEventSnapshot,
} from "@/features/crm/server/google-calendar";
import {
  getBookingInviteByToken,
  getBookingInviteState,
  getBookingLinkHostIds,
  getInviteLinkMismatchError,
  getPublicBookingLink,
  normalizePublicBookingType,
  resolveGroupParticipantIds,
} from "@/features/crm/server/booking-public";
import { pickFirstRouteParam } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { readJsonBody } from "@/lib/http/request";

type RouteContext = {
  params: Promise<{ slug?: string | string[] }>;
};

type BookBody = {
  token?: unknown;
  firstName?: unknown;
  email?: unknown;
  start?: unknown;
  end?: unknown;
  tz?: unknown;
  hostIds?: unknown;
};

type ProfileNameRow = {
  first_name: string | null;
  last_name: string | null;
};

type BookingInviteRow = {
  id: string;
  team_id: string;
  booking_link_id: string;
  lead_id: string;
  used_at: string | null;
  expires_at: string | null;
};

type PublicBookingLinkRow = {
  id: string;
  team_id: string | null;
  slug: string | null;
  name: string | null;
  owner_user_id: string | null;
  booking_type: string | null;
  buffer_before_minutes: number | null;
  buffer_after_minutes: number | null;
};

type BookingInsertRow = {
  team_id: string;
  booking_link_id: string;
  owner_user_id: string | null;
  invitee_first_name: string;
  invitee_email: string;
  start_at: string;
  end_at: string;
  timezone: string;
  event_id: string | null;
  lead_id: string;
  created_at: string;
};

type BookingSelectRow = {
  id: string;
  team_id: string;
  lead_id: string;
  owner_user_id: string | null;
};

const nowIso = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

async function getHostDisplayName(
  admin: ReturnType<typeof getCrmAdminClient>,
  userId: string,
) {
  const { data, error } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[crm-book] getHostDisplayName error:", error);
    return null;
  }

  const profile = (data ?? null) as ProfileNameRow | null;
  const fullName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  return fullName || null;
}

function buildCallBookedFallbackBody(args: {
  startAtIso: string;
  endAtIso: string;
  timeZone: string;
  meetingLink: string | null;
  calendarEventLink: string | null;
}) {
  const when = `${args.startAtIso} -> ${args.endAtIso} (${args.timeZone})`;

  if (args.meetingLink) {
    return `BOOKED_CALL|${args.startAtIso}|${args.endAtIso}|${args.timeZone}\nJoin meeting: ${args.meetingLink}`;
  }

  if (args.calendarEventLink) {
    return `BOOKED_CALL|${args.startAtIso}|${args.endAtIso}|${args.timeZone}\nCalendar event: ${args.calendarEventLink}`;
  }

  return `BOOKED_CALL|${args.startAtIso}|${args.endAtIso}|${args.timeZone}\nCall booked for ${when}.`;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const slug = pickFirstRouteParam(params?.slug);

    if (!slug) {
      return json({ error: "missing_slug" }, 400);
    }

    const body = await readJsonBody<BookBody>(req, {});
    const token = String(body.token ?? "").trim();
    const firstName = String(body.firstName ?? "").trim();
    const email = String(body.email ?? "").trim();
    const startIso = String(body.start ?? "").trim();
    const endIso = String(body.end ?? "").trim();
    const timeZone = String(body.tz ?? "").trim() || "UTC";
    const requestedHostIds = Array.isArray(body.hostIds)
      ? Array.from(
          new Set(body.hostIds.map((value) => String(value)).filter(Boolean)),
        )
      : [];

    if (!token) {
      return json({ error: "missing_token" }, 400);
    }
    if (!firstName) {
      return json({ error: "missing_firstName" }, 400);
    }
    if (!email) {
      return json({ error: "missing_email" }, 400);
    }
    if (!startIso) {
      return json({ error: "missing_start" }, 400);
    }
    if (!endIso) {
      return json({ error: "missing_end" }, 400);
    }

    const startAt = new Date(startIso);
    const endAt = new Date(endIso);

    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return json({ error: "invalid_start_or_end" }, 400);
    }
    if (endAt.getTime() <= startAt.getTime()) {
      return json({ error: "end_before_start" }, 400);
    }

    const admin = getCrmAdminClient();

    const inviteResult = await getBookingInviteByToken(
      admin,
      token,
      "id, team_id, booking_link_id, lead_id, used_at, expires_at",
    );

    if (inviteResult.error) {
      console.error("[crm-book] invite query error:", inviteResult.error);
      return json({ error: "invite_query_failed" }, 500);
    }

    const invite = (inviteResult.data ?? null) as BookingInviteRow | null;

    if (!invite) {
      return json({ error: "invite_not_found" }, 404);
    }

    const inviteState = getBookingInviteState(invite);
    if (inviteState === "used") {
      return json({ error: "invite_already_used" }, 409);
    }
    if (inviteState === "expired") {
      return json({ error: "invite_expired" }, 410);
    }

    const linkResult = await getPublicBookingLink({
      admin,
      slug,
      linkId: String(invite.booking_link_id ?? "").trim() || null,
      select:
        "id, team_id, slug, name, owner_user_id, booking_type, buffer_before_minutes, buffer_after_minutes",
    });

    if (linkResult.error) {
      console.error("[crm-book] booking link query error:", linkResult.error);
      return json({ error: "booking_link_query_failed" }, 500);
    }

    const link = (linkResult.data ?? null) as PublicBookingLinkRow | null;

    if (!link) {
      return json({ error: "booking_link_not_found" }, 404);
    }

    const mismatchError = getInviteLinkMismatchError(invite, link);
    if (mismatchError) {
      return json({ error: mismatchError }, 409);
    }

    if (String(link.slug ?? "") !== slug) {
      return json({ error: "token_slug_mismatch" }, 409);
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
      console.error("[crm-book] booking_link_hosts error:", hostsError);
      return json({ error: "hosts_query_failed" }, 500);
    }

    if (!hostIds.length) {
      return json({ error: "no_hosts_configured" }, 400);
    }

    const groupParticipantIds =
      bookingType === "group"
        ? resolveGroupParticipantIds({
            hostIds,
            ownerUserId: link.owner_user_id,
            requestedHostIds,
          })
        : [];

    if (bookingType === "group" && !groupParticipantIds.length) {
      return json({ error: "no_hosts_configured" }, 400);
    }

    const baseTitle =
      String(link.name || "Scheduled Call").trim() || "Scheduled Call";
    const description = `Invitee: ${firstName} (${email})`;

    const bufferBeforeMinutes = Number(link.buffer_before_minutes ?? 0);
    const bufferAfterMinutes = Number(link.buffer_after_minutes ?? 0);
    const blockedStart = new Date(
      startAt.getTime() - bufferBeforeMinutes * 60_000,
    );
    const blockedEnd = new Date(endAt.getTime() + bufferAfterMinutes * 60_000);

    const createEventOnUserCalendar = async (
      userId: string,
      options: {
        invitee?: boolean;
        sendUpdates?: "all" | "none";
        summary: string;
        description: string;
      },
    ) => {
      const accessToken = await getGoogleAccessTokenForUser(admin, userId);

      if (!accessToken) {
        throw new Error("host_calendar_not_connected");
      }

      return createGoogleCalendarEvent({
        accessToken,
        summary: options.summary,
        description: options.description,
        startISO: startAt.toISOString(),
        endISO: endAt.toISOString(),
        timezone: timeZone,
        attendeeEmail: options.invitee ? email : undefined,
        sendUpdates: options.sendUpdates ?? "none",
        reconnectMessage: "host_calendar_reconnect_required",
        reconnectUserId: userId,
      });
    };

    const isHostFreeForWindow = async (userId: string) => {
      const accessToken = await getGoogleAccessTokenForUser(admin, userId);

      if (!accessToken) {
        return false;
      }

      const busyRanges = await fetchGoogleFreeBusy({
        accessToken,
        timezone: timeZone,
        timeMinISO: blockedStart.toISOString(),
        timeMaxISO: blockedEnd.toISOString(),
        reconnectMessage: "host_calendar_reconnect_required",
        reconnectUserId: userId,
      });

      return busyRanges.length === 0;
    };

    let organizerEventId: string | null = null;
    let organizerEventLink: string | null = null;
    let organizerMeetLink: string | null = null;
    let organizerGoogleEvent: GoogleCalendarEventSnapshot | null = null;
    let assignedHostId: string | null = null;

    const createForAssignedHost = async (hostId: string) => {
      assignedHostId = hostId;

      const hostName = (await getHostDisplayName(admin, hostId)) || "Host";
      const summary = `${hostName} - ${baseTitle}`;

      const created = await createEventOnUserCalendar(hostId, {
        invitee: true,
        sendUpdates: "all",
        summary,
        description,
      });

      organizerEventId = created.eventId;
      organizerEventLink = created.htmlLink;
      organizerMeetLink = created.meetLink || null;
      organizerGoogleEvent = created.googleEvent;

      return { summary };
    };

    try {
      if (bookingType === "one_on_one") {
        const ownerId = String(link.owner_user_id || "").trim();

        if (!ownerId) {
          return json({ error: "no_host_configured" }, 400);
        }

        await createForAssignedHost(ownerId);
      }

      if (bookingType === "group") {
        const organizerId = String(
          link.owner_user_id || groupParticipantIds[0] || "",
        ).trim();

        if (!organizerId) {
          return json({ error: "no_organizer_configured" }, 400);
        }

        const { summary } = await createForAssignedHost(organizerId);
        const otherParticipants = groupParticipantIds.filter(
          (hostId) => hostId !== organizerId,
        );

        const results = await Promise.allSettled(
          otherParticipants.map((userId) =>
            createEventOnUserCalendar(userId, {
              invitee: true,
              sendUpdates: "none",
              summary,
              description,
            }),
          ),
        );

        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              "[crm-book] group create on host failed:",
              otherParticipants[index],
              result.reason,
            );
          }
        });
      }

      if (bookingType === "round_robin") {
        const freeHosts: string[] = [];

        for (const hostId of hostIds) {
          try {
            if (await isHostFreeForWindow(hostId)) {
              freeHosts.push(hostId);
            }
          } catch (error) {
            console.error(
              "[crm-book] round_robin free check failed",
              hostId,
              error,
            );
          }
        }

        if (!freeHosts.length) {
          return json({ error: "no_available_closers_for_slot" }, 409);
        }

        const pickedHostId = freeHosts[randomInt(freeHosts.length)];
        await createForAssignedHost(pickedHostId);
      }
    } catch (error: any) {
      if (isGoogleReconnectRequiredError(error)) {
        return json({ error: "host_calendar_reconnect_required" }, 409);
      }

      if (String(error?.message ?? "") === "host_calendar_not_connected") {
        return json({ error: "host_calendar_not_connected" }, 409);
      }

      console.error("[crm-book] calendar event create failed:", error);
      return json({ error: "calendar_event_create_failed" }, 502);
    }

    const ownerForBooking =
      assignedHostId ||
      (link.owner_user_id ? String(link.owner_user_id) : null);

    const createdAt = nowIso();

    const bookingPayload: BookingInsertRow = {
      team_id: invite.team_id,
      booking_link_id: invite.booking_link_id,
      owner_user_id: ownerForBooking,
      invitee_first_name: firstName,
      invitee_email: email,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      timezone: timeZone,
      event_id: organizerEventId,
      lead_id: invite.lead_id,
      created_at: createdAt,
    };

    const { data: bookingData, error: bookingError } = await (admin as any)
      .from("bookings")
      .insert(bookingPayload)
      .select("id, team_id, lead_id, owner_user_id")
      .single();

    const booking = (bookingData ?? null) as BookingSelectRow | null;

    if (bookingError || !booking?.id) {
      console.error("[crm-book] booking insert error:", bookingError);
      return json({ error: "booking_create_failed" }, 500);
    }

    try {
      if (booking.owner_user_id) {
        await (admin as any).from("booking_outcomes").upsert(
          {
            booking_id: booking.id,
            team_id: booking.team_id,
            lead_id: booking.lead_id,
            closer_user_id: booking.owner_user_id,
            attended_status: "unknown",
            offer_made: false,
            closed_on_call: false,
            created_at: createdAt,
            updated_at: createdAt,
          },
          { onConflict: "booking_id" },
        );
      }
    } catch (error) {
      console.error(
        "[crm-book] booking_outcomes upsert failed (non-fatal):",
        error,
      );
    }

    await (admin as any)
      .from("booking_link_invites")
      .update({ used_at: nowIso() })
      .eq("id", invite.id);

    if (ownerForBooking) {
      const { error: leadUpdateError } = await (admin as any)
        .from("leads")
        .update({ closer_id: ownerForBooking, updated_at: nowIso() })
        .eq("id", invite.lead_id)
        .eq("team_id", invite.team_id);

      if (leadUpdateError) {
        console.error(
          "[crm-book] failed updating leads.closer_id",
          leadUpdateError,
        );
      }
    }

    const googleEventSnapshot =
      organizerGoogleEvent as GoogleCalendarEventSnapshot | null;

    const leadMessageEventData: Record<string, unknown> = {
      booking_id: booking.id,
      booking_link_id: invite.booking_link_id,
      team_id: invite.team_id,
      lead_id: invite.lead_id,
      host_user_id: ownerForBooking,
      booking_type: bookingType,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      timezone: timeZone,
      calendar_event_id: organizerEventId,
      calendar_event_link: organizerEventLink,
      google_calendar_event_link: organizerEventLink,
      meeting_link: organizerMeetLink,
      google_meet_link: googleEventSnapshot?.meetLink ?? organizerMeetLink,
      google_event: googleEventSnapshot,
      google_attendees: googleEventSnapshot?.attendees ?? [],
      google_organizer: googleEventSnapshot?.organizer ?? null,
      google_creator: googleEventSnapshot?.creator ?? null,
      invitee_first_name: firstName,
      invitee_email: email,
    };

    if (bookingType === "group") {
      leadMessageEventData.group_participants = groupParticipantIds;
    }

    const { error: leadMessageError } = await (admin as any)
      .from("lead_messages")
      .insert({
        team_id: invite.team_id,
        lead_id: invite.lead_id,
        direction: "outbound",
        channel: "pipeline",
        body: buildCallBookedFallbackBody({
          startAtIso: startAt.toISOString(),
          endAtIso: endAt.toISOString(),
          timeZone,
          meetingLink: organizerMeetLink,
          calendarEventLink: organizerEventLink,
        }),
        sender_profile_id: ownerForBooking,
        sent_at: nowIso(),
        created_at: nowIso(),
        event_type: "call_booked",
        event_data: leadMessageEventData,
      });

    if (leadMessageError) {
      console.error(
        "[crm-book] lead_messages insert error (non-fatal):",
        leadMessageError,
      );
    }

    try {
      const { error: scoreEventError } = await (admin as any)
        .from("lead_score_events")
        .insert({
          team_id: invite.team_id,
          lead_id: invite.lead_id,
          event_type: "call_booked",
          reason: "Prospect booked a call",
          source_table: "bookings",
          source_id: booking.id,
          metadata: {
            booking_id: booking.id,
            booking_link_id: invite.booking_link_id,
            booking_type: bookingType,
            host_user_id: ownerForBooking,
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString(),
            timezone: timeZone,
            invite_id: invite.id,
            calendar_event_id: organizerEventId,
            calendar_event_link: organizerEventLink,
            meeting_link: organizerMeetLink,
            ...(bookingType === "group"
              ? { group_participants: groupParticipantIds }
              : {}),
          },
          created_at: nowIso(),
        });

      if (scoreEventError) {
        console.error(
          "[crm-book] lead_score_events insert error (non-fatal):",
          scoreEventError,
        );
      } else {
        try {
          await recomputeLeadScore(
            String(invite.team_id),
            String(invite.lead_id),
          );
        } catch (error) {
          console.error(
            "[crm-book] recomputeLeadScore failed after call booking",
            error,
          );
        }
      }
    } catch (error) {
      console.error(
        "[crm-book] lead_score_events insert failed for call_booked (non-fatal):",
        error,
      );
    }

    return json({
      ok: true,
      bookingId: booking.id,
      calendar_event_id: organizerEventId,
      calendar_event_link: organizerEventLink,
      meeting_link: organizerMeetLink,
      assignedHostId: ownerForBooking,
      bookingType,
      groupParticipants:
        bookingType === "group" ? groupParticipantIds : undefined,
    });
  } catch (error: any) {
    console.error("[crm-book] unexpected:", error);
    return json({ error: String(error?.message ?? error) }, 500);
  }
}
