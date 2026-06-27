import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import {
  getBookingInviteByToken,
  getBookingInviteState,
  isUniqueViolation,
} from "@/features/crm/server/booking-public";
import { isUuid } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import { serverEnv } from "@/lib/env/server";
import { readJsonBody } from "@/lib/http/request";
import { bookingLinkUrl } from "@/lib/publicUrl";

export const runtime = "nodejs";

type PostBody = {
  teamId?: unknown;
  leadId?: unknown;
  bookingLinkId?: unknown;
};

type BookingInviteStateInput = {
  used_at?: unknown;
  expires_at?: unknown;
};

function jsonError(
  error: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function jsonUnexpected(error: unknown) {
  const message = String((error as any)?.message ?? error);
  return NextResponse.json(
    {
      ok: false,
      error: "unexpected_booking_invite_error",
      message,
    },
    { status: 500 },
  );
}

function makeToken() {
  return randomBytes(24).toString("base64url");
}

function buildBookingInviteCreatedFallbackBody(args: { url: string }) {
  return `BOOKING_INVITE_CREATED|${args.url}`;
}

export async function GET(req: NextRequest) {
  try {
    const token = String(new URL(req.url).searchParams.get("t") ?? "").trim();
    if (!token) {
      return jsonError("missing_token", 400);
    }

    const admin = getCrmAdminClient();
    const result = await getBookingInviteByToken(admin, token);
    const invite = (result.data ?? null) as
      | (BookingInviteStateInput & Record<string, unknown>)
      | null;
    const queryError = result.error;

    if (queryError) {
      console.error("[crm-booking-invite] query error:", queryError);
      return jsonError("invite_query_failed", 500);
    }

    if (!invite) {
      return jsonError("invite_not_found", 404);
    }

    const state = getBookingInviteState(invite);
    if (state === "expired") {
      return jsonError("invite_expired", 410);
    }

    if (invite.expires_at) {
      const expiresAt = new Date(String(invite.expires_at));
      if (Number.isNaN(expiresAt.getTime())) {
        return jsonError("invite_invalid_expires_at", 500);
      }
    }

    return NextResponse.json({ ok: true, invite });
  } catch (error: unknown) {
    console.error("[crm-booking-invite] unexpected:", error);
    return jsonUnexpected(error);
  }
}

export async function POST(req: NextRequest) {
  const isDev = !serverEnv.isProduction();
  const timestamp = new Date().toISOString();

  try {
    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(req, admin);
    if (!auth.ok) {
      return jsonError(
        auth.reason,
        401,
        auth.detail ? { detail: auth.detail } : undefined,
      );
    }

    const body = await readJsonBody<PostBody>(req, {} as PostBody);
    const teamId = String(body.teamId ?? "").trim();
    const leadId = String(body.leadId ?? "").trim();
    const bookingLinkId = String(body.bookingLinkId ?? "").trim();

    if (!isUuid(teamId)) {
      return jsonError("invalid_teamId", 400);
    }
    if (!isUuid(leadId)) {
      return jsonError("invalid_leadId", 400);
    }
    if (!isUuid(bookingLinkId)) {
      return jsonError("invalid_bookingLinkId", 400);
    }

    try {
      const teamContext = await resolveCrmTeamContext({
        admin,
        userId: auth.userId,
        request: req,
        requestedTeamId: teamId,
      });

      if (teamContext.teamId !== teamId) {
        return jsonError("not_in_team", 403);
      }
    } catch (error: unknown) {
      const message = String((error as any)?.message ?? error);

      if (
        message === "missing_team" ||
        message === "missing_team_membership" ||
        message === "not_a_member_of_team"
      ) {
        return jsonError("not_in_team", 403);
      }

      if (message === "profile_lookup_failed") {
        return jsonError("profile_lookup_failed", 500);
      }

      throw error;
    }

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (leadError) {
      console.error("[booking-invite] lead lookup error:", leadError);
      return jsonError("lead_lookup_failed", 500);
    }

    if (!lead) {
      return jsonError("lead_not_found", 404);
    }

    const { data: link, error: linkError } = await admin
      .from("booking_links")
      .select("id, slug, deleted_at")
      .eq("id", bookingLinkId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (linkError) {
      console.error("[booking-invite] booking link lookup error:", linkError);
      return jsonError("booking_link_lookup_failed", 500);
    }

    if (!link) {
      return jsonError("booking_link_not_found", 404);
    }

    if ((link as any).deleted_at) {
      return jsonError("booking_link_deleted", 410);
    }

    const slug = String((link as any).slug ?? "").trim();
    if (!slug) {
      return jsonError("booking_link_missing_slug", 500);
    }

    const expiresAtIso = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    let inviteRow: { id: string; token: string } | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inviteToken = makeToken();

      const { data: invite, error } = await admin
        .from("booking_link_invites")
        .insert({
          team_id: teamId,
          booking_link_id: bookingLinkId,
          lead_id: leadId,
          token: inviteToken,
          expires_at: expiresAtIso,
          created_at: timestamp,
        })
        .select("id, token")
        .single();

      if (!error && invite?.id) {
        inviteRow = {
          id: String(invite.id),
          token: String(invite.token),
        };
        break;
      }

      lastError = error;
      if (!isUniqueViolation(error)) {
        break;
      }
    }

    if (!inviteRow) {
      console.error("[booking-invite] invite insert error:", lastError);

      return NextResponse.json(
        {
          ok: false,
          error: "invite_create_failed",
          ...(isDev
            ? {
                detail: {
                  code: (lastError as any)?.code ?? null,
                  message: (lastError as any)?.message ?? null,
                  details: (lastError as any)?.details ?? null,
                  hint: (lastError as any)?.hint ?? null,
                },
              }
            : {}),
        },
        { status: 500 },
      );
    }

    const url = `${bookingLinkUrl(slug)}?t=${encodeURIComponent(inviteRow.token)}`;

    try {
      const { error } = await admin.from("lead_messages").insert({
        team_id: teamId,
        lead_id: leadId,
        direction: "outbound",
        channel: "pipeline",
        body: buildBookingInviteCreatedFallbackBody({ url }),
        sender_profile_id: auth.userId,
        user_id: auth.userId,
        sent_at: timestamp,
        created_at: timestamp,
        event_type: "booking_invite_created",
        event_data: {
          team_id: teamId,
          lead_id: leadId,
          booking_link_id: bookingLinkId,
          booking_link_slug: slug,
          invite_id: inviteRow.id,
          url,
          expires_at: expiresAtIso,
          actor_profile_id: auth.userId,
        },
      } as any);

      if (error) {
        console.error(
          "[booking-invite] lead_messages insert error (non-fatal):",
          error,
        );
      }
    } catch (error) {
      console.error(
        "[booking-invite] lead_messages insert failed (non-fatal):",
        error,
      );
    }

    try {
      const { error } = await admin.from("lead_score_events").insert({
        team_id: teamId,
        lead_id: leadId,
        event_type: "booking_link_created",
        reason: "Unique booking link created",
        source_table: "booking_link_invites",
        source_id: inviteRow.id,
        metadata: {
          created_by: auth.userId,
          booking_link_id: bookingLinkId,
          booking_link_slug: slug,
          invite_id: inviteRow.id,
          url,
          expires_at: expiresAtIso,
        },
        created_at: timestamp,
      });

      if (error) {
        console.error(
          "[booking-invite] lead_score_events insert error (non-fatal):",
          error,
        );
      } else {
        try {
          await recomputeLeadScore(teamId, leadId);
        } catch (recomputeError) {
          console.error(
            "[booking-invite] recomputeLeadScore failed after booking link creation",
            recomputeError,
          );
        }
      }
    } catch (error) {
      console.error(
        "[booking-invite] lead_score_events insert failed (non-fatal):",
        error,
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
  } catch (error: unknown) {
    console.error("[booking-invite] unexpected:", error);
    return jsonUnexpected(error);
  }
}
