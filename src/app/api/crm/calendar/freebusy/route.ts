// src/app/api/crm/calendar/freebusy/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env_${name}`);
  return v;
}

function supabaseAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const ALLOWED = new Set(["closer", "manager", "admin"]);
function hasAccess(roles: unknown) {
  return (
    Array.isArray(roles) &&
    roles.some((r) => typeof r === "string" && ALLOWED.has(r.toLowerCase()))
  );
}

function parseIsoOrNull(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isGoogleAuthError(payload: any): boolean {
  const code = Number(payload?.error?.code ?? 0);
  const msg = String(payload?.error?.message ?? "").toLowerCase();
  return code === 401 || code === 403 || msg.includes("invalid credentials");
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

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
    throw new Error(
      json?.error_description || json?.error || "google_refresh_failed"
    );
  }

  const access_token = String(json.access_token || "");
  const expires_in = Number(json.expires_in || 0);

  if (!access_token || !expires_in) {
    throw new Error("google_refresh_missing_fields");
  }

  const expiry_date = new Date(Date.now() + expires_in * 1000).toISOString();
  return { access_token, expiry_date };
}

async function getGoogleAccessTokenForUser(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string
) {
  const { data: tok, error } = await admin
    .from("user_google_calendar_tokens")
    .select("access_token, refresh_token, expiry_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!tok?.refresh_token) return null;

  let accessToken = String(tok.access_token || "");
  const expiry = tok.expiry_date ? new Date(tok.expiry_date).getTime() : 0;

  // refresh if missing/expired/expiring soon
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

export async function GET(req: Request) {
  try {
    const admin = supabaseAdmin();

    // ✅ AUTH via Authorization header (works with localStorage sessions)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const userId = userRes?.user?.id;

    if (userErr || !userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // ✅ role gating
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) {
      console.error("[calendar-freebusy] profile query error", profileErr);
      return NextResponse.json({ error: "profile_query_failed" }, { status: 500 });
    }

    if (!hasAccess(profile?.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const tz = url.searchParams.get("tz") || "UTC";

    const from =
      parseIsoOrNull(url.searchParams.get("from")) ?? new Date();
    const to =
      parseIsoOrNull(url.searchParams.get("to")) ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (to.getTime() <= from.getTime()) {
      return NextResponse.json({ error: "invalid_range" }, { status: 400 });
    }

    // ✅ Get Google token from DB (refresh if needed)
    let googleAccessToken: string | null = null;
    try {
      googleAccessToken = await getGoogleAccessTokenForUser(admin, userId);
    } catch (e: any) {
      if (String(e?.message ?? "") === "host_calendar_reconnect_required") {
        return NextResponse.json(
          { error: "host_calendar_reconnect_required" },
          { status: 409 }
        );
      }
      console.error("[calendar-freebusy] token fetch/refresh error", e);
      return NextResponse.json({ error: "token_fetch_failed" }, { status: 500 });
    }

    if (!googleAccessToken) {
      return NextResponse.json(
        { error: "host_calendar_not_connected" },
        { status: 409 }
      );
    }

    // 1) freeBusy for "busy blocks"
    const fbRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        timeZone: tz,
        items: [{ id: "primary" }],
      }),
    });

    const fbJson: any = await fbRes.json().catch(() => ({} as any));
    if (!fbRes.ok) {
      if (isGoogleAuthError(fbJson)) {
        return NextResponse.json(
          { error: "host_calendar_reconnect_required" },
          { status: 409 }
        );
      }
      console.error("[calendar-freebusy] google freeBusy failed", fbJson);
      return NextResponse.json({ error: "google_freebusy_failed" }, { status: 502 });
    }

    // 2) events.list for titles
    const eventsUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    eventsUrl.searchParams.set("timeMin", from.toISOString());
    eventsUrl.searchParams.set("timeMax", to.toISOString());
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", "250");
    // optional: keep Google from shifting weirdly
    eventsUrl.searchParams.set("timeZone", tz);

    const evRes = await fetch(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    const evJson: any = await evRes.json().catch(() => ({} as any));
    if (!evRes.ok) {
      if (isGoogleAuthError(evJson)) {
        return NextResponse.json(
          { error: "host_calendar_reconnect_required" },
          { status: 409 }
        );
      }
      console.error("[calendar-freebusy] google events.list failed", evJson);
      return NextResponse.json({ error: "google_events_failed" }, { status: 502 });
    }

    const items: any[] = Array.isArray(evJson?.items) ? evJson.items : [];

    const events: ApiEvent[] = items
      .filter((it) => it?.status !== "cancelled")
      .map((it) => {
        const startDT = it?.start?.dateTime ?? null;
        const endDT = it?.end?.dateTime ?? null;

        // all-day events come as { start: { date: "YYYY-MM-DD" }, end: { date: "YYYY-MM-DD" } }
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

    return NextResponse.json({
      ok: true,
      tz,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      busy: fbJson?.calendars?.primary?.busy ?? [],
      events,
    });
  } catch (e: any) {
    console.error("[calendar-freebusy] unexpected error", e);
    return NextResponse.json(
      { error: String(e?.message ?? "internal_error") },
      { status: 500 }
    );
  }
}
