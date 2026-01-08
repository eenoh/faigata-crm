// src/app/api/crm/bookings/[bookingId]/outcome/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

type Body = {
  teamId: string;
  attended_status: string;
  offer_made: boolean;
  offer_product_id?: string | null;
  closed_on_call: boolean;
  notes: string;
};

function normStatus(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  const allowed = new Set(["unknown", "attended", "no_show", "cancelled", "rescheduled"]);
  return allowed.has(s) ? s : "unknown";
}

function bool(v: any) {
  return !!v;
}

async function authedUserId(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { data } = await client.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await ctx.params;
  const bid = String(bookingId ?? "").trim();
  if (!bid) return NextResponse.json({ error: "missing_booking_id" }, { status: 400 });

  const userId = await authedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });

  const teamId = String(body.teamId ?? "").trim();
  if (!teamId) return NextResponse.json({ error: "missing_teamId" }, { status: 400 });

  const nextAttended = normStatus(body.attended_status);
  const nextOffer = bool(body.offer_made);
  const nextClosed = nextAttended === "attended" ? bool(body.closed_on_call) : false;

  const nextOfferProductId = nextOffer ? String(body.offer_product_id ?? "").trim() : "";
  if (nextOffer && !nextOfferProductId) {
    return NextResponse.json({ error: "missing_offer_product_id" }, { status: 400 });
  }

  const notes = String(body.notes ?? "");

  const sb = admin();

  // Load booking to get lead_id
  const { data: booking, error: bookingErr } = await sb
    .from("bookings")
    .select("id, lead_id, team_id")
    .eq("id", bid)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }
  if (String(booking.team_id) !== teamId) {
    return NextResponse.json({ error: "team_mismatch" }, { status: 403 });
  }

  const leadId = String(booking.lead_id ?? "").trim();
  if (!leadId) return NextResponse.json({ error: "missing_lead_id" }, { status: 500 });

  // Load previous outcome (if any) to detect changes
  const { data: prevRow } = await sb
    .from("booking_outcomes")
    .select("attended_status, offer_made, offer_product_id, closed_on_call, notes, updated_at")
    .eq("booking_id", bid)
    .eq("team_id", teamId)
    .maybeSingle();

  const prevAttended = normStatus(prevRow?.attended_status);
  const prevOffer = bool(prevRow?.offer_made);
  const prevClosed = bool(prevRow?.closed_on_call);
  const prevOfferProductId = String((prevRow as any)?.offer_product_id ?? "").trim();

  // Upsert booking_outcomes
  const nowIso = new Date().toISOString();

  const { error: upsertErr } = await sb.from("booking_outcomes").upsert(
    {
      booking_id: bid,
      team_id: teamId,
      lead_id: leadId,
      closer_user_id: userId,

      attended_status: nextAttended,
      offer_made: nextOffer,
      offer_product_id: nextOffer ? nextOfferProductId : null,
      closed_on_call: nextClosed,
      notes,

      updated_at: nowIso,
    },
    { onConflict: "booking_id" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: "outcome_upsert_failed", details: upsertErr }, { status: 500 });
  }

  // Write separate timeline events
  const timelineInserts: any[] = [];

  // 1) attendance changed
  if (prevAttended !== nextAttended) {
    timelineInserts.push({
      team_id: teamId,
      lead_id: leadId,
      direction: "outbound",
      channel: "pipeline",
      sender_profile_id: userId,
      body: `CALL_ATTENDANCE|${bid}|${prevAttended}|${nextAttended}`,
      sent_at: nowIso,
    });
  }

  // 2) offer made toggled or product changed
  const offerChanged = prevOffer !== nextOffer;
  const offerProductChanged = prevOfferProductId !== nextOfferProductId;

  if (offerChanged || (nextOffer && offerProductChanged)) {
    // include product id in body (and you can display name on UI by looking it up optionally)
    timelineInserts.push({
      team_id: teamId,
      lead_id: leadId,
      direction: "outbound",
      channel: "pipeline",
      sender_profile_id: userId,
      body: `CALL_OFFER_MADE|${bid}|${nextOffer ? "1" : "0"}|${nextOffer ? nextOfferProductId : ""}`,
      sent_at: nowIso,
    });
  }

  // 3) closed on call toggled
  if (prevClosed !== nextClosed) {
    const productIdForClose = nextClosed ? nextOfferProductId : "";
    timelineInserts.push({
      team_id: teamId,
      lead_id: leadId,
      direction: "outbound",
      channel: "pipeline",
      sender_profile_id: userId,
      body: `CALL_CLOSED_ON_CALL|${bid}|${nextClosed ? "1" : "0"}|${productIdForClose}`,
      sent_at: nowIso,
    });
  }

  // Insert timeline messages best-effort
  if (timelineInserts.length) {
    await sb.from("lead_messages").insert(timelineInserts);
  }

  return NextResponse.json({ ok: true });
}
