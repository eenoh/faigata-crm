import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { isUuid } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ bookingId: string }> };

type Body = {
  teamId: string;
  attended_status: string;
  offer_made: boolean;
  offer_product_id?: string | null;
  closed_on_call: boolean;
  notes: string;
};

const ATTENDANCE = new Set([
  "unknown",
  "attended",
  "no_show",
  "cancelled",
  "rescheduled",
]);

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });
const nowIso = () => new Date().toISOString();
const PIPELINE_TIMELINE_DIRECTION = "outbound";

function normalizeAttendance(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ATTENDANCE.has(normalized) ? normalized : "unknown";
}

function pgError(error: any) {
  return {
    message: error?.message ?? null,
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
}

function buildAttendanceFallbackBody(args: {
  bookingId: string;
  previousStatus: string;
  nextStatus: string;
}) {
  return `CALL_ATTENDANCE|${args.bookingId}|${args.previousStatus}|${args.nextStatus}`;
}

function buildOfferFallbackBody(args: {
  bookingId: string;
  enabled: boolean;
  productId: string | null;
}) {
  return `CALL_OFFER_MADE|${args.bookingId}|${args.enabled ? "1" : "0"}|${args.productId ?? ""}`;
}

function buildClosedFallbackBody(args: {
  bookingId: string;
  enabled: boolean;
  productId: string | null;
}) {
  return `CALL_CLOSED_ON_CALL|${args.bookingId}|${args.enabled ? "1" : "0"}|${args.productId ?? ""}`;
}

async function insertLeadMessageSafe(
  admin: ReturnType<typeof getCrmAdminClient>,
  payload: Record<string, unknown>,
) {
  const { error } = await admin.from("lead_messages").insert(payload);
  if (error) {
    console.error("[booking-outcome] lead_messages insert failed", error);
  }
}

async function insertLeadScoreEventSafe(
  admin: ReturnType<typeof getCrmAdminClient>,
  payload: Record<string, unknown>,
) {
  const { error } = await admin.from("lead_score_events").insert(payload);
  if (error) {
    console.error("[booking-outcome] lead_score_events insert failed", error);
  }
}

export async function POST(request: Request, context: RouteCtx) {
  try {
    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(request, admin);
    if (!auth.ok) {
      return json(
        {
          error:
            auth.reason === "missing_auth"
              ? "missing_token"
              : "invalid_session",
        },
        401,
      );
    }

    const { bookingId } = await context.params;
    const normalizedBookingId = String(bookingId ?? "").trim();
    if (!isUuid(normalizedBookingId)) {
      return json({ error: "invalid_booking_id" }, 400);
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body) {
      return json({ error: "invalid_json_body" }, 400);
    }

    const teamId = String(body.teamId ?? "").trim();
    if (!isUuid(teamId)) {
      return json({ error: "invalid_team_id" }, 400);
    }

    await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request,
      requestedTeamId: teamId,
    });

    const attendedStatus = normalizeAttendance(body.attended_status);
    const offerMade = !!body.offer_made;
    const closedOnCall =
      attendedStatus === "attended" ? !!body.closed_on_call : false;
    let offerProductId = String(body.offer_product_id ?? "").trim();
    if (!offerMade) offerProductId = "";

    if (offerMade && !offerProductId) {
      return json(
        {
          error: "missing_offer_product_id",
          message: "Offer made requires selecting a product.",
        },
        400,
      );
    }

    const notes = String(body.notes ?? "");
    const updatedAt = nowIso();

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, lead_id, team_id")
      .eq("id", normalizedBookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return json(
        { error: "booking_not_found", pg: pgError(bookingError) },
        404,
      );
    }

    if (String(booking.team_id).toLowerCase() !== teamId.toLowerCase()) {
      return json({ error: "team_mismatch" }, 403);
    }

    const leadId = String(booking.lead_id ?? "").trim();
    if (!leadId) {
      return json({ error: "missing_lead_id" }, 500);
    }

    const { data: previous, error: previousError } = await admin
      .from("booking_outcomes")
      .select(
        "id, attended_status, offer_made, offer_product_id, closed_on_call",
      )
      .eq("booking_id", normalizedBookingId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (previousError) {
      return json(
        { error: "outcome_lookup_failed", pg: pgError(previousError) },
        500,
      );
    }

    const previousStatus = normalizeAttendance(previous?.attended_status);
    const previousOfferMade = !!previous?.offer_made;
    const previousClosedOnCall = !!previous?.closed_on_call;
    const previousOfferProductId = String(
      previous?.offer_product_id ?? "",
    ).trim();

    const updatePayload = {
      attended_status: attendedStatus,
      offer_made: offerMade,
      offer_product_id: offerMade ? offerProductId : null,
      closed_on_call: closedOnCall,
      notes,
      updated_at: updatedAt,
    };

    if (previous?.id) {
      const { error } = await admin
        .from("booking_outcomes")
        .update(updatePayload)
        .eq("id", String(previous.id));

      if (error) {
        return json(
          {
            error: "outcome_update_failed",
            message: "Postgres rejected UPDATE on booking_outcomes.",
            attempted: updatePayload,
            pg: pgError(error),
          },
          500,
        );
      }
    } else {
      const insertPayload = {
        id: randomUUID(),
        booking_id: normalizedBookingId,
        team_id: teamId,
        lead_id: leadId,
        closer_user_id: auth.userId,
        created_at: updatedAt,
        ...updatePayload,
      };

      const { error } = await admin
        .from("booking_outcomes")
        .insert(insertPayload);
      if (error) {
        return json(
          {
            error: "outcome_insert_failed",
            message: "Postgres rejected INSERT into booking_outcomes.",
            attempted: insertPayload,
            pg: pgError(error),
          },
          500,
        );
      }
    }

    const timelineTasks: Promise<unknown>[] = [];
    const scoreEventTasks: Promise<unknown>[] = [];

    if (previousStatus !== attendedStatus) {
      timelineTasks.push(
        insertLeadMessageSafe(admin, {
          team_id: teamId,
          lead_id: leadId,
          direction: PIPELINE_TIMELINE_DIRECTION,
          channel: "pipeline",
          body: buildAttendanceFallbackBody({
            bookingId: normalizedBookingId,
            previousStatus,
            nextStatus: attendedStatus,
          }),
          sender_profile_id: auth.userId,
          user_id: auth.userId,
          sent_at: updatedAt,
          created_at: updatedAt,
          event_type: "call_attendance_updated",
          event_data: {
            booking_id: normalizedBookingId,
            lead_id: leadId,
            actor_profile_id: auth.userId,
            previous_status: previousStatus,
            next_status: attendedStatus,
          },
        }),
      );

      if (attendedStatus === "attended" && previousStatus !== "attended") {
        scoreEventTasks.push(
          insertLeadScoreEventSafe(admin, {
            team_id: teamId,
            lead_id: leadId,
            event_type: "call_attended",
            reason: "Call marked as attended",
            source_table: "booking_outcomes",
            source_id: normalizedBookingId,
            metadata: {
              booking_id: normalizedBookingId,
              previous_status: previousStatus,
              next_status: attendedStatus,
              updated_by: auth.userId,
            },
            created_at: updatedAt,
          }),
        );
      }
    }

    const offerChanged =
      previousOfferMade !== offerMade ||
      previousOfferProductId !== offerProductId;

    if (offerChanged) {
      timelineTasks.push(
        insertLeadMessageSafe(admin, {
          team_id: teamId,
          lead_id: leadId,
          direction: PIPELINE_TIMELINE_DIRECTION,
          channel: "pipeline",
          body: buildOfferFallbackBody({
            bookingId: normalizedBookingId,
            enabled: offerMade,
            productId: offerMade ? offerProductId : null,
          }),
          sender_profile_id: auth.userId,
          user_id: auth.userId,
          sent_at: updatedAt,
          created_at: updatedAt,
          event_type: "call_offer_updated",
          event_data: {
            booking_id: normalizedBookingId,
            lead_id: leadId,
            actor_profile_id: auth.userId,
            enabled: offerMade,
            product_id: offerMade ? offerProductId : null,
          },
        }),
      );

      if (offerMade && !previousOfferMade) {
        scoreEventTasks.push(
          insertLeadScoreEventSafe(admin, {
            team_id: teamId,
            lead_id: leadId,
            event_type: "call_offer_made",
            reason: "Offer made on call",
            source_table: "booking_outcomes",
            source_id: normalizedBookingId,
            metadata: {
              booking_id: normalizedBookingId,
              offer_product_id: offerProductId,
              updated_by: auth.userId,
            },
            created_at: updatedAt,
          }),
        );
      }
    }

    if (previousClosedOnCall !== closedOnCall) {
      timelineTasks.push(
        insertLeadMessageSafe(admin, {
          team_id: teamId,
          lead_id: leadId,
          direction: PIPELINE_TIMELINE_DIRECTION,
          channel: "pipeline",
          body: buildClosedFallbackBody({
            bookingId: normalizedBookingId,
            enabled: closedOnCall,
            productId: offerMade ? offerProductId : null,
          }),
          sender_profile_id: auth.userId,
          user_id: auth.userId,
          sent_at: updatedAt,
          created_at: updatedAt,
          event_type: "call_closed_updated",
          event_data: {
            booking_id: normalizedBookingId,
            lead_id: leadId,
            actor_profile_id: auth.userId,
            enabled: closedOnCall,
            product_id: offerMade ? offerProductId : null,
          },
        }),
      );

      if (closedOnCall && !previousClosedOnCall) {
        scoreEventTasks.push(
          insertLeadScoreEventSafe(admin, {
            team_id: teamId,
            lead_id: leadId,
            event_type: "call_closed_on_call",
            reason: "Lead closed on call",
            source_table: "booking_outcomes",
            source_id: normalizedBookingId,
            metadata: {
              booking_id: normalizedBookingId,
              offer_product_id: offerMade ? offerProductId : null,
              updated_by: auth.userId,
            },
            created_at: updatedAt,
          }),
        );
      }
    }

    await Promise.allSettled([...timelineTasks, ...scoreEventTasks]);

    try {
      await recomputeLeadScore(teamId, leadId);
    } catch (error) {
      console.error(
        "[booking-outcome] recomputeLeadScore failed after outcome save",
        error,
      );
    }

    return json({ ok: true, mode: previous?.id ? "updated" : "inserted" });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (message === "not_a_member_of_team") {
      return json({ error: "forbidden" }, 403);
    }

    return json({ error: "outcome_unhandled_failed", message }, 500);
  }
}
