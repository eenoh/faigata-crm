// src/app/api/crm/leads/[id]/booking-invite/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const runtime = "nodejs";

// In your Next version, `params` is async (Promise) for route handlers.
type Ctx = { params: Promise<{ id: string | string[] }> };

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function pickParam(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

type PostBody = { bookingLinkId?: unknown };

export async function POST(req: Request, ctx: Ctx) {
  try {
    // ✅ FIX: params is a Promise in this Next version
    const { id } = await ctx.params;
    const leadId = pickParam(id);

    if (!leadId || !isUuid(leadId)) {
      return NextResponse.json(
        { error: "invalid_lead_id", received: leadId },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as PostBody | null;
    const bookingLinkId = String(body?.bookingLinkId ?? "").trim();

    if (!bookingLinkId || !isUuid(bookingLinkId)) {
      return NextResponse.json(
        { error: "invalid_booking_link_id", received: bookingLinkId },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // 1) Load lead -> team_id
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, team_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr) {
      console.error("[booking-invite] lead query error:", leadErr);
      return NextResponse.json({ error: "lead_query_failed" }, { status: 500 });
    }
    if (!lead)
      return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

    const teamId = String((lead as any).team_id ?? "").trim();
    if (!teamId)
      return NextResponse.json(
        { error: "lead_missing_team_id" },
        { status: 500 },
      );

    // 2) Load booking link and ensure same team
    const { data: link, error: linkErr } = await admin
      .from("booking_links")
      .select("id, team_id, slug, owner_user_id, name")
      .eq("id", bookingLinkId)
      .maybeSingle();

    if (linkErr) {
      console.error("[booking-invite] booking link query error:", linkErr);
      return NextResponse.json(
        { error: "booking_link_query_failed" },
        { status: 500 },
      );
    }
    if (!link || String((link as any).team_id) !== teamId) {
      return NextResponse.json(
        { error: "booking_link_not_found" },
        { status: 404 },
      );
    }

    // 3) Create invite row (lead-specific) + expiry
    const expires_at = addDaysIso(14);

    let inviteToken: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const token = randomToken();

      const { data: invite, error: invErr } = await admin
        .from("booking_link_invites")
        .insert({
          team_id: teamId,
          booking_link_id: (link as any).id,
          lead_id: leadId,
          token,
          expires_at,
        })
        .select("token")
        .single();

      if (!invErr && invite?.token) {
        inviteToken = String(invite.token);
        break;
      }

      // token collision (extremely rare) → retry once
      if (invErr) {
        const msg = String((invErr as any)?.message ?? "");
        const code = String((invErr as any)?.code ?? "");
        const isDup =
          code === "23505" || msg.toLowerCase().includes("duplicate");

        if (!isDup) {
          console.error("[booking-invite] invite insert error:", invErr);
          return NextResponse.json(
            { error: "invite_create_failed" },
            { status: 500 },
          );
        }
      }
    }

    if (!inviteToken) {
      return NextResponse.json(
        { error: "invite_create_failed" },
        { status: 500 },
      );
    }

    const url = `/b/${String((link as any).slug)}?t=${inviteToken}`;

    // 4) Activity log to lead_messages (don't block response if it fails)
    const logRes = await admin.from("lead_messages").insert({
      team_id: teamId,
      lead_id: leadId,
      direction: "outbound",
      channel: "pipeline",
      body: `Sent booking link (“${String((link as any).name ?? "Booking Link")}”): ${url}`,
      sender_profile_id: (link as any).owner_user_id ?? null,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    if (logRes.error) {
      console.error(
        "[booking-invite] failed to log lead_message:",
        logRes.error,
      );
      // don't fail the invite creation
    }

    return NextResponse.json({ ok: true, url, expires_at });
  } catch (e: any) {
    console.error("[booking-invite] unexpected:", e);
    return NextResponse.json(
      { error: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
