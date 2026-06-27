import { NextResponse } from "next/server";
import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import {
  getBearerToken,
  isUuid,
  pickFirstRouteParam,
} from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string | string[] }> };

function hasSetterRole(role: unknown): boolean {
  const values = Array.isArray(role) ? role : role == null ? [] : [role];
  return values
    .map((entry) =>
      String(entry ?? "")
        .trim()
        .toLowerCase(),
    )
    .includes("setter");
}

function jsonError(code: string, status: number, detail?: unknown) {
  return NextResponse.json(
    { ok: false, error: code, ...(detail !== undefined ? { detail } : {}) },
    { status },
  );
}

function readIdFromUrl(req: Request): string {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const leadsIdx = parts.findIndex((x) => x === "leads");
    if (leadsIdx >= 0) {
      const maybeId = parts[leadsIdx + 1] ?? "";
      const nextSeg = parts[leadsIdx + 2] ?? "";
      if (maybeId && nextSeg === "reject") return String(maybeId).trim();
    }
  } catch {}
  return "";
}

function buildLeadRejectedFallbackBody(args: {
  oldSetterId: string;
  newSetterId: string;
  rejectionCount: number;
}) {
  return `LEAD_REJECTED|${args.oldSetterId}|${args.newSetterId}|${args.rejectionCount}`;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const supabase = getCrmAdminClient();

    const { id } = await ctx.params;
    const leadId = (pickFirstRouteParam(id) || readIdFromUrl(req)).trim();

    if (!leadId || leadId === "undefined" || leadId === "null") {
      return jsonError(
        "missing_lead_id",
        400,
        "No lead id found in route params or URL. Expected /api/crm/leads/:id/reject",
      );
    }

    if (!isUuid(leadId)) {
      return jsonError("invalid_lead_id", 400, "Lead id must be a UUID.");
    }

    const body = await req.json().catch(() => ({}) as any);
    const teamId = String(body?.teamId ?? "").trim();

    if (!teamId) return jsonError("missing_team_id", 400);
    if (!isUuid(teamId)) return jsonError("invalid_team_id", 400);

    const token = getBearerToken(req);
    if (!token) return jsonError("missing_auth_token", 401);

    const { data: userRes, error: userErr } =
      await supabase.auth.getUser(token);
    const user = userRes?.user ?? null;
    const userId = user?.id ? String(user.id) : null;

    if (userErr || !userId) return jsonError("unauthorized", 401);

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, team_id, role, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    if (meErr) return jsonError("profile_load_failed", 500, meErr.message);
    if (!me) return jsonError("profile_not_found", 403);
    if (String(me.team_id ?? "") !== teamId) {
      return jsonError("team_mismatch", 403);
    }

    if (!hasSetterRole(me.role)) return jsonError("not_a_setter", 403);

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select(
        `
        id,
        team_id,
        setter_id,
        closer_id,
        prospector_id,
        stage_id,
        rejected_count,
        rejected_by
        `,
      )
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (leadErr) return jsonError("lead_load_failed", 500, leadErr.message);
    if (!lead) return jsonError("lead_not_found", 404);

    const oldSetterId = String((lead as any).setter_id ?? "").trim();
    if (oldSetterId !== userId) {
      return jsonError("not_current_setter", 403);
    }

    const { data: teamProfiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, role, first_name, last_name")
      .eq("team_id", teamId);

    if (profilesErr) {
      return jsonError("failed_to_load_setters", 500, profilesErr.message);
    }

    const eligible = (Array.isArray(teamProfiles) ? teamProfiles : [])
      .filter((profile: any) => profile?.id && String(profile.id) !== userId)
      .filter((profile: any) => hasSetterRole(profile?.role))
      .map((profile: any) => ({
        id: String(profile.id),
        firstName: String(profile.first_name ?? "").trim(),
        lastName: String(profile.last_name ?? "").trim(),
      }));

    if (eligible.length === 0) {
      return jsonError("no_other_setter_available", 409);
    }

    const nextSetter = eligible[Math.floor(Math.random() * eligible.length)];
    const newSetterId = nextSetter.id;
    const nextCount = Number((lead as any).rejected_count ?? 0) + 1;
    const previousRejectionCount = Math.max(nextCount - 1, 0);
    const prevRejectedBy = Array.isArray((lead as any).rejected_by)
      ? ((lead as any).rejected_by as string[])
      : [];
    const mergedRejectedBy = Array.from(new Set([...prevRejectedBy, userId]));
    const nowIso = new Date().toISOString();
    let stageName: string | null = null;

    if ((lead as any)?.stage_id) {
      const { data: stageRow } = await supabase
        .from("pipeline_stages")
        .select("name")
        .eq("team_id", teamId)
        .eq("id", String((lead as any).stage_id))
        .maybeSingle();
      stageName = stageRow?.name ? String(stageRow.name) : null;
    }

    const { error: updateErr } = await supabase
      .from("leads")
      .update({
        setter_id: newSetterId,
        rejected_count: nextCount,
        rejected_by: mergedRejectedBy,
        last_rejected_at: nowIso,
        last_rejected_by: userId,
      })
      .eq("id", leadId)
      .eq("team_id", teamId);

    if (updateErr) {
      return jsonError("lead_update_failed", 500, updateErr.message);
    }

    try {
      await recomputeLeadScore(teamId, leadId);
    } catch (err) {
      console.error("[lead-reject] recomputeLeadScore failed", err);
    }

    const fallbackBody = buildLeadRejectedFallbackBody({
      oldSetterId: userId,
      newSetterId,
      rejectionCount: nextCount,
    });
    const oldSetterName = `${String((me as any)?.first_name ?? "").trim()} ${String((me as any)?.last_name ?? "").trim()}`.trim();
    const newSetterName = `${nextSetter.firstName} ${nextSetter.lastName}`.trim();

    let timelineInsertFailed = false;

    try {
      const { error: msgErr } = await supabase.from("lead_messages").insert({
        team_id: teamId,
        lead_id: leadId,
        sender_profile_id: userId,
        user_id: userId,
        direction: "internal",
        channel: "pipeline",
        body: fallbackBody,
        sent_at: nowIso,
        created_at: nowIso,
        event_type: "lead_rejected",
        event_data: {
          lead_id: leadId,
          team_id: teamId,
          actor_profile_id: userId,
          old_setter_id: userId,
          new_setter_id: newSetterId,
          old_setter_name: oldSetterName || null,
          new_setter_name: newSetterName || null,
          rejection_count: nextCount,
          previous_rejection_count: previousRejectionCount,
          rejected_by_ids: mergedRejectedBy,
          prospector_id: (lead as any).prospector_id ?? null,
          closer_id: (lead as any).closer_id ?? null,
          stage_id: (lead as any).stage_id ?? null,
          stage: stageName,
        },
      } as any);

      if (msgErr) {
        timelineInsertFailed = true;
        console.error("[lead-reject] lead_messages insert error", {
          code: msgErr.code,
          message: msgErr.message,
          details: msgErr.details,
          hint: msgErr.hint,
        });
      }
    } catch (msgInsertError) {
      timelineInsertFailed = true;
      console.error(
        "[lead-reject] lead_messages insert failed unexpectedly",
        msgInsertError,
      );
    }

    if (timelineInsertFailed) {
      try {
        const { error: fallbackMsgErr } = await supabase
          .from("lead_messages")
          .insert({
            team_id: teamId,
            lead_id: leadId,
            sender_profile_id: userId,
            user_id: userId,
            direction: "internal",
            channel: "pipeline",
            body: fallbackBody,
            sent_at: nowIso,
            created_at: nowIso,
          } as any);

        if (fallbackMsgErr) {
          console.error("[lead-reject] fallback lead_messages insert error", {
            code: fallbackMsgErr.code,
            message: fallbackMsgErr.message,
            details: fallbackMsgErr.details,
            hint: fallbackMsgErr.hint,
          });

          return NextResponse.json(
        {
          ok: true,
          newSetterId,
          oldSetterName: oldSetterName || null,
          newSetterName: newSetterName || null,
          previousRejectedCount: previousRejectionCount,
          rejectedCount: nextCount,
          warning: "timeline_insert_failed",
        },
            { status: 200 },
          );
        }
      } catch (fallbackInsertError) {
        console.error(
          "[lead-reject] fallback lead_messages insert failed unexpectedly",
          fallbackInsertError,
        );

        return NextResponse.json(
          {
            ok: true,
            newSetterId,
            rejectedCount: nextCount,
            warning: "timeline_insert_failed",
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        newSetterId,
        oldSetterName: oldSetterName || null,
        newSetterName: newSetterName || null,
        previousRejectedCount: previousRejectionCount,
        rejectedCount: nextCount,
      },
      { status: 200 },
    );
  } catch (e: any) {
    return jsonError("unexpected_error", 500, String(e?.message ?? e));
  }
}
