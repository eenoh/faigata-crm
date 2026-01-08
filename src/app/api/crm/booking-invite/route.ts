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

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: NextRequest | Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function makeToken() {
  return randomBytes(24).toString("base64url");
}

function appBaseUrl(req: NextRequest) {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}`.replace(/\/+$/, "") : "";
}

/**
 * GET /api/crm/booking-invite?t=TOKEN
 * Validate/lookup an invite by token
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("t") ?? "").trim();
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("booking_link_invites")
      .select("id, team_id, booking_link_id, lead_id, expires_at, used_at, token, created_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[crm-booking-invite] query error:", error);
      return NextResponse.json({ error: "invite_query_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "invite_not_found" }, { status: 404 });

    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "invite_expired" }, { status: 410 });
    }

    return NextResponse.json({ ok: true, invite: data });
  } catch (e: any) {
    console.error("[crm-booking-invite] unexpected:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
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

  try {
    const authToken = getBearerToken(req);
    if (!authToken) return NextResponse.json({ error: "missing_auth" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const teamId = String(body?.teamId ?? "").trim();
    const leadId = String(body?.leadId ?? "").trim();
    const bookingLinkId = String(body?.bookingLinkId ?? "").trim();

    if (!isUuid(teamId)) return NextResponse.json({ error: "invalid_teamId" }, { status: 400 });
    if (!isUuid(leadId)) return NextResponse.json({ error: "invalid_leadId" }, { status: 400 });
    if (!isUuid(bookingLinkId)) return NextResponse.json({ error: "invalid_bookingLinkId" }, { status: 400 });

    const admin = supabaseAdmin();

    // Validate caller (JWT)
    const { data: userRes, error: userErr } = await admin.auth.getUser(authToken);
    const userId = userRes?.user?.id ? String(userRes.user.id) : null;
    if (userErr || !userId) {
      return NextResponse.json({ error: "invalid_session" }, { status: 401 });
    }

    // Verify user is in the team (profiles.team_id)
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, team_id")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      console.error("[booking-invite] profile lookup error:", profErr);
      return NextResponse.json({ error: "profile_lookup_failed" }, { status: 500 });
    }

    if (!profile?.team_id || String(profile.team_id) !== teamId) {
      return NextResponse.json({ error: "not_in_team" }, { status: 403 });
    }

    // Verify lead exists in team
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, team_id")
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (leadErr) {
      console.error("[booking-invite] lead lookup error:", leadErr);
      return NextResponse.json({ error: "lead_lookup_failed" }, { status: 500 });
    }
    if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

    // Verify booking link exists in team and not deleted
    const { data: link, error: linkErr } = await admin
      .from("booking_links")
      .select("id, team_id, slug, deleted_at")
      .eq("id", bookingLinkId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (linkErr) {
      console.error("[booking-invite] booking link lookup error:", linkErr);
      return NextResponse.json({ error: "booking_link_lookup_failed" }, { status: 500 });
    }
    if (!link) return NextResponse.json({ error: "booking_link_not_found" }, { status: 404 });
    if ((link as any).deleted_at) return NextResponse.json({ error: "booking_link_deleted" }, { status: 410 });

    const slug = String((link as any).slug ?? "").trim();
    if (!slug) return NextResponse.json({ error: "booking_link_missing_slug" }, { status: 500 });

    // Create invite (token collision safe)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    let inviteRow: { id: string; token: string } | null = null;
    let lastErr: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const inviteToken = makeToken();

      // IMPORTANT: insert ONLY columns that exist in your booking_link_invites table
      const { data: invite, error: invErr } = await admin
        .from("booking_link_invites")
        .insert({
          team_id: teamId,
          booking_link_id: bookingLinkId,
          lead_id: leadId,
          token: inviteToken,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        })
        .select("id, token")
        .single();

      if (!invErr && invite?.id) {
        inviteRow = { id: String(invite.id), token: String(invite.token) };
        break;
      }

      lastErr = invErr;

      const pgCode = (invErr as any)?.code;
      const msg = String((invErr as any)?.message ?? "");
      const isUnique = pgCode === "23505" || msg.toLowerCase().includes("duplicate key");
      if (!isUnique) break;
    }

    if (!inviteRow) {
      console.error("[booking-invite] invite insert error:", lastErr);
      return NextResponse.json(
        {
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
        { status: 500 }
      );
    }

    const base = appBaseUrl(req);
    const path = `/b/${encodeURIComponent(slug)}?t=${encodeURIComponent(inviteRow.token)}`;
    const url = base ? `${base}${path}` : path;

    // Optional: timeline message (non-fatal)
    try {
      await admin.from("lead_messages").insert({
        team_id: teamId,
        lead_id: leadId,
        direction: "outbound",
        channel: "pipeline",
        body: `Sent booking link: ${url}`,
        sender_profile_id: userId,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[booking-invite] lead_messages insert failed (non-fatal):", e);
    }

    return NextResponse.json({
      ok: true,
      inviteId: inviteRow.id,
      token: inviteRow.token,
      slug,
      url,
      expires_at: expiresAt,
    });
  } catch (e: any) {
    console.error("[booking-invite] unexpected:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
