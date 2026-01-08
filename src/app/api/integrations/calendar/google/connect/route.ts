// src/app/api/integrations/calendar/google/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // require bearer token
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const accessJwt =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!accessJwt) {
    return NextResponse.json({ error: "missing_auth" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessJwt);

  if (userError || !userData?.user) {
    return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
  }

  const userId = userData.user.id;

  // CSRF state
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri, // ✅ critical
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  const authUrl = `${GOOGLE_AUTH_BASE}?${params.toString()}`;

  const res = NextResponse.json({ authUrl });

  // short lived cookies for callback
  res.cookies.set("gc_oauth_state", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
  });

  res.cookies.set("gc_oauth_user_id", userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
  });

  return res;
}
