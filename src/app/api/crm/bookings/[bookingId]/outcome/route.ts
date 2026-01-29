// src/app/api/crm/bookings/[bookingId]/outcome/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("missing_supabase_env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Body = {
  teamId: string;
  attended_status: string;
  offer_made: boolean;
  offer_product_id?: string | null;
  closed_on_call: boolean;
  notes: string;
};

// ⚠️ Keep aligned with Postgres enum booking_attendance
// If your enum does NOT include "unknown", remove it here + in UI.
const ATTENDANCE_VALUES = new Set(["unknown", "attended", "no_show", "cancelled", "rescheduled"]);

function normStatus(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return ATTENDANCE_VALUES.has(s) ? s : "unknown";
}

function bool(v: any) {
  return !!v;
}

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function pgErr(e: any) {
  return {
    message: e?.message ?? null,
    code: e?.code ?? null,
    details: e?.details ?? null,
    hint: e?.hint ?? null,
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ bookingId: string }> }) {
  try {
    const sb = admin();

    const { bookingId } = await ctx.params;
    const bid = String(bookingId ?? "").trim();
    if (!bid || !isUuid(bid)) {
      return NextResponse.json({ error: "invalid_booking_id" }, { status: 400 });
    }

    const token = bearer(req);
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 401 });

    // Validate user using service role (no anon needed)
    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    const userId = userRes?.user?.id ?? null;
    if (userErr || !userId) {
      return NextResponse.json({ error: "invalid_session", pg: pgErr(userErr) }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });

    const teamId = String(body.teamId ?? "").trim();
    if (!teamId || !isUuid(teamId)) {
      return NextResponse.json({ error: "invalid_team_id" }, { status: 400 });
    }

    const nextAttended = normStatus(body.attended_status);
    const nextOffer = bool(body.offer_made);

    // IMPORTANT: closed_on_call only allowed when attended
    const nextClosed = nextAttended === "attended" ? bool(body.closed_on_call) : false;

    // ✅ HARD GUARD for your DB CHECK:
    // CHECK ((offer_made = false) OR (offer_product_id IS NOT NULL))
    // We enforce non-empty (stricter than NOT NULL, avoids blank strings slipping through).
    let offerProductId = String(body.offer_product_id ?? "").trim();
    if (!nextOffer) offerProductId = "";
    if (nextOffer && !offerProductId) {
      return NextResponse.json(
        {
          error: "missing_offer_product_id",
          message: "Offer made requires selecting a product.",
        },
        { status: 400 }
      );
    }

    const notes = String(body.notes ?? "");

    // Load booking and verify team match
    const { data: booking, error: bookingErr } = await sb
      .from("bookings")
      .select("id, lead_id, team_id")
      .eq("id", bid)
      .maybeSingle();

    if (bookingErr || !booking) {
      return NextResponse.json({ error: "booking_not_found", pg: pgErr(bookingErr) }, { status: 404 });
    }

    if (String(booking.team_id).toLowerCase() !== teamId.toLowerCase()) {
      return NextResponse.json({ error: "team_mismatch" }, { status: 403 });
    }

    const leadId = String(booking.lead_id ?? "").trim();
    if (!leadId) return NextResponse.json({ error: "missing_lead_id" }, { status: 500 });

    // Look up existing outcome (so we can UPDATE vs INSERT safely)
    const { data: prevRow, error: prevErr } = await sb
      .from("booking_outcomes")
      .select("id")
      .eq("booking_id", bid)
      .eq("team_id", teamId)
      .maybeSingle();

    if (prevErr) {
      return NextResponse.json({ error: "outcome_lookup_failed", pg: pgErr(prevErr) }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    // ✅ On UPDATE: do NOT touch FK/identity columns.
    const updatePayload = {
      attended_status: nextAttended,
      offer_made: nextOffer,
      offer_product_id: nextOffer ? offerProductId : null,
      closed_on_call: nextClosed,
      notes,
      updated_at: nowIso,
    };

    if (prevRow?.id) {
      const { error: updErr } = await sb
        .from("booking_outcomes")
        .update(updatePayload)
        .eq("id", String(prevRow.id));

      if (updErr) {
        return NextResponse.json(
          {
            error: "outcome_update_failed",
            message: "Postgres rejected UPDATE on booking_outcomes.",
            attempted: updatePayload,
            pg: pgErr(updErr),
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, mode: "updated" });
    }

    // ✅ On INSERT: include all required columns (id/created_at) even if DB has no defaults
    const insertPayload = {
      id: randomUUID(),
      booking_id: bid,
      team_id: teamId,
      lead_id: leadId,
      closer_user_id: userId,
      created_at: nowIso,
      ...updatePayload,
    };

    const { error: insErr } = await sb.from("booking_outcomes").insert(insertPayload);

    if (insErr) {
      return NextResponse.json(
        {
          error: "outcome_insert_failed",
          message: "Postgres rejected INSERT into booking_outcomes.",
          attempted: insertPayload,
          pg: pgErr(insErr),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, mode: "inserted" });
  } catch (e: any) {
    return NextResponse.json(
      { error: "outcome_unhandled_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
