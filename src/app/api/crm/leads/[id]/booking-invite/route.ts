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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

export async function POST(req: Request, ctx: Ctx) {
  try {
    // ✅ FIX: params is a Promise in this Next version
    const { id } = await ctx.params;
    const leadId = pickParam(id);

    if (!leadId || !isUuid(leadId)) {
      return NextResponse.json({ error: "invalid_lead_id", received: leadId }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const bookingLinkId = body?.bookingLinkId ? String(body.bookingLinkId).trim() : "";

    if (!bookingLinkId || !isUuid(bookingLinkId)) {
      return NextResponse.json({ error: "invalid_booking_link_id", received: bookingLinkId }, { status: 400 });
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
    if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

    const teamId = String((lead as any).team_id ?? "").trim();
    if (!teamId) return NextResponse.json({ error: "lead_missing_team_id" }, { status: 500 });

    // 2) Load booking link and ensure same team
    const { data: link, error: linkErr } = await admin
      .from("booking_links")
      .select("id, team_id, slug, owner_user_id, name")
      .eq("id", bookingLinkId)
      .maybeSingle();

    if (linkErr) {
      console.error("[booking-invite] booking link query error:", linkErr);
      return NextResponse.json({ error: "booking_link_query_failed" }, { status: 500 });
    }
    if (!link || String((link as any).team_id) !== teamId) {
      return NextResponse.json({ error: "booking_link_not_found" }, { status: 404 });
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
          booking_link_id: link.id,
          lead_id: leadId,
          token,
          expires_at,
        })
        .select("token")
        .single();

      if (!invErr && invite?.token) {
        inviteToken = invite.token;
        break;
      }

      // token collision (extremely rare) → retry once
      if (invErr) {
        const msg = String((invErr as any)?.message ?? "");
        if (!msg.toLowerCase().includes("duplicate")) {
          console.error("[booking-invite] invite insert error:", invErr);
          return NextResponse.json({ error: "invite_create_failed" }, { status: 500 });
        }
      }
    }

    if (!inviteToken) return NextResponse.json({ error: "invite_create_failed" }, { status: 500 });

    const url = `/b/${link.slug}?t=${inviteToken}`;

    // 4) Activity log to lead_messages
    await admin.from("lead_messages").insert({
      team_id: teamId,
      lead_id: leadId,
      direction: "outbound",
      channel: "pipeline",
      body: `Sent booking link (“${(link as any).name}”): ${url}`,
      sender_profile_id: (link as any).owner_user_id,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, url, expires_at });
  } catch (e: any) {
    console.error("[booking-invite] unexpected:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
