// src/app/api/crm/booking-invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/**
 * Works with your existing endpoints:
 * - GET  /api/crm/booking-invite?t=TOKEN               (validate token)
 * - GET  /api/crm/booking-links/[slug]/availability?...&t=TOKEN
 * - POST /api/crm/booking-links/[slug]/book           body.token = TOKEN
 *
 * Creates a booking_link_invites row that matches your schema.
 */

function jsonError(error: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function supabaseAdmin() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !serviceKey) {
    throw new Error("missing_supabase_env");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: NextRequest | Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function makeToken() {
  return randomBytes(24).toString("base64url");
}

function appBaseUrl(req: NextRequest) {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = String(process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}`.replace(/\/+$/, "") : "";
}

function isUniqueViolation(err: any) {
  const code = String(err?.code ?? "").trim();
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code === "23505" ||
    msg.includes("duplicate key") ||
    msg.includes("unique constraint")
  );
}

/**
 * GET /api/crm/booking-invite?t=TOKEN
 * Validate/lookup an invite by token
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("t") ?? "").trim();
    if (!token) return jsonError("missing_token", 400);

    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("booking_link_invites")
      .select(
        "id, team_id, booking_link_id, lead_id, expires_at, used_at, created_at",
      )
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[crm-booking-invite] query error:", error);
      return jsonError("invite_query_failed", 500);
    }
    if (!data) return jsonError("invite_not_found", 404);

    if (data.expires_at) {
      const exp = new Date(String(data.expires_at));
      if (Number.isNaN(exp.getTime()))
        return jsonError("invite_invalid_expires_at", 500);
      if (exp.getTime() < Date.now()) return jsonError("invite_expired", 410);
    }

    // NOTE: We intentionally do NOT echo the token back.
    // If you need it for debugging, add it back — but it’s usually safer not to.
    return NextResponse.json({ ok: true, invite: data });
  } catch (e: any) {
    console.error("[crm-booking-invite] unexpected:", e);
    return jsonError(String(e?.message ?? e), 500);
  }
}

/**
 * POST /api/crm/booking-invite
 * body: { teamId, leadId, bookingLinkId }
 *
 * Requires Authorization: Bearer <supabase access token>
 *
 * Returns: { ok:true, url:"/b/:slug?t=TOKEN", token, inviteId, slug, expires_at }
 */
export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const nowIso = new Date().toISOString();

  try {
    const authToken = getBearerToken(req);
    if (!authToken) return jsonError("missing_auth", 401);

    const body = await req.json().catch(() => ({}) as any);
    const teamId = String(body?.teamId ?? "").trim();
    const leadId = String(body?.leadId ?? "").trim();
    const bookingLinkId = String(body?.bookingLinkId ?? "").trim();

    if (!isUuid(teamId)) return jsonError("invalid_teamId", 400);
    if (!isUuid(leadId)) return jsonError("invalid_leadId", 400);
    if (!isUuid(bookingLinkId)) return jsonError("invalid_bookingLinkId", 400);

    const admin = supabaseAdmin();

    // Validate caller (JWT)
    const { data: userRes, error: userErr } =
      await admin.auth.getUser(authToken);
    const userId = userRes?.user?.id ? String(userRes.user.id) : null;
    if (userErr || !userId) {
      return jsonError("invalid_session", 401);
    }

    // Verify user is in the team (profiles.team_id)
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, team_id")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      console.error("[booking-invite] profile lookup error:", profErr);
      return jsonError("profile_lookup_failed", 500);
    }

    if (!profile?.team_id || String(profile.team_id) !== teamId) {
      return jsonError("not_in_team", 403);
    }

    // Verify lead exists in team
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (leadErr) {
      console.error("[booking-invite] lead lookup error:", leadErr);
      return jsonError("lead_lookup_failed", 500);
    }
    if (!lead) return jsonError("lead_not_found", 404);

    // Verify booking link exists in team and not deleted
    const { data: link, error: linkErr } = await admin
      .from("booking_links")
      .select("id, slug, deleted_at")
      .eq("id", bookingLinkId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (linkErr) {
      console.error("[booking-invite] booking link lookup error:", linkErr);
      return jsonError("booking_link_lookup_failed", 500);
    }
    if (!link) return jsonError("booking_link_not_found", 404);
    if ((link as any).deleted_at) return jsonError("booking_link_deleted", 410);

    const slug = String((link as any).slug ?? "").trim();
    if (!slug) return jsonError("booking_link_missing_slug", 500);

    // Create invite (token collision safe)
    const expiresAtIso = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    let inviteRow: { id: string; token: string } | null = null;
    let lastErr: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const inviteToken = makeToken();

      const { data: invite, error: invErr } = await admin
        .from("booking_link_invites")
        .insert({
          team_id: teamId,
          booking_link_id: bookingLinkId,
          lead_id: leadId,
          token: inviteToken,
          expires_at: expiresAtIso,
          created_at: nowIso,
          // If your schema supports it, this is useful:
          // created_by: userId,
        })
        .select("id, token")
        .single();

      if (!invErr && invite?.id) {
        inviteRow = { id: String(invite.id), token: String(invite.token) };
        break;
      }

      lastErr = invErr;

      // retry only for genuine uniqueness collisions
      if (!isUniqueViolation(invErr)) break;
    }

    if (!inviteRow) {
      console.error("[booking-invite] invite insert error:", lastErr);
      return NextResponse.json(
        {
          ok: false,
          error: "invite_create_failed",
          ...(isDev
            ? {
                detail: {
                  code: lastErr?.code ?? null,
                  message: lastErr?.message ?? null,
                  details: lastErr?.details ?? null,
                  hint: lastErr?.hint ?? null,
                },
              }
            : {}),
        },
        { status: 500 },
      );
    }

    const base = appBaseUrl(req);
    const path = `/b/${encodeURIComponent(slug)}?t=${encodeURIComponent(inviteRow.token)}`;
    const url = base ? `${base}${path}` : path;

    // ✅ Timeline message (non-fatal) WITH event_type + event_data (jsonb NOT NULL)
    try {
      const event_type = "booking_invite_created";
      const event_data = {
        team_id: teamId,
        lead_id: leadId,
        booking_link_id: bookingLinkId,
        booking_link_slug: slug,
        invite_id: inviteRow.id,
        // token is useful internally; remove if you don’t want it stored
        token: inviteRow.token,
        url,
        expires_at: expiresAtIso,
        created_by: userId,
      };

      const { error: msgErr } = await admin.from("lead_messages").insert({
        team_id: teamId,
        lead_id: leadId,

        direction: "outbound",
        channel: "pipeline",

        body: `Sent booking link: ${url}`,

        sender_profile_id: userId,
        // Only include user_id if your table has it; remove if not:
        user_id: userId,

        sent_at: nowIso,
        created_at: nowIso,

        event_type,
        event_data,
      } as any);

      if (msgErr) {
        console.error(
          "[booking-invite] lead_messages insert error (non-fatal):",
          msgErr,
        );
      }
    } catch (e) {
      console.error(
        "[booking-invite] lead_messages insert failed (non-fatal):",
        e,
      );
    }

    return NextResponse.json({
      ok: true,
      inviteId: inviteRow.id,
      token: inviteRow.token,
      slug,
      url,
      expires_at: expiresAtIso,
    });
  } catch (e: any) {
    console.error("[booking-invite] unexpected:", e);
    return jsonError(String(e?.message ?? e), 500);
  }
}
