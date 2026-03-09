// src/app/api/crm/bookings/[bookingId]/outcome/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ bookingId: string }> };

type Body = {
  teamId: string;
  attended_status: string;
  offer_made: boolean;
  offer_product_id?: string | null;
  closed_on_call: boolean;
  notes: string;
};

const json = (data: any, status = 200) => NextResponse.json(data, { status });
const nowISO = () => new Date().toISOString();

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("missing_supabase_env");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Keep aligned with Postgres enum booking_attendance
const ATTENDANCE = new Set([
  "unknown",
  "attended",
  "no_show",
  "cancelled",
  "rescheduled",
]);

const normStatus = (v: unknown) => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return ATTENDANCE.has(s) ? s : "unknown";
};

const bearer = (req: NextRequest) => {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
};

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );

const pgErr = (e: any) => ({
  message: e?.message ?? null,
  code: e?.code ?? null,
  details: e?.details ?? null,
  hint: e?.hint ?? null,
});

async function insertLeadMessageSafe(
  sb: ReturnType<typeof admin>,
  payload: Record<string, any>,
) {
  const { error } = await sb.from("lead_messages").insert(payload);
  if (error) {
    console.error("[booking-outcome] lead_messages insert failed", error);
  }
}

async function insertLeadScoreEventSafe(
  sb: ReturnType<typeof admin>,
  payload: Record<string, any>,
) {
  const { error } = await sb.from("lead_score_events").insert(payload);
  if (error) {
    console.error("[booking-outcome] lead_score_events insert failed", error);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const sb = admin();

    const { bookingId } = await ctx.params;
    const bid = String(bookingId ?? "").trim();
    if (!isUuid(bid)) return json({ error: "invalid_booking_id" }, 400);

    const token = bearer(req);
    if (!token) return json({ error: "missing_token" }, 401);

    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    const userId = userRes?.user?.id ?? null;
    if (userErr || !userId)
      return json({ error: "invalid_session", pg: pgErr(userErr) }, 401);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json({ error: "invalid_json_body" }, 400);

    const teamId = String(body.teamId ?? "").trim();
    if (!isUuid(teamId)) return json({ error: "invalid_team_id" }, 400);

    const attended_status = normStatus(body.attended_status);
    const offer_made = !!body.offer_made;
    const closed_on_call =
      attended_status === "attended" ? !!body.closed_on_call : false;

    let offer_product_id = String(body.offer_product_id ?? "").trim();
    if (!offer_made) offer_product_id = "";
    if (offer_made && !offer_product_id) {
      return json(
        {
          error: "missing_offer_product_id",
          message: "Offer made requires selecting a product.",
        },
        400,
      );
    }

    const notes = String(body.notes ?? "");
    const updated_at = nowISO();

    // Load booking
    const { data: booking, error: bookingErr } = await sb
      .from("bookings")
      .select("id, lead_id, team_id")
      .eq("id", bid)
      .maybeSingle();

    if (bookingErr || !booking)
      return json({ error: "booking_not_found", pg: pgErr(bookingErr) }, 404);

    if (String(booking.team_id).toLowerCase() !== teamId.toLowerCase())
      return json({ error: "team_mismatch" }, 403);

    const leadId = String(booking.lead_id ?? "").trim();
    if (!leadId) return json({ error: "missing_lead_id" }, 500);

    // Load previous outcome values
    const { data: prev, error: prevErr } = await sb
      .from("booking_outcomes")
      .select(
        "id, attended_status, offer_made, offer_product_id, closed_on_call",
      )
      .eq("booking_id", bid)
      .eq("team_id", teamId)
      .maybeSingle();

    if (prevErr)
      return json({ error: "outcome_lookup_failed", pg: pgErr(prevErr) }, 500);

    const prevStatus = normStatus(prev?.attended_status);
    const prevOfferMade = !!prev?.offer_made;
    const prevClosedOnCall = !!prev?.closed_on_call;
    const prevOfferProductId = String(prev?.offer_product_id ?? "").trim();

    const updatePayload = {
      attended_status,
      offer_made,
      offer_product_id: offer_made ? offer_product_id : null,
      closed_on_call,
      notes,
      updated_at,
    };

    if (prev?.id) {
      const { error: updErr } = await sb
        .from("booking_outcomes")
        .update(updatePayload)
        .eq("id", String(prev.id));

      if (updErr) {
        return json(
          {
            error: "outcome_update_failed",
            message: "Postgres rejected UPDATE on booking_outcomes.",
            attempted: updatePayload,
            pg: pgErr(updErr),
          },
          500,
        );
      }
    } else {
      const insertPayload = {
        id: randomUUID(),
        booking_id: bid,
        team_id: teamId,
        lead_id: leadId,
        closer_user_id: userId,
        created_at: updated_at,
        ...updatePayload,
      };

      const { error: insErr } = await sb
        .from("booking_outcomes")
        .insert(insertPayload);

      if (insErr) {
        return json(
          {
            error: "outcome_insert_failed",
            message: "Postgres rejected INSERT into booking_outcomes.",
            attempted: insertPayload,
            pg: pgErr(insErr),
          },
          500,
        );
      }
    }

    // Timeline events + score audit events
    const timelineTasks: Promise<any>[] = [];
    const scoreEventTasks: Promise<any>[] = [];

    // Attendance changed
    if (prevStatus !== attended_status) {
      timelineTasks.push(
        insertLeadMessageSafe(sb, {
          team_id: teamId,
          lead_id: leadId,
          direction: "outbound",
          channel: "pipeline",
          body: `CALL_ATTENDANCE|${bid}|${prevStatus}|${attended_status}`,
          sender_profile_id: userId,
          user_id: userId,
          sent_at: updated_at,
          created_at: updated_at,
          event_type: "call_attendance_updated",
          event_data: {
            booking_id: bid,
            lead_id: leadId,
            previous_status: prevStatus,
            next_status: attended_status,
            updated_by: userId,
          },
        }),
      );

      if (attended_status === "attended" && prevStatus !== "attended") {
        scoreEventTasks.push(
          insertLeadScoreEventSafe(sb, {
            team_id: teamId,
            lead_id: leadId,
            event_type: "call_attended",
            reason: "Call marked as attended",
            source_table: "booking_outcomes",
            source_id: bid,
            metadata: {
              booking_id: bid,
              previous_status: prevStatus,
              next_status: attended_status,
              updated_by: userId,
            },
            created_at: updated_at,
          }),
        );
      }
    }

    // Offer changed
    const offerChanged =
      prevOfferMade !== offer_made || prevOfferProductId !== offer_product_id;

    if (offerChanged) {
      timelineTasks.push(
        insertLeadMessageSafe(sb, {
          team_id: teamId,
          lead_id: leadId,
          direction: "outbound",
          channel: "pipeline",
          body: `CALL_OFFER_MADE|${bid}|${offer_made ? "1" : "0"}|${offer_made ? offer_product_id : ""}`,
          sender_profile_id: userId,
          user_id: userId,
          sent_at: updated_at,
          created_at: updated_at,
          event_type: "call_offer_updated",
          event_data: {
            booking_id: bid,
            lead_id: leadId,
            offer_made,
            offer_product_id: offer_made ? offer_product_id : null,
            updated_by: userId,
          },
        }),
      );

      if (offer_made && !prevOfferMade) {
        scoreEventTasks.push(
          insertLeadScoreEventSafe(sb, {
            team_id: teamId,
            lead_id: leadId,
            event_type: "call_offer_made",
            reason: "Offer made on call",
            source_table: "booking_outcomes",
            source_id: bid,
            metadata: {
              booking_id: bid,
              offer_product_id,
              updated_by: userId,
            },
            created_at: updated_at,
          }),
        );
      }
    }

    // Closed changed
    if (prevClosedOnCall !== closed_on_call) {
      timelineTasks.push(
        insertLeadMessageSafe(sb, {
          team_id: teamId,
          lead_id: leadId,
          direction: "outbound",
          channel: "pipeline",
          body: `CALL_CLOSED_ON_CALL|${bid}|${closed_on_call ? "1" : "0"}|${offer_made ? offer_product_id : ""}`,
          sender_profile_id: userId,
          user_id: userId,
          sent_at: updated_at,
          created_at: updated_at,
          event_type: "call_closed_updated",
          event_data: {
            booking_id: bid,
            lead_id: leadId,
            closed_on_call,
            offer_product_id: offer_made ? offer_product_id : null,
            updated_by: userId,
          },
        }),
      );

      if (closed_on_call && !prevClosedOnCall) {
        scoreEventTasks.push(
          insertLeadScoreEventSafe(sb, {
            team_id: teamId,
            lead_id: leadId,
            event_type: "call_closed_on_call",
            reason: "Lead closed on call",
            source_table: "booking_outcomes",
            source_id: bid,
            metadata: {
              booking_id: bid,
              offer_product_id: offer_made ? offer_product_id : null,
              updated_by: userId,
            },
            created_at: updated_at,
          }),
        );
      }
    }

    await Promise.allSettled([...timelineTasks, ...scoreEventTasks]);

    try {
      await recomputeLeadScore(teamId, leadId);
    } catch (recomputeErr) {
      console.error(
        "[booking-outcome] recomputeLeadScore failed after outcome save",
        recomputeErr,
      );
    }

    return json({
      ok: true,
      mode: prev?.id ? "updated" : "inserted",
    });
  } catch (e: any) {
    return json(
      { error: "outcome_unhandled_failed", message: String(e?.message ?? e) },
      500,
    );
  }
}
