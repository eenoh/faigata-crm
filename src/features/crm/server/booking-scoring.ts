import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import type { AppSupabaseClient } from "@/lib/supabase/types";

export async function logBookingPageViewedOnce(args: {
  admin: AppSupabaseClient;
  teamId: string;
  leadId: string;
  inviteId: string;
  bookingLinkId: string;
  bookingLinkSlug: string;
  viewedDate: string;
  viewedTimeZone: string;
}) {
  const {
    admin,
    teamId,
    leadId,
    inviteId,
    bookingLinkId,
    bookingLinkSlug,
    viewedDate,
    viewedTimeZone,
  } = args;

  if (!teamId || !leadId || !inviteId) {
    return;
  }

  try {
    const existingEvent = await admin
      .from("lead_score_events")
      .select("id")
      .eq("team_id", teamId)
      .eq("lead_id", leadId)
      .eq("event_type", "booking_page_viewed")
      .eq("source_table", "booking_link_invites")
      .eq("source_id", inviteId)
      .limit(1);

    if (existingEvent.error) {
      console.error(
        "[availability] failed checking booking_page_viewed event",
        existingEvent.error,
      );
      return;
    }

    if (Array.isArray(existingEvent.data) && existingEvent.data.length > 0) {
      return;
    }

    const nowIso = new Date().toISOString();
    const insertResult = await admin.from("lead_score_events").insert({
      team_id: teamId,
      lead_id: leadId,
      event_type: "booking_page_viewed",
      reason: "Prospect viewed booking page",
      source_table: "booking_link_invites",
      source_id: inviteId,
      metadata: {
        booking_link_id: bookingLinkId,
        booking_link_slug: bookingLinkSlug,
        invite_id: inviteId,
        viewed_date: viewedDate,
        viewed_timezone: viewedTimeZone,
      },
      created_at: nowIso,
    });

    if (insertResult.error) {
      console.error(
        "[availability] failed inserting booking_page_viewed event",
        insertResult.error,
      );
      return;
    }

    try {
      await recomputeLeadScore(teamId, leadId);
    } catch (error) {
      console.error(
        "[availability] recomputeLeadScore failed after booking_page_viewed",
        error,
      );
    }
  } catch (error) {
    console.error("[availability] logBookingPageViewedOnce failed", error);
  }
}