// src/app/api/integrations/calendar/google/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";

function base64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function signState(uid: string, nonce: string, ts: number, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${uid}.${nonce}.${ts}`).digest("hex");
}

function parseSignedState(returnedState: string | null): { uid: string; nonce: string; ts: number } | null {
  if (!returnedState) return null;

  let raw: any = null;
  try {
    raw = JSON.parse(base64urlDecode(returnedState));
  } catch {
    return null;
  }

  const uid = typeof raw?.uid === "string" ? raw.uid.trim() : "";
  const nonce = typeof raw?.nonce === "string" ? raw.nonce.trim() : "";
  const ts = Number(raw?.ts);
  const sig = typeof raw?.sig === "string" ? raw.sig.trim() : "";

  if (!uid || !nonce || !Number.isFinite(ts) || !sig) return null;

  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) return null;

  // Expire signed state after 15 minutes
  const maxAgeMs = 15 * 60 * 1000;
  if (Date.now() - ts > maxAgeMs) return null;

  const expected = signState(uid, nonce, ts, secret);
  if (!timingSafeEqual(sig, expected)) return null;

  return { uid, nonce, ts };
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const returnedState = url.searchParams.get("state");

    if (error) {
      return NextResponse.redirect(new URL(`/profile/integrations?error=${encodeURIComponent(error)}`, origin));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/profile/integrations?error=missing_code", origin));
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(new URL("/profile/integrations?error=server_misconfigured", origin));
    }

    // 1) cookie-based flow
    const cookieState = req.cookies.get("gc_oauth_state")?.value || null;
    const cookieUserId = req.cookies.get("gc_oauth_user_id")?.value || null;

    let resolvedUserId: string | null = null;

    if (cookieState && cookieUserId) {
      if (!returnedState || returnedState !== cookieState) {
        return NextResponse.redirect(new URL("/profile/integrations?error=invalid_state", origin));
      }
      resolvedUserId = cookieUserId;
    } else {
      // 2) signed state fallback
      const parsed = parseSignedState(returnedState);
      if (!parsed?.uid) {
        return NextResponse.redirect(new URL("/profile/integrations?error=missing_auth", origin));
      }
      resolvedUserId = parsed.uid;
    }

    // Exchange code → tokens
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const tokenJson: any = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok) {
      console.error("[google-callback] token exchange failed:", tokenJson);
      return NextResponse.redirect(new URL("/profile/integrations?error=token_exchange_failed", origin));
    }

    const accessToken = tokenJson.access_token as string | undefined;
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const scope = tokenJson.scope as string | undefined;
    const tokenType = tokenJson.token_type as string | undefined;
    const expiresIn = tokenJson.expires_in as number | undefined;

    const expiryDate =
      typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const payload: any = {
      user_id: resolvedUserId,
      access_token: accessToken ?? null,
      scope: scope ?? null,
      token_type: tokenType ?? null,
      expiry_date: expiryDate,
      updated_at: new Date().toISOString(),
    };

    if (refreshToken) payload.refresh_token = refreshToken;

    const { error: upsertErr } = await supabaseAdmin.from("user_google_calendar_tokens").upsert(payload, {
      onConflict: "user_id",
    });

    if (upsertErr) {
      console.error("[google-callback] Failed to upsert tokens:", upsertErr);
      return NextResponse.redirect(new URL("/profile/integrations?error=db_upsert_failed", origin));
    }

    // success redirect → Profile Integrations page
    const response = NextResponse.redirect(new URL("/profile/integrations?connected=google", origin));

    // UI hint cookie lasts 3 months (90 days)
    response.cookies.set("calendar_google_connected", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 90,
    });

    // Clear short-lived connect cookies
    response.cookies.set("gc_oauth_state", "", { path: "/", maxAge: 0 });
    response.cookies.set("gc_oauth_user_id", "", { path: "/", maxAge: 0 });

    return response;
  } catch (err: any) {
    console.error("[google-callback] Unhandled error:", err);
    return NextResponse.redirect(
      new URL(`/profile/integrations?error=${encodeURIComponent(err?.message || "callback_internal_error")}`, origin)
    );
  }
}
