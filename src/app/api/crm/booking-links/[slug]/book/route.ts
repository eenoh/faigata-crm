// src/app/api/crm/booking-links/[slug]/book/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

export const runtime = "nodejs";

type Params = { params: { slug: string } | Promise<{ slug: string }> };

async function unwrapParams<T>(p: T | Promise<T>): Promise<T> {
  return p && typeof (p as any).then === "function" ? await (p as any) : (p as any);
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ---- Google helpers ---- */

function isGoogleReconnectError(e: any): boolean {
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  if (msg.includes("invalid_grant")) return true;
  if (msg.includes("invalid credentials")) return true;
  if (msg.includes("login required")) return true;
  if (msg.includes("host_calendar_reconnect_required")) return true;
  return false;
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  if (!clientId || !clientSecret) throw new Error("missing_google_oauth_env");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    if (String(json?.error || "").toLowerCase() === "invalid_grant") {
      throw new Error("host_calendar_reconnect_required");
    }
    throw new Error(json?.error_description || json?.error || "google_refresh_failed");
  }

  const access_token = String(json.access_token || "");
  const expires_in = Number(json.expires_in || 0);
  if (!access_token || !expires_in) throw new Error("google_refresh_missing_fields");

  const expiry_date = new Date(Date.now() + expires_in * 1000).toISOString();
  return { access_token, expiry_date };
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
  const sendUpdates = args.sendUpdates ?? "none";
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");

  url.searchParams.set("sendUpdates", sendUpdates);
  url.searchParams.set("conferenceDataVersion", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startISO, timeZone: args.timezone },
      end: { dateTime: args.endISO, timeZone: args.timezone },
      attendees: args.attendeeEmail ? [{ email: args.attendeeEmail }] : undefined,
      conferenceData: {
        createRequest: {
          requestId: `faigata-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });

  const json = await res.json().catch(() => ({} as any));

  if (!res.ok) {
    const code = Number(json?.error?.code ?? 0);
    const message = String(json?.error?.message || "google_calendar_create_failed");

    if (code === 401 || code === 403 || message.toLowerCase().includes("invalid credentials")) {
      throw new Error("host_calendar_reconnect_required");
    }

    throw new Error(message);
  }

  const meetLink =
    String(json?.hangoutLink || "") ||
    String(json?.conferenceData?.entryPoints?.find((e: any) => e?.entryPointType === "video")?.uri || "");

  return {
    eventId: String(json.id || ""),
    htmlLink: String(json.htmlLink || ""),
    meetLink,
  };
}

async function getAccessTokenForUser(admin: ReturnType<typeof supabaseAdmin>, userId: string) {
  const { data: tok, error: tokErr } = await admin
    .from("user_google_calendar_tokens")
    .select("user_id, access_token, refresh_token, expiry_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokErr) throw tokErr;
  if (!tok?.refresh_token) return null;

  let accessToken = String(tok.access_token || "");
  const expiry = tok.expiry_date ? new Date(tok.expiry_date).getTime() : 0;

  if (!accessToken || !expiry || expiry < Date.now() + 60_000) {
    const refreshed = await refreshGoogleAccessToken(String(tok.refresh_token));
    accessToken = refreshed.access_token;

    await admin
      .from("user_google_calendar_tokens")
      .update({
        access_token: refreshed.access_token,
        expiry_date: refreshed.expiry_date,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return accessToken;
}

/** resolve host name for subject */
async function getHostDisplayName(admin: ReturnType<typeof supabaseAdmin>, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();

  if (error) {
    console.error("[crm-book] getHostDisplayName error:", error);
    return null;
  }

  const full = `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim();
  return full || null;
}

async function fetchFreeBusyForWindow(args: { accessToken: string; timezone: string; timeMinISO: string; timeMaxISO: string }) {
  const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: args.timeMinISO,
      timeMax: args.timeMaxISO,
      timeZone: args.timezone,
      items: [{ id: "primary" }],
    }),
  });

  const fbJson: any = await fbRes.json().catch(() => ({} as any));
  if (!fbRes.ok) {
    const code = Number(fbJson?.error?.convert ?? fbJson?.error?.code ?? 0);
    const message = String(fbJson?.error?.message ?? "google_freebusy_failed");

    if (code === 401 || code === 403 || message.toLowerCase().includes("invalid credentials")) {
      throw new Error("host_calendar_reconnect_required");
    }

    console.error("[crm-book] freeBusy failed", fbJson);
    throw new Error("google_freebusy_failed");
  }

  const busy: Array<{ start: string; end: string }> = fbJson?.calendars?.primary?.busy ?? [];
  return busy;
}

/** ---- Route ---- */

export async function POST(req: Request, ctx: Params) {
  try {
    const p = await unwrapParams(ctx.params);
    const slug = String((p as any)?.slug ?? "").trim();
    if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const token = String(body?.token ?? "").trim();
    const firstName = String(body?.firstName ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const startISO = String(body?.start ?? "").trim();
    const endISO = String(body?.end ?? "").trim();
    const timezone = String(body?.tz ?? "").trim() || "UTC";

    const requestedHostIds: string[] = Array.isArray(body?.hostIds)
      ? Array.from(new Set(body.hostIds.map((x: any) => String(x)).filter(Boolean)))
      : [];

    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });
    if (!firstName) return NextResponse.json({ error: "missing_firstName" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });
    if (!startISO) return NextResponse.json({ error: "missing_start" }, { status: 400 });
    if (!endISO) return NextResponse.json({ error: "missing_end" }, { status: 400 });

    const startDate = new Date(startISO);
    const endDate = new Date(endISO);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "invalid_start_or_end" }, { status: 400 });
    }
    if (endDate.getTime() <= startDate.getTime()) {
      return NextResponse.json({ error: "end_before_start" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const { data: link, error: linkErr } = await admin
      .from("booking_links")
      .select("id, team_id, slug, name, owner_user_id, booking_type, buffer_before_minutes, buffer_after_minutes")
      .eq("slug", slug)
      .maybeSingle();

    if (linkErr) {
      console.error("[crm-book] booking_links slug error:", linkErr);
      return NextResponse.json({ error: "booking_link_query_failed" }, { status: 500 });
    }
    if (!link) return NextResponse.json({ error: "booking_link_not_found" }, { status: 404 });

    const bookingType = String(link.booking_type || "one_on_one") as "one_on_one" | "group" | "round_robin";

    const { data: invite, error: invErr } = await admin
      .from("booking_link_invites")
      .select("id, team_id, booking_link_id, lead_id, used_at, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (invErr) {
      console.error("[crm-book] invite query error:", invErr);
      return NextResponse.json({ error: "invite_query_failed" }, { status: 500 });
    }
    if (!invite) return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
    if (invite.used_at) return NextResponse.json({ error: "invite_already_used" }, { status: 409 });
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "invite_expired" }, { status: 410 });
    }
    if (String(invite.booking_link_id) !== String(link.id)) {
      return NextResponse.json({ error: "invite_link_mismatch" }, { status: 409 });
    }
    if (String(invite.team_id) !== String(link.team_id)) {
      return NextResponse.json({ error: "invite_team_mismatch" }, { status: 409 });
    }

    /** ---- Resolve hosts ---- */
    let hostPool: string[] = [];

    if (bookingType === "group" || bookingType === "round_robin") {
      const { data: hostRows, error: hostErr } = await admin.from("booking_link_hosts").select("user_id").eq("booking_link_id", link.id);

      if (hostErr) {
        console.error("[crm-book] booking_link_hosts error:", hostErr);
        return NextResponse.json({ error: "hosts_query_failed" }, { status: 500 });
      }

      hostPool = Array.from(new Set((hostRows ?? []).map((r: any) => String(r.user_id)).filter(Boolean)));
      if (!hostPool.length && link.owner_user_id) hostPool = [String(link.owner_user_id)];
    } else {
      hostPool = link.owner_user_id ? [String(link.owner_user_id)] : [];
    }

    if (!hostPool.length) return NextResponse.json({ error: "no_hosts_configured" }, { status: 400 });

    let groupParticipantIds: string[] = [];
    if (bookingType === "group") {
      const ownerId = link.owner_user_id ? String(link.owner_user_id) : null;

      const allowed = new Set<string>(hostPool);
      if (ownerId) allowed.add(ownerId);

      const requestedFiltered = requestedHostIds.length > 0 ? requestedHostIds.filter((id) => allowed.has(id)) : hostPool.slice();

      groupParticipantIds = Array.from(new Set(requestedFiltered));
      if (ownerId && !groupParticipantIds.includes(ownerId)) groupParticipantIds.unshift(ownerId);

      if (!groupParticipantIds.length) {
        return NextResponse.json({ error: "no_hosts_configured" }, { status: 400 });
      }
    }

    const baseTitleRaw = String(link.name || "Scheduled Call").trim();
    const baseTitle = baseTitleRaw.length ? baseTitleRaw : "Scheduled Call";

    const description = `Invitee: ${firstName} (${email})`;

    const bufferBefore = Number((link as any).buffer_before_minutes ?? 0);
    const bufferAfter = Number((link as any).buffer_after_minutes ?? 0);

    const blockedStart = new Date(startDate.getTime() - bufferBefore * 60_000);
    const blockedEnd = new Date(endDate.getTime() + bufferAfter * 60_000);

    async function createEventOnUserCalendar(
      userId: string,
      opts: { invitee?: boolean; sendUpdates?: "all" | "none"; summary: string; description: string }
    ) {
      const accessToken = await getAccessTokenForUser(admin, userId);
      if (!accessToken) throw new Error("host_calendar_not_connected");

      return await createGoogleCalendarEvent({
        accessToken,
        summary: opts.summary,
        description: opts.description,
        startISO: startDate.toISOString(),
        endISO: endDate.toISOString(),
        timezone,
        attendeeEmail: opts.invitee ? email : undefined,
        sendUpdates: opts.sendUpdates ?? "none",
      });
    }

    async function isHostFreeForWindow(userId: string): Promise<boolean> {
      const accessToken = await getAccessTokenForUser(admin, userId);
      if (!accessToken) return false;

      const busy = await fetchFreeBusyForWindow({
        accessToken,
        timezone,
        timeMinISO: blockedStart.toISOString(),
        timeMaxISO: blockedEnd.toISOString(),
      });

      return (busy?.length ?? 0) === 0;
    }

    let organizerEventId: string | null = null;
    let organizerEventLink: string | null = null;
    let organizerMeetLink: string | null = null;

    let assignedHostId: string | null = null;

    try {
      if (bookingType === "one_on_one") {
        const ownerId = String(link.owner_user_id || "").trim();
        if (!ownerId) return NextResponse.json({ error: "no_host_configured" }, { status: 400 });

        assignedHostId = ownerId;

        const hostName = (await getHostDisplayName(admin, ownerId)) || "Host";
        const summary = `${hostName} – ${baseTitle}`;

        const created = await createEventOnUserCalendar(ownerId, {
          invitee: true,
          sendUpdates: "all",
          summary,
          description,
        });

        organizerEventId = created.eventId;
        organizerEventLink = created.htmlLink;
        organizerMeetLink = created.meetLink || null;
      }

      if (bookingType === "group") {
        const organizerId = String(link.owner_user_id || groupParticipantIds[0] || "").trim();
        if (!organizerId) return NextResponse.json({ error: "no_organizer_configured" }, { status: 400 });

        assignedHostId = organizerId;

        const hostName = (await getHostDisplayName(admin, organizerId)) || "Host";
        const summary = `${hostName} – ${baseTitle}`;

        const created = await createEventOnUserCalendar(organizerId, {
          invitee: true,
          sendUpdates: "all",
          summary,
          description,
        });

        organizerEventId = created.eventId;
        organizerEventLink = created.htmlLink;
        organizerMeetLink = created.meetLink || null;

        const others = groupParticipantIds.filter((id) => id !== organizerId);

        const results = await Promise.allSettled(
          others.map(async (uid) => {
            await createEventOnUserCalendar(uid, { invitee: true, sendUpdates: "none", summary, description });
          })
        );

        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error("[crm-book] group create on host failed:", others[i], r.reason);
          }
        });
      }

      if (bookingType === "round_robin") {
        const pool = hostPool.slice();
        if (!pool.length) return NextResponse.json({ error: "no_hosts_configured" }, { status: 400 });

        const freeHosts: string[] = [];

        for (const uid of pool) {
          try {
            if (await isHostFreeForWindow(uid)) freeHosts.push(uid);
          } catch (e) {
            console.error("[crm-book] round_robin free check failed", uid, e);
          }
        }

        if (!freeHosts.length) {
          return NextResponse.json({ error: "no_available_closers_for_slot" }, { status: 409 });
        }

        assignedHostId = freeHosts[randomInt(freeHosts.length)];

        const hostName = (await getHostDisplayName(admin, assignedHostId)) || "Host";
        const summary = `${hostName} – ${baseTitle}`;

        const created = await createEventOnUserCalendar(assignedHostId, {
          invitee: true,
          sendUpdates: "all",
          summary,
          description,
        });

        organizerEventId = created.eventId;
        organizerEventLink = created.htmlLink;
        organizerMeetLink = created.meetLink || null;
      }
    } catch (e: any) {
      if (isGoogleReconnectError(e)) {
        return NextResponse.json({ error: "host_calendar_reconnect_required" }, { status: 409 });
      }
      if (String(e?.message ?? "") === "host_calendar_not_connected") {
        return NextResponse.json({ error: "host_calendar_not_connected" }, { status: 409 });
      }

      console.error("[crm-book] calendar event create failed:", e);
      return NextResponse.json({ error: "calendar_event_create_failed" }, { status: 502 });
    }

    const ownerForBooking = assignedHostId || (link.owner_user_id ? String(link.owner_user_id) : null);

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
        created_at: new Date().toISOString(),
      })
      .select("id, team_id, lead_id, owner_user_id")
      .single();

    if (bookingErr || !booking?.id) {
      console.error("[crm-book] booking insert error:", bookingErr);
      return NextResponse.json({ error: "booking_create_failed" }, { status: 500 });
    }

    // ✅ NEW: create default outcome row (non-fatal if table not present)
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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "booking_id" }
        );
      }
    } catch (e) {
      console.error("[crm-book] booking_outcomes upsert failed (non-fatal):", e);
    }

    await admin.from("booking_link_invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

    // ✅ IMPORTANT: update lead.closer_id to the host/closer for this meeting
    if (ownerForBooking) {
      const { error: leadUpdateErr } = await admin
        .from("leads")
        .update({
          closer_id: ownerForBooking,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invite.lead_id)
        .eq("team_id", invite.team_id);

      if (leadUpdateErr) {
        console.error("[crm-book] failed updating leads.closer_id", leadUpdateErr);
      }
    }

    const when = `${startDate.toISOString()} → ${endDate.toISOString()} (${timezone})`;

    // ✅ NEW: include event_type + event_data (keeps existing fields intact)
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

    if (bookingType === "group") {
      event_data.group_participants = groupParticipantIds;
    }

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
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),

      // ✅ added:
      event_type,
      event_data,
    });

    return NextResponse.json({
      ok: true,
      bookingId: booking.id,
      calendar_event_id: organizerEventId,
      calendar_event_link: organizerEventLink,
      meeting_link: organizerMeetLink,
      assignedHostId: ownerForBooking,
      bookingType,
      groupParticipants: bookingType === "group" ? groupParticipantIds : undefined,
    });
  } catch (e: any) {
    console.error("[crm-book] unexpected:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
