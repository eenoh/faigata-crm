// src/modules/crm/scoring/recomputeLeadScore.ts

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeLeadScore } from "./scoreLead";
import type { LeadScoringConfig } from "./types";

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const DAY_MS = 24 * 60 * 60 * 1000;

// booking link created -> +4
const BOOKING_LINK_CREATED_BONUS = 4;

// booking page viewed -> +4
const BOOKING_PAGE_VIEWED_BONUS = 4;

// booked call -> +8
const CALL_BOOKED_BONUS = 8;

// call attended -> +10
const CALL_ATTENDED_BONUS = 10;

// offer made -> +14
const CALL_OFFER_MADE_BONUS = 14;

// closed on call -> +20
const CALL_CLOSED_ON_CALL_BONUS = 20;

// no-show -> -12
const CALL_NO_SHOW_PENALTY = -12;

// cancelled call -> -8
const CALL_CANCELLED_PENALTY = -8;

// lead rejected -> -12
const LEAD_REJECTED_PENALTY = -12;

// conversational reply volume (lifetime)
const INBOUND_REPLY_1_BONUS = 1;
const INBOUND_REPLY_3_BONUS = 3;
const INBOUND_REPLY_5_BONUS = 6;
const INBOUND_REPLY_10_BONUS = 10;

// responsiveness
const REPLIED_WITHIN_1_DAY_BONUS = 4;
const REPLIED_WITHIN_3_DAYS_BONUS = 2;
const IGNORED_7_DAYS_PENALTY = -6;

// source quality
const SOURCE_REFERRAL_BONUS = 6;
const SOURCE_INBOUND_BONUS = 5;
const SOURCE_PARTNER_BONUS = 4;
const SOURCE_OUTBOUND_BONUS = 1;
const SOURCE_PURCHASED_PENALTY = -4;

/**
 * Cap the non-field part separately.
 * Since field score max is handled in scoreLead.ts,
 * this keeps the activity side bounded and predictable.
 */
const ACTIVITY_SCORE_MIN = -25;
const ACTIVITY_SCORE_MAX = 65;

const BOOKING_LINK_CREATED_EVENT_TYPES = [
  "booking_link_created",
  "booking_invite_created", // legacy fallback
] as const;

const CALL_BOOKED_EVENT_TYPES = ["call_booked"] as const;
const BOOKING_PAGE_VIEWED_EVENT_TYPES = ["booking_page_viewed"] as const;

type ScoringMessageRow = {
  direction: string | null;
  channel: string | null;
  sent_at: string | null;
};

type LatestBookingRow = {
  id: string;
  start_at: string | null;
  created_at: string | null;
};

type BookingOutcomeRow = {
  booking_id: string;
  attended_status: string | null;
  offer_made: boolean | null;
  closed_on_call: boolean | null;
  updated_at?: string | null;
};

type AnyBookingOutcomeRow = {
  attended_status: string | null;
  offer_made: boolean | null;
  closed_on_call: boolean | null;
};

function isConversationalMessage(m: ScoringMessageRow) {
  const direction = String(m.direction ?? "")
    .trim()
    .toLowerCase();

  const channel = String(m.channel ?? "")
    .trim()
    .toLowerCase();

  if (direction !== "inbound" && direction !== "outbound") return false;

  // exclude system / pipeline activity from conversation scoring
  if (channel === "pipeline" || channel === "crm") return false;

  return true;
}

function getLifetimeInboundReplyBonus(messages: ScoringMessageRow[]) {
  const inboundCount = messages.reduce((count, m) => {
    const direction = String(m.direction ?? "")
      .trim()
      .toLowerCase();
    return count + (direction === "inbound" ? 1 : 0);
  }, 0);

  if (inboundCount >= 10) return INBOUND_REPLY_10_BONUS;
  if (inboundCount >= 5) return INBOUND_REPLY_5_BONUS;
  if (inboundCount >= 3) return INBOUND_REPLY_3_BONUS;
  if (inboundCount >= 1) return INBOUND_REPLY_1_BONUS;
  return 0;
}

function getResponsivenessBonus(messages: ScoringMessageRow[]) {
  const ordered = [...messages]
    .filter((m) => m.sent_at && Number.isFinite(Date.parse(String(m.sent_at))))
    .sort(
      (a, b) =>
        Date.parse(String(a.sent_at ?? "")) -
        Date.parse(String(b.sent_at ?? "")),
    );

  const latestOutbound = [...ordered].reverse().find(
    (m) =>
      String(m.direction ?? "")
        .trim()
        .toLowerCase() === "outbound",
  );

  if (!latestOutbound?.sent_at) return 0;

  const outboundTs = Date.parse(String(latestOutbound.sent_at));
  if (!Number.isFinite(outboundTs)) return 0;

  const firstInboundAfterOutbound = ordered.find((m) => {
    const direction = String(m.direction ?? "")
      .trim()
      .toLowerCase();

    if (direction !== "inbound" || !m.sent_at) return false;

    const ts = Date.parse(String(m.sent_at));
    return Number.isFinite(ts) && ts > outboundTs;
  });

  if (firstInboundAfterOutbound?.sent_at) {
    const inboundTs = Date.parse(String(firstInboundAfterOutbound.sent_at));
    const diffMs = inboundTs - outboundTs;

    if (diffMs <= DAY_MS) return REPLIED_WITHIN_1_DAY_BONUS;
    if (diffMs <= 3 * DAY_MS) return REPLIED_WITHIN_3_DAYS_BONUS;
    return 0;
  }

  const ageMs = Date.now() - outboundTs;
  if (ageMs >= 7 * DAY_MS) return IGNORED_7_DAYS_PENALTY;

  return 0;
}

function getSourceQualityBonus(sourceCategory: unknown) {
  const category = String(sourceCategory ?? "")
    .trim()
    .toLowerCase();

  if (category === "referral") return SOURCE_REFERRAL_BONUS;
  if (category === "inbound") return SOURCE_INBOUND_BONUS;
  if (category === "partner") return SOURCE_PARTNER_BONUS;
  if (category === "outbound") return SOURCE_OUTBOUND_BONUS;
  if (category === "purchased") return SOURCE_PURCHASED_PENALTY;

  return 0;
}

function normalizeOutcomeStatus(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();

  if (
    s === "attended" ||
    s === "no_show" ||
    s === "cancelled" ||
    s === "rescheduled" ||
    s === "unknown"
  ) {
    return s;
  }

  return "unknown";
}

async function hasLeadScoreEvent(args: {
  teamId: string;
  leadId: string;
  eventTypes: readonly string[];
}) {
  const { teamId, leadId, eventTypes } = args;

  const { data, error } = await supabaseAdmin
    .from("lead_score_events")
    .select("id,event_type")
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .in("event_type", [...eventTypes])
    .limit(1);

  if (error) {
    console.error("[Scoring] Failed to load lead_score_events", {
      teamId,
      leadId,
      eventTypes,
      error,
    });
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function hasAnyBookingLinkInvite(teamId: string, leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("booking_link_invites")
    .select("id")
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .limit(1);

  if (error) {
    console.error("[Scoring] Failed to load booking_link_invites", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function hasAnyBookedCall(teamId: string, leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .limit(1);

  if (error) {
    console.error("[Scoring] Failed to load bookings", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function getLatestBooking(teamId: string, leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id,start_at,created_at")
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .order("start_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Scoring] Failed to load latest booking", error);
    return null;
  }

  return (data ?? null) as LatestBookingRow | null;
}

async function getLatestBookingOutcome(teamId: string, bookingId: string) {
  const { data, error } = await supabaseAdmin
    .from("booking_outcomes")
    .select(
      "booking_id, attended_status, offer_made, closed_on_call, updated_at",
    )
    .eq("team_id", teamId)
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) {
    console.error("[Scoring] Failed to load latest booking outcome", error);
    return null;
  }

  return (data ?? null) as BookingOutcomeRow | null;
}

async function getAnyBookingOutcomes(teamId: string, leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("booking_outcomes")
    .select("attended_status, offer_made, closed_on_call")
    .eq("team_id", teamId)
    .eq("lead_id", leadId);

  if (error) {
    console.error("[Scoring] Failed to load booking outcomes", error);
    return [] as AnyBookingOutcomeRow[];
  }

  return ((data as AnyBookingOutcomeRow[] | null) ?? []).map((row) => ({
    attended_status: row.attended_status ?? null,
    offer_made: !!row.offer_made,
    closed_on_call: !!row.closed_on_call,
  }));
}

export async function recomputeLeadScore(
  teamId: string,
  leadId: string,
): Promise<void> {
  // 1) Load lead
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select(
      "id, stage, stage_id, custom_values, source_category, rejected_count",
    )
    .eq("team_id", teamId)
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    console.error("[Scoring] Failed to load lead for scoring", leadError);
    return;
  }

  // 2) Load scoring config
  const { data: cfgRow, error: cfgError } = await supabaseAdmin
    .from("lead_scoring_configs")
    .select("config")
    .eq("team_id", teamId)
    .maybeSingle();

  if (cfgError && cfgError.code !== "PGRST116") {
    console.error("[Scoring] Failed to load scoring config", cfgError);
  }

  const config = (cfgRow?.config ?? null) as LeadScoringConfig | null;

  // 3) Field-based score only
  const fieldScore =
    computeLeadScore(
      {
        stage: String((lead as any).stage ?? ""),
        custom_values: (lead as any).custom_values ?? {},
      },
      config,
    )?.score ?? 0;

  // 4) Load all messages needed for conversational scoring
  const { data: allMsgs, error: msgError } = await supabaseAdmin
    .from("lead_messages")
    .select("direction, channel, sent_at")
    .eq("team_id", teamId)
    .eq("lead_id", leadId);

  if (msgError) {
    console.error("[Scoring] Failed to load messages for scoring", msgError);
  }

  const conversationalMessages = (
    (allMsgs as ScoringMessageRow[] | null) ?? []
  ).filter(isConversationalMessage);

  const inboundReplyBonus = getLifetimeInboundReplyBonus(
    conversationalMessages,
  );

  const responsivenessBonus = getResponsivenessBonus(conversationalMessages);

  const sourceQualityBonus = getSourceQualityBonus(
    (lead as any).source_category,
  );

  const rejectedCount = Number((lead as any).rejected_count ?? 0);
  const leadRejectedPenalty = rejectedCount > 0 ? LEAD_REJECTED_PENALTY : 0;

  // Explicitly disabled: pipeline logs/stage changes must not affect score
  const pipelineBonus = 0;

  /**
   * Fused logic:
   * - booking_link_created: prefer stable invite existence, fallback to score event
   * - booking_page_viewed: use score event
   * - call_booked: prefer stable bookings existence, fallback to score event
   * - outcomes: prefer latest booking outcome (stable), fallback to any historical
   *   outcome rows if latest row is missing
   */

  // 5) Booking-link-created bonus
  const hasBookingLinkInvite = await hasAnyBookingLinkInvite(teamId, leadId);
  const hasBookingLinkCreatedEvent = await hasLeadScoreEvent({
    teamId,
    leadId,
    eventTypes: BOOKING_LINK_CREATED_EVENT_TYPES,
  });

  const hasBookingLinkCreated =
    hasBookingLinkInvite || hasBookingLinkCreatedEvent;

  const bookingLinkCreatedBonus = hasBookingLinkCreated
    ? BOOKING_LINK_CREATED_BONUS
    : 0;

  // 6) Booking-page-viewed bonus
  const hasBookingPageViewed = await hasLeadScoreEvent({
    teamId,
    leadId,
    eventTypes: BOOKING_PAGE_VIEWED_EVENT_TYPES,
  });

  const bookingPageViewedBonus = hasBookingPageViewed
    ? BOOKING_PAGE_VIEWED_BONUS
    : 0;

  // 7) Call-booked bonus
  const hasBookedCallRecord = await hasAnyBookedCall(teamId, leadId);
  const hasCallBookedEvent = await hasLeadScoreEvent({
    teamId,
    leadId,
    eventTypes: CALL_BOOKED_EVENT_TYPES,
  });

  const hasCallBooked = hasBookedCallRecord || hasCallBookedEvent;
  const callBookedBonus = hasCallBooked ? CALL_BOOKED_BONUS : 0;

  // 8) Current call outcome bonuses
  const latestBooking = await getLatestBooking(teamId, leadId);
  const latestOutcome = latestBooking?.id
    ? await getLatestBookingOutcome(teamId, latestBooking.id)
    : null;

  let latestAttendanceStatus = normalizeOutcomeStatus(
    latestOutcome?.attended_status,
  );

  let callAttendedBonus =
    latestAttendanceStatus === "attended" ? CALL_ATTENDED_BONUS : 0;

  let callNoShowPenalty =
    latestAttendanceStatus === "no_show" ? CALL_NO_SHOW_PENALTY : 0;

  let callCancelledPenalty =
    latestAttendanceStatus === "cancelled" ? CALL_CANCELLED_PENALTY : 0;

  let callOfferMadeBonus =
    latestAttendanceStatus === "attended" && latestOutcome?.offer_made
      ? CALL_OFFER_MADE_BONUS
      : 0;

  let callClosedOnCallBonus =
    latestAttendanceStatus === "attended" && latestOutcome?.closed_on_call
      ? CALL_CLOSED_ON_CALL_BONUS
      : 0;

  // Fallback to old behavior only if latest outcome gives us nothing useful
  const hasLatestOutcomeSignals =
    !!latestOutcome &&
    (latestAttendanceStatus !== "unknown" ||
      !!latestOutcome.offer_made ||
      !!latestOutcome.closed_on_call);

  if (!hasLatestOutcomeSignals) {
    const rows = await getAnyBookingOutcomes(teamId, leadId);

    const hasAttended = rows.some(
      (r) => normalizeOutcomeStatus(r.attended_status) === "attended",
    );

    const hasNoShow = rows.some(
      (r) => normalizeOutcomeStatus(r.attended_status) === "no_show",
    );

    const hasCancelled = rows.some(
      (r) => normalizeOutcomeStatus(r.attended_status) === "cancelled",
    );

    const hasOfferMade = rows.some((r) => !!r.offer_made);
    const hasClosedOnCall = rows.some((r) => !!r.closed_on_call);

    latestAttendanceStatus = hasAttended
      ? "attended"
      : hasNoShow
        ? "no_show"
        : hasCancelled
          ? "cancelled"
          : "unknown";

    callAttendedBonus = hasAttended ? CALL_ATTENDED_BONUS : 0;
    callNoShowPenalty = hasNoShow ? CALL_NO_SHOW_PENALTY : 0;
    callCancelledPenalty = hasCancelled ? CALL_CANCELLED_PENALTY : 0;
    callOfferMadeBonus = hasOfferMade ? CALL_OFFER_MADE_BONUS : 0;
    callClosedOnCallBonus = hasClosedOnCall ? CALL_CLOSED_ON_CALL_BONUS : 0;
  }

  const rawActivityScore =
    inboundReplyBonus +
    responsivenessBonus +
    sourceQualityBonus +
    pipelineBonus +
    bookingLinkCreatedBonus +
    bookingPageViewedBonus +
    callBookedBonus +
    callAttendedBonus +
    callNoShowPenalty +
    callCancelledPenalty +
    callOfferMadeBonus +
    callClosedOnCallBonus +
    leadRejectedPenalty;

  const activityScore = clamp(
    Math.round(rawActivityScore),
    ACTIVITY_SCORE_MIN,
    ACTIVITY_SCORE_MAX,
  );

  const finalScore = clamp(Math.round(fieldScore + activityScore), 0, 100);

  console.log("[Scoring] recomputeLeadScore breakdown", {
    teamId,
    leadId,
    fieldScore,
    inboundReplyBonus,
    responsivenessBonus,
    sourceQualityBonus,
    hasBookingLinkInvite,
    hasBookingLinkCreatedEvent,
    bookingLinkCreatedBonus,
    hasBookingPageViewed,
    bookingPageViewedBonus,
    hasBookedCallRecord,
    hasCallBookedEvent,
    callBookedBonus,
    latestBookingId: latestBooking?.id ?? null,
    latestAttendanceStatus,
    callAttendedBonus,
    callNoShowPenalty,
    callCancelledPenalty,
    callOfferMadeBonus,
    callClosedOnCallBonus,
    leadRejectedPenalty,
    rawActivityScore,
    activityScore,
    finalScore,
  });

  // 9) Store
  const updatePayload = {
    score: finalScore,
    score_updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from("leads")
    .update(updatePayload)
    .eq("team_id", teamId)
    .eq("id", leadId);

  if (updateError) {
    console.error("[Scoring] Failed to update lead score", updateError);
  }
}
