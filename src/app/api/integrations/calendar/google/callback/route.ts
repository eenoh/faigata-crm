// src/app/api/integrations/calendar/google/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const UI_HINT_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function redirect(origin: string, qs: string) {
  return NextResponse.redirect(new URL(`/profile/integrations${qs}`, origin));
}

function base64urlDecodeUtf8(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function timingSafeEqualStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function signState(uid: string, nonce: string, ts: number, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${uid}.${nonce}.${ts}`)
    .digest("hex");
}

function resolveUserIdFromState(
  req: NextRequest,
  returnedState: string | null,
) {
  // 1) cookie-based flow (preferred)
  const cookieState = req.cookies.get("gc_oauth_state")?.value || null;
  const cookieUserId = req.cookies.get("gc_oauth_user_id")?.value || null;

  if (cookieState && cookieUserId) {
    if (!returnedState || returnedState !== cookieState) return null;
    return cookieUserId;
  }

  // 2) signed state fallback
  if (!returnedState) return null;

  let raw: any;
  try {
    raw = JSON.parse(base64urlDecodeUtf8(returnedState));
  } catch {
    return null;
  }

  const uid = typeof raw?.uid === "string" ? raw.uid.trim() : "";
  const nonce = typeof raw?.nonce === "string" ? raw.nonce.trim() : "";
  const ts = Number(raw?.ts);
  const sig = typeof raw?.sig === "string" ? raw.sig.trim() : "";

  if (!uid || !nonce || !Number.isFinite(ts) || !sig) return null;

  const secret =
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!secret) return null;

  if (Date.now() - ts > STATE_MAX_AGE_MS) return null;

  const expected = signState(uid, nonce, ts, secret);
  if (!timingSafeEqualStr(sig, expected)) return null;

  return uid;
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

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

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

    // UI hint cookie
    res.cookies.set("calendar_google_connected", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: UI_HINT_MAX_AGE,
    });

    // Clear short-lived connect cookies
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
