import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { createGoogleOauthState } from "@/features/integrations/google/server/oauth-state";

export const runtime = "nodejs";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function setShortCookie(res: NextResponse, name: string, value: string) {
  res.cookies.set(name, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.isProduction(),
    maxAge: 10 * 60,
  });
}

export async function POST(req: NextRequest) {
  const clientId = serverEnv.google.clientId();
  const redirectUri = serverEnv.google.redirectUri();
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    );
  }

  const auth = await getRequestUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: 401 });
  }

  const state = createGoogleOauthState(auth.user.id);

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

  setShortCookie(res, "gc_oauth_state", state);
  setShortCookie(res, "gc_oauth_user_id", auth.user.id);

  return res;
}
