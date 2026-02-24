// src/app/api/crm/booking-links/[slug]/book/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

export const runtime = "nodejs";

// ✅ Next.js expects params to be a Promise in route handlers
type RouteContext = { params: Promise<{ slug: string }> };

const nowISO = () => new Date().toISOString();

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const json = (data: any, status = 200) => NextResponse.json(data, { status });

/** ---- Google helpers ---- */

function isGoogleReconnectError(e: any): boolean {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  return (
    msg.includes("invalid_grant") ||
    msg.includes("invalid credentials") ||
    msg.includes("login required") ||
    msg.includes("host_calendar_reconnect_required")
  );
}

async function fetchJSON(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}) as any);
  return { res, data };
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  if (!clientId || !clientSecret) throw new Error("missing_google_oauth_env");

  const { res, data } = await fetchJSON("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    if (String(data?.error || "").toLowerCase() === "invalid_grant") {
      throw new Error("host_calendar_reconnect_required");
    }
    throw new Error(
      data?.error_description || data?.error || "google_refresh_failed",
    );
  }

  const access_token = String(data.access_token || "");
  const expires_in = Number(data.expires_in || 0);
  if (!access_token || !expires_in)
    throw new Error("google_refresh_missing_fields");

  const expiry_date = new Date(Date.now() + expires_in * 1000).toISOString();
  return { access_token, expiry_date };
}

function googleAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function googleInvalidCreds(code: number, message: string) {
  const m = message.toLowerCase();
  return code === 401 || code === 403 || m.includes("invalid credentials");
}

async function createGoogleCalendarEvent(args: {
  accessToken: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendeeEmail?: string;
  sendUpdates?: "all" | "none" | "externalOnly";
}) {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("sendUpdates", args.sendUpdates ?? "none");
  url.searchParams.set("conferenceDataVersion", "1");

  const { res, data } = await fetchJSON(url.toString(), {
    method: "POST",
    headers: googleAuthHeaders(args.accessToken),
    body: JSON.stringify({
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startISO, timeZone: args.timezone },
      end: { dateTime: args.endISO, timeZone: args.timezone },
      attendees: args.attendeeEmail
        ? [{ email: args.attendeeEmail }]
        : undefined,
      conferenceData: {
        createRequest: {
          requestId: `faigata-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });

  if (!res.ok) {
    const code = Number(data?.error?.code ?? 0);
    const message = String(
      data?.error?.message || "google_calendar_create_failed",
    );
    if (googleInvalidCreds(code, message))
      throw new Error("host_calendar_reconnect_required");
    throw new Error(message);
  }

  const meetLink =
    String(data?.hangoutLink || "") ||
    String(
      data?.conferenceData?.entryPoints?.find(
        (e: any) => e?.entryPointType === "video",
      )?.uri || "",
    );

  return {
    eventId: String(data.id || ""),
    htmlLink: String(data.htmlLink || ""),
    meetLink,
  };
}

async function getAccessTokenForUser(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
) {
  const { data: tok, error } = await admin
    .from("user_google_calendar_tokens")
    .select("user_id, access_token, refresh_token, expiry_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!tok?.refresh_token) return null;

  const expiry = tok.expiry_date ? new Date(tok.expiry_date).getTime() : 0;
  let accessToken = String(tok.access_token || "");

  if (!accessToken || !expiry || expiry < Date.now() + 60_000) {
    const refreshed = await refreshGoogleAccessToken(String(tok.refresh_token));
    accessToken = refreshed.access_token;

    await admin
      .from("user_google_calendar_tokens")
      .update({
        access_token: refreshed.access_token,
        expiry_date: refreshed.expiry_date,
        updated_at: nowISO(),
      })
      .eq("user_id", userId);
  }

  return accessToken;
}

async function getHostDisplayName(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[crm-book] getHostDisplayName error:", error);
    return null;
  }
  const full = `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim();
  return full || null;
}

async function fetchFreeBusyForWindow(args: {
  accessToken: string;
  timezone: string;
  timeMinISO: string;
  timeMaxISO: string;
}) {
  const { res, data } = await fetchJSON(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: googleAuthHeaders(args.accessToken),
      body: JSON.stringify({
        timeMin: args.timeMinISO,
        timeMax: args.timeMaxISO,
        timeZone: args.timezone,
        items: [{ id: "primary" }],
      }),
    },
  );

  if (!res.ok) {
    const code = Number(data?.error?.convert ?? data?.error?.code ?? 0);
    const message = String(data?.error?.message ?? "google_freebusy_failed");
    if (googleInvalidCreds(code, message))
      throw new Error("host_calendar_reconnect_required");
    console.error("[crm-book] freeBusy failed", data);
    throw new Error("google_freebusy_failed");
  }

  return (data?.calendars?.primary?.busy ?? []) as Array<{
    start: string;
    end: string;
  }>;
}

/** ---- Route ---- */

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const { slug: slugParam } = await ctx.params;
    const slug = String(slugParam ?? "").trim();
    if (!slug) return json({ error: "missing_slug" }, 400);

    const body = await req.json().catch(() => ({}) as any);

    const token = String(body?.token ?? "").trim();
    const firstName = String(body?.firstName ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const startISO = String(body?.start ?? "").trim();
    const endISO = String(body?.end ?? "").trim();
    const timezone = String(body?.tz ?? "").trim() || "UTC";

    const requestedHostIds: string[] = Array.isArray(body?.hostIds)
      ? Array.from(
          new Set(body.hostIds.map((x: any) => String(x)).filter(Boolean)),
        )
      : [];

    if (!token) return json({ error: "missing_token" }, 400);
    if (!firstName) return json({ error: "missing_firstName" }, 400);
    if (!email) return json({ error: "missing_email" }, 400);
    if (!startISO) return json({ error: "missing_start" }, 400);
    if (!endISO) return json({ error: "missing_end" }, 400);

    const startDate = new Date(startISO);
    const endDate = new Date(endISO);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
      return json({ error: "invalid_start_or_end" }, 400);
    if (endDate.getTime() <= startDate.getTime())
      return json({ error: "end_before_start" }, 400);

    const admin = supabaseAdmin();

    const { data: link, error: linkErr } = await admin
      .from("booking_links")
      .select(
        "id, team_id, slug, name, owner_user_id, booking_type, buffer_before_minutes, buffer_after_minutes",
      )
      .eq("slug", slug)
      .maybeSingle();

    if (linkErr) {
      console.error("[crm-book] booking_links slug error:", linkErr);
      return json({ error: "booking_link_query_failed" }, 500);
    }
    if (!link) return json({ error: "booking_link_not_found" }, 404);

    const bookingType = String(link.booking_type || "one_on_one") as
      | "one_on_one"
      | "group"
      | "round_robin";

    const { data: invite, error: invErr } = await admin
      .from("booking_link_invites")
      .select("id, team_id, booking_link_id, lead_id, used_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (invErr) {
      console.error("[crm-book] invite query error:", invErr);
      return json({ error: "invite_query_failed" }, 500);
    }
    if (!invite) return json({ error: "invite_not_found" }, 404);
    if (invite.used_at) return json({ error: "invite_already_used" }, 409);
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now())
      return json({ error: "invite_expired" }, 410);
    if (String(invite.booking_link_id) !== String(link.id))
      return json({ error: "invite_link_mismatch" }, 409);
    if (String(invite.team_id) !== String(link.team_id))
      return json({ error: "invite_team_mismatch" }, 409);

    /** ---- Resolve hosts ---- */
    let hostPool: string[] = [];

    if (bookingType === "group" || bookingType === "round_robin") {
      const { data: hostRows, error: hostErr } = await admin
        .from("booking_link_hosts")
        .select("user_id")
        .eq("booking_link_id", link.id);
      if (hostErr) {
        console.error("[crm-book] booking_link_hosts error:", hostErr);
        return json({ error: "hosts_query_failed" }, 500);
      }
      hostPool = Array.from(
        new Set(
          (hostRows ?? []).map((r: any) => String(r.user_id)).filter(Boolean),
        ),
      );
      if (!hostPool.length && link.owner_user_id)
        hostPool = [String(link.owner_user_id)];
    } else {
      hostPool = link.owner_user_id ? [String(link.owner_user_id)] : [];
    }

    if (!hostPool.length) return json({ error: "no_hosts_configured" }, 400);

    let groupParticipantIds: string[] = [];
    if (bookingType === "group") {
      const ownerId = link.owner_user_id ? String(link.owner_user_id) : null;
      const allowed = new Set<string>(hostPool);
      if (ownerId) allowed.add(ownerId);

      const chosen =
        requestedHostIds.length > 0
          ? requestedHostIds.filter((id) => allowed.has(id))
          : hostPool.slice();

      groupParticipantIds = Array.from(new Set(chosen));
      if (ownerId && !groupParticipantIds.includes(ownerId))
        groupParticipantIds.unshift(ownerId);
      if (!groupParticipantIds.length)
        return json({ error: "no_hosts_configured" }, 400);
    }

    const baseTitle =
      String(link.name || "Scheduled Call").trim() || "Scheduled Call";
    const description = `Invitee: ${firstName} (${email})`;

    const bufferBefore = Number((link as any).buffer_before_minutes ?? 0);
    const bufferAfter = Number((link as any).buffer_after_minutes ?? 0);

    const blockedStart = new Date(startDate.getTime() - bufferBefore * 60_000);
    const blockedEnd = new Date(endDate.getTime() + bufferAfter * 60_000);

    const createEventOnUserCalendar = async (
      userId: string,
      opts: {
        invitee?: boolean;
        sendUpdates?: "all" | "none";
        summary: string;
        description: string;
      },
    ) => {
      const accessToken = await getAccessTokenForUser(admin, userId);
      if (!accessToken) throw new Error("host_calendar_not_connected");
      return createGoogleCalendarEvent({
        accessToken,
        summary: opts.summary,
        description: opts.description,
        startISO: startDate.toISOString(),
        endISO: endDate.toISOString(),
        timezone,
        attendeeEmail: opts.invitee ? email : undefined,
        sendUpdates: opts.sendUpdates ?? "none",
      });
    };

    const isHostFreeForWindow = async (userId: string) => {
      const accessToken = await getAccessTokenForUser(admin, userId);
      if (!accessToken) return false;
      const busy = await fetchFreeBusyForWindow({
        accessToken,
        timezone,
        timeMinISO: blockedStart.toISOString(),
        timeMaxISO: blockedEnd.toISOString(),
      });
      return (busy?.length ?? 0) === 0;
    };

    let organizerEventId: string | null = null;
    let organizerEventLink: string | null = null;
    let organizerMeetLink: string | null = null;
    let assignedHostId: string | null = null;

    const createForAssignedHost = async (hostId: string) => {
      assignedHostId = hostId;
      const hostName = (await getHostDisplayName(admin, hostId)) || "Host";
      const summary = `${hostName} – ${baseTitle}`;
      const created = await createEventOnUserCalendar(hostId, {
        invitee: true,
        sendUpdates: "all",
        summary,
        description,
      });
      organizerEventId = created.eventId;
      organizerEventLink = created.htmlLink;
      organizerMeetLink = created.meetLink || null;
      return { summary };
    };

    try {
      if (bookingType === "one_on_one") {
        const ownerId = String(link.owner_user_id || "").trim();
        if (!ownerId) return json({ error: "no_host_configured" }, 400);
        await createForAssignedHost(ownerId);
      }

      if (bookingType === "group") {
        const organizerId = String(
          link.owner_user_id || groupParticipantIds[0] || "",
        ).trim();
        if (!organizerId)
          return json({ error: "no_organizer_configured" }, 400);

        const { summary } = await createForAssignedHost(organizerId);

        const others = groupParticipantIds.filter((id) => id !== organizerId);
        const results = await Promise.allSettled(
          others.map((uid) =>
            createEventOnUserCalendar(uid, {
              invitee: true,
              sendUpdates: "none",
              summary,
              description,
            }),
          ),
        );
        results.forEach((r, i) => {
          if (r.status === "rejected")
            console.error(
              "[crm-book] group create on host failed:",
              others[i],
              r.reason,
            );
        });
      }

      if (bookingType === "round_robin") {
        const pool = hostPool.slice();
        const freeHosts: string[] = [];

        for (const uid of pool) {
          try {
            if (await isHostFreeForWindow(uid)) freeHosts.push(uid);
          } catch (e) {
            console.error("[crm-book] round_robin free check failed", uid, e);
          }
        }

        if (!freeHosts.length)
          return json({ error: "no_available_closers_for_slot" }, 409);

        const picked = freeHosts[randomInt(freeHosts.length)];
        await createForAssignedHost(picked);
      }
    } catch (e: any) {
      if (isGoogleReconnectError(e))
        return json({ error: "host_calendar_reconnect_required" }, 409);
      if (String(e?.message ?? "") === "host_calendar_not_connected")
        return json({ error: "host_calendar_not_connected" }, 409);

      console.error("[crm-book] calendar event create failed:", e);
      return json({ error: "calendar_event_create_failed" }, 502);
    }

    const ownerForBooking =
      assignedHostId ||
      (link.owner_user_id ? String(link.owner_user_id) : null);

    // Save booking
    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .insert({
        team_id: invite.team_id,
        booking_link_id: invite.booking_link_id,
        owner_user_id: ownerForBooking,
        invitee_first_name: firstName,
        invitee_email: email,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        timezone,
        event_id: organizerEventId,
        lead_id: invite.lead_id,
        created_at: nowISO(),
      })
      .select("id, team_id, lead_id, owner_user_id")
      .single();

    if (bookingErr || !booking?.id) {
      console.error("[crm-book] booking insert error:", bookingErr);
      return json({ error: "booking_create_failed" }, 500);
    }

    // create default outcome row (non-fatal)
    try {
      if (booking.owner_user_id) {
        await admin.from("booking_outcomes").upsert(
          {
            booking_id: booking.id,
            team_id: booking.team_id,
            lead_id: booking.lead_id,
            closer_user_id: booking.owner_user_id,
            attended_status: "unknown",
            offer_made: false,
            closed_on_call: false,
            created_at: nowISO(),
            updated_at: nowISO(),
          },
          { onConflict: "booking_id" },
        );
      }
    } catch (e) {
      console.error(
        "[crm-book] booking_outcomes upsert failed (non-fatal):",
        e,
      );
    }

    await admin
      .from("booking_link_invites")
      .update({ used_at: nowISO() })
      .eq("id", invite.id);

    // update lead.closer_id to the host/closer
    if (ownerForBooking) {
      const { error: leadUpdateErr } = await admin
        .from("leads")
        .update({ closer_id: ownerForBooking, updated_at: nowISO() })
        .eq("id", invite.lead_id)
        .eq("team_id", invite.team_id);

      if (leadUpdateErr)
        console.error(
          "[crm-book] failed updating leads.closer_id",
          leadUpdateErr,
        );
    }

    const when = `${startDate.toISOString()} → ${endDate.toISOString()} (${timezone})`;

    const event_type = "call_booked";
    const event_data: Record<string, any> = {
      booking_id: booking.id,
      booking_link_id: invite.booking_link_id,
      team_id: invite.team_id,
      lead_id: invite.lead_id,
      host_user_id: ownerForBooking,
      booking_type: bookingType,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      timezone,
      calendar_event_id: organizerEventId,
      calendar_event_link: organizerEventLink,
      meeting_link: organizerMeetLink,
    };
    if (bookingType === "group")
      event_data.group_participants = groupParticipantIds;

    await admin.from("lead_messages").insert({
      team_id: invite.team_id,
      lead_id: invite.lead_id,
      direction: "inbound",
      channel: "pipeline",
      body: organizerMeetLink
        ? `Call booked for ${when}. Meet link: ${organizerMeetLink}`
        : organizerEventLink
          ? `Call booked for ${when}. Calendar event: ${organizerEventLink}`
          : `Call booked for ${when}. (Calendar event link unavailable.)`,
      sender_profile_id: ownerForBooking,
      sent_at: nowISO(),
      created_at: nowISO(),
      event_type,
      event_data,
    });

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
  } catch (e: any) {
    console.error("[crm-book] unexpected:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
}
