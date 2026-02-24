import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function getBearer(req: NextRequest) {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function setShortCookie(res: NextResponse, name: string, value: string) {
  res.cookies.set(name, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
  });
}

export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    );
  }

  const jwt = getBearer(req);
  if (!jwt)
    return NextResponse.json({ error: "missing_auth" }, { status: 401 });

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user) {
    return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
  }

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  const res = NextResponse.json({
    authUrl: `${GOOGLE_AUTH_BASE}?${params.toString()}`,
  });

  // short-lived cookies for callback validation
  setShortCookie(res, "gc_oauth_state", state);
  setShortCookie(res, "gc_oauth_user_id", data.user.id);

  return res;
}
