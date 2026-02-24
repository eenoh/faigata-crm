// src/app/api/crm/calendar/freebusy/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

const requireEnv = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
};

function supabaseAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

const ALLOWED = new Set(["closer", "manager", "admin"]);
const hasAccess = (roles: unknown) =>
  Array.isArray(roles) &&
  roles.some((r) => typeof r === "string" && ALLOWED.has(r.toLowerCase()));

const parseIso = (v: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const bearer = (req: Request) => {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
};

const isGoogleAuthError = (payload: any) => {
  const code = Number(payload?.error?.code ?? 0);
  const msg = String(payload?.error?.message ?? "").toLowerCase();
  return code === 401 || code === 403 || msg.includes("invalid credentials");
};

async function fetchJSON(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}) as any);
  return { res, data };
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const { res, data } = await fetchJSON("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    if (String(data?.error || "").toLowerCase() === "invalid_grant")
      throw new Error("host_calendar_reconnect_required");
    throw new Error(
      data?.error_description || data?.error || "google_refresh_failed",
    );
  }

  const access_token = String(data.access_token || "");
  const expires_in = Number(data.expires_in || 0);
  if (!access_token || !expires_in)
    throw new Error("google_refresh_missing_fields");

  return {
    access_token,
    expiry_date: new Date(Date.now() + expires_in * 1000).toISOString(),
  };
}

async function getGoogleAccessTokenForUser(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
) {
  const { data: tok, error } = await admin
    .from("user_google_calendar_tokens")
    .select("access_token, refresh_token, expiry_date")
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
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return accessToken;
}

type ApiEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location?: string | null;
};

const googleAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

export async function GET(req: Request) {
  try {
    const admin = supabaseAdmin();

    const token = bearer(req);
    if (!token) return json({ error: "unauthorized" }, 401);

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const userId = userRes?.user?.id ?? null;
    if (userErr || !userId) return json({ error: "unauthorized" }, 401);

    // role gating
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
    if (to.getTime() <= from.getTime())
      return json({ error: "invalid_range" }, 400);

    // Google token (refresh if needed)
    let googleAccessToken: string | null = null;
    try {
      googleAccessToken = await getGoogleAccessTokenForUser(admin, userId);
    } catch (e: any) {
      if (String(e?.message ?? "") === "host_calendar_reconnect_required") {
        return json({ error: "host_calendar_reconnect_required" }, 409);
      }
      console.error("[calendar-freebusy] token fetch/refresh error", e);
      return json({ error: "token_fetch_failed" }, 500);
    }
    if (!googleAccessToken)
      return json({ error: "host_calendar_not_connected" }, 409);

    // 1) freeBusy for busy blocks
    const { res: fbRes, data: fbJson } = await fetchJSON(
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
      if (isGoogleAuthError(fbJson))
        return json({ error: "host_calendar_reconnect_required" }, 409);
      console.error("[calendar-freebusy] google freeBusy failed", fbJson);
      return json({ error: "google_freebusy_failed" }, 502);
    }

    // 2) events.list for titles
    const eventsUrl = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    eventsUrl.searchParams.set("timeMin", from.toISOString());
    eventsUrl.searchParams.set("timeMax", to.toISOString());
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", "250");
    eventsUrl.searchParams.set("timeZone", tz);

    const { res: evRes, data: evJson } = await fetchJSON(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!evRes.ok) {
      if (isGoogleAuthError(evJson))
        return json({ error: "host_calendar_reconnect_required" }, 409);
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
      .filter((e) => e.start && e.end);

    return json({
      ok: true,
      tz,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      busy: fbJson?.calendars?.primary?.busy ?? [],
      events,
    });
  } catch (e: any) {
    console.error("[calendar-freebusy] unexpected error", e);
    return json({ error: String(e?.message ?? "internal_error") }, 500);
  }
}
