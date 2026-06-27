// src/app/api/crm/calendar/freebusy/route.ts
import { NextResponse } from "next/server";
import {
  fetchGoogleJson,
  getGoogleAccessTokenForUser,
  googleAuthHeaders,
  isGoogleInvalidCredentials,
  isGoogleReconnectRequiredError,
  isGoogleReconnectStatus,
} from "@/features/crm/server/google-calendar";
import { getRequestUser } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

const ALLOWED = new Set(["closer", "manager", "admin"]);
const hasAccess = (roles: unknown) =>
  Array.isArray(roles) &&
  roles.some((r) => typeof r === "string" && ALLOWED.has(r.toLowerCase()));

const parseIso = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

type ApiEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string | null;
};

export async function GET(req: Request) {
  try {
    const admin = getSupabaseAdminClient();
    const auth = await getRequestUser(req);
    if (!auth.ok) return json({ error: "unauthorized" }, 401);

    const userId = auth.user.id;

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) {
      console.error("[calendar-freebusy] profile query error", profileErr);
      return json({ error: "profile_query_failed" }, 500);
    }
    if (!hasAccess(profile?.role)) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const tz = url.searchParams.get("tz") || "UTC";

    const from = parseIso(url.searchParams.get("from")) ?? new Date();
    const to =
      parseIso(url.searchParams.get("to")) ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (to.getTime() <= from.getTime()) {
      return json({ error: "invalid_range" }, 400);
    }

    let googleAccessToken: string | null = null;
    try {
      googleAccessToken = await getGoogleAccessTokenForUser(admin, userId);
    } catch (error: any) {
      if (isGoogleReconnectRequiredError(error)) {
        return json({ error: "host_calendar_reconnect_required" }, 409);
      }
      console.error("[calendar-freebusy] token fetch/refresh error", error);
      return json({ error: "token_fetch_failed" }, 500);
    }
    if (!googleAccessToken) {
      return json({ error: "host_calendar_not_connected" }, 409);
    }

    const { response: fbRes, data: fbJson } = await fetchGoogleJson(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: googleAuthHeaders(googleAccessToken),
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          timeZone: tz,
          items: [{ id: "primary" }],
        }),
      },
    );

    if (!fbRes.ok) {
      const errorCode = Number(fbJson?.error?.code ?? 0);
      const errorMessage = String(fbJson?.error?.message ?? "");

      if (
        isGoogleReconnectStatus(fbRes.status) ||
        isGoogleInvalidCredentials(errorCode, errorMessage)
      ) {
        return json({ error: "host_calendar_reconnect_required" }, 409);
      }

      console.error("[calendar-freebusy] google freeBusy failed", fbJson);
      return json({ error: "google_freebusy_failed" }, 502);
    }

    const eventsUrl = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    eventsUrl.searchParams.set("timeMin", from.toISOString());
    eventsUrl.searchParams.set("timeMax", to.toISOString());
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", "250");
    eventsUrl.searchParams.set("timeZone", tz);

    const { response: evRes, data: evJson } = await fetchGoogleJson(
      eventsUrl.toString(),
      {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      },
    );

    if (!evRes.ok) {
      const errorCode = Number(evJson?.error?.code ?? 0);
      const errorMessage = String(evJson?.error?.message ?? "");

      if (
        isGoogleReconnectStatus(evRes.status) ||
        isGoogleInvalidCredentials(errorCode, errorMessage)
      ) {
        return json({ error: "host_calendar_reconnect_required" }, 409);
      }

      console.error("[calendar-freebusy] google events.list failed", evJson);
      return json({ error: "google_events_failed" }, 502);
    }

    const items: any[] = Array.isArray(evJson?.items) ? evJson.items : [];

    const events: ApiEvent[] = items
      .filter((it) => it?.status !== "cancelled")
      .map((it) => {
        const startDT = it?.start?.dateTime ?? null;
        const endDT = it?.end?.dateTime ?? null;

        const startDate = it?.start?.date ?? null;
        const endDate = it?.end?.date ?? null;

        const allDay = Boolean(!startDT && startDate);

        const startISO = startDT
          ? new Date(startDT).toISOString()
          : startDate
            ? new Date(`${startDate}T00:00:00.000Z`).toISOString()
            : "";

        const endISO = endDT
          ? new Date(endDT).toISOString()
          : endDate
            ? new Date(`${endDate}T00:00:00.000Z`).toISOString()
            : "";

        return {
          id: String(it?.id ?? `${startISO}-${endISO}-${Math.random()}`),
          title: String(it?.summary ?? "Untitled"),
          start: startISO,
          end: endISO,
          allDay,
          location: it?.location ?? null,
        };
      })
      .filter((event) => event.start && event.end);

    return json({
      ok: true,
      tz,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      busy: fbJson?.calendars?.primary?.busy ?? [],
      events,
    });
  } catch (error: any) {
    console.error("[calendar-freebusy] unexpected error", error);
    return json({ error: String(error?.message ?? "internal_error") }, 500);
  }
}
