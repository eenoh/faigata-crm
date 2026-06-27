// src/app/api/integrations/calendar/google/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serverEnv } from "@/lib/env/server";
import { resolveGoogleOauthUserId } from "@/features/integrations/google/server/oauth-state";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UI_HINT_MAX_AGE = 60 * 60 * 24 * 90;

function redirect(origin: string, qs: string) {
  return NextResponse.redirect(new URL(`/profile/integrations${qs}`, origin));
}

function resolveUserIdFromState(
  req: NextRequest,
  returnedState: string | null,
) {
  return resolveGoogleOauthUserId({
    returnedState,
    cookieState: req.cookies.get("gc_oauth_state")?.value || null,
    cookieUserId: req.cookies.get("gc_oauth_user_id")?.value || null,
  });
}

async function exchangeCodeForTokens(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json: any = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");
    const returnedState = req.nextUrl.searchParams.get("state");

    if (error) return redirect(origin, `?error=${encodeURIComponent(error)}`);
    if (!code) return redirect(origin, "?error=missing_code");

    const clientId = serverEnv.google.clientId();
    const clientSecret = serverEnv.google.clientSecret();
    const redirectUri = serverEnv.google.redirectUri();

    if (!clientId || !clientSecret || !redirectUri) {
      return redirect(origin, "?error=server_misconfigured");
    }

    const userId = resolveUserIdFromState(req, returnedState);
    if (!userId) return redirect(origin, "?error=invalid_state");

    const { ok, json } = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    if (!ok) {
      console.error("[google-callback] token exchange failed:", json);
      return redirect(origin, "?error=token_exchange_failed");
    }

    const accessToken =
      typeof json.access_token === "string" ? json.access_token : null;
    const refreshToken =
      typeof json.refresh_token === "string" ? json.refresh_token : null;
    const scope = typeof json.scope === "string" ? json.scope : null;
    const tokenType =
      typeof json.token_type === "string" ? json.token_type : null;
    const expiresIn =
      typeof json.expires_in === "number" ? json.expires_in : null;

    const expiryDate =
      typeof expiresIn === "number"
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    const payload: Record<string, any> = {
      user_id: userId,
      access_token: accessToken,
      scope,
      token_type: tokenType,
      expiry_date: expiryDate,
      updated_at: new Date().toISOString(),
    };
    if (refreshToken) payload.refresh_token = refreshToken;

    const { error: upsertErr } = await supabaseAdmin
      .from("user_google_calendar_tokens")
      .upsert(payload, { onConflict: "user_id" });

    if (upsertErr) {
      console.error("[google-callback] Failed to upsert tokens:", upsertErr);
      return redirect(origin, "?error=db_upsert_failed");
    }

    const res = redirect(origin, "?connected=google");

    res.cookies.set("calendar_google_connected", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: serverEnv.isProduction(),
      maxAge: UI_HINT_MAX_AGE,
    });

    res.cookies.set("gc_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("gc_oauth_user_id", "", { path: "/", maxAge: 0 });

    return res;
  } catch (err: any) {
    console.error("[google-callback] Unhandled error:", err);
    return redirect(
      origin,
      `?error=${encodeURIComponent(err?.message || "callback_internal_error")}`,
    );
  }
}
