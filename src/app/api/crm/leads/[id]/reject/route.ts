// src/app/api/crm/leads/[id]/reject/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

export const runtime = "nodejs";

function hasSetterRole(role: unknown): boolean {
  const arr = Array.isArray(role) ? role : [];
  return arr.map((r) => String(r).trim().toLowerCase()).includes("setter");
}

function readBearerToken(req: Request): string | null {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function jsonError(code: string, status: number, detail?: unknown) {
  return NextResponse.json(
    { ok: false, error: code, ...(detail !== undefined ? { detail } : {}) },
    { status },
  );
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("missing_supabase_url");
  if (!serviceKey) throw new Error("missing_service_role_key");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Next passes params as Promise
type RouteContext = { params: Promise<{ id: string | string[] }> };

function pickParam(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
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

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const supabase = getSupabaseServerClient();

    // ---- leadId ----
    const { id } = await ctx.params;
    const idFromParams = pickParam(id);
    const idFromUrl = readIdFromUrl(req);
    const leadId = (idFromParams || idFromUrl).trim();

    if (!leadId || leadId === "undefined" || leadId === "null") {
      return jsonError(
        "missing_lead_id",
        400,
        "No lead id found in route params or URL. Expected /api/crm/leads/:id/reject",
      );
    }

    if (!isUuid(leadId))
      return jsonError("invalid_lead_id", 400, "Lead id must be a UUID.");

    // ---- body ----
    const body = await req.json().catch(() => ({}) as any);
    const teamId = String(body?.teamId ?? "").trim();

    if (!teamId) return jsonError("missing_team_id", 400);
    if (!isUuid(teamId)) return jsonError("invalid_team_id", 400);

    // ---- auth ----
    const token = readBearerToken(req);
    if (!token) return jsonError("missing_auth_token", 401);

    const { data: userRes, error: userErr } =
      await supabase.auth.getUser(token);

    const user = userRes?.user ?? null;
    const userId = user?.id ? String(user.id) : null;

    if (userErr || !userId) return jsonError("unauthorized", 401);

    // ---- requester profile ----
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, team_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (meErr) return jsonError("profile_load_failed", 500, meErr.message);
    if (!me) return jsonError("profile_not_found", 403);
    if (String(me.team_id ?? "") !== teamId)
      return jsonError("team_mismatch", 403);

    if (!hasSetterRole(me.role)) return jsonError("not_a_setter", 403);

    // ---- load lead ----
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select(
        "id, team_id, setter_id, prospector_id, rejected_count, rejected_by",
      )
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (leadErr) return jsonError("lead_load_failed", 500, leadErr.message);
    if (!lead) return jsonError("lead_not_found", 404);

    if (String((lead as any).setter_id ?? "") !== userId)
      return jsonError("not_current_setter", 403);

    // ---- choose new setter ----
    const { data: teamProfiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("team_id", teamId);

    if (profilesErr)
      return jsonError("failed_to_load_setters", 500, profilesErr.message);

    const eligible = (Array.isArray(teamProfiles) ? teamProfiles : [])
      .filter((p: any) => p?.id && String(p.id) !== userId)
      .filter((p: any) => hasSetterRole(p?.role))
      .map((p: any) => String(p.id));

    if (eligible.length === 0)
      return jsonError("no_other_setter_available", 409);

    const newSetterId = eligible[Math.floor(Math.random() * eligible.length)];

    // ---- update lead reject tracking ----
    const nextCount = Number((lead as any).rejected_count ?? 0) + 1;

    const prevRejectedBy = Array.isArray((lead as any).rejected_by)
      ? ((lead as any).rejected_by as string[])
      : [];

    const mergedRejectedBy = Array.from(new Set([...prevRejectedBy, userId]));

    const nowIso = new Date().toISOString();

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

    if (updateErr)
      return jsonError("lead_update_failed", 500, updateErr.message);

    // ---- recompute lead score ----
    try {
      await recomputeLeadScore(teamId, leadId);
    } catch (err) {
      console.error("[lead-reject] recomputeLeadScore failed", err);
    }

    // ---- timeline event ----
    const eventBody = `LEAD_REJECTED|${userId}|${newSetterId}|${nextCount}`;

    const { error: msgErr } = await supabase.from("lead_messages").insert({
      team_id: teamId,
      lead_id: leadId,

      sender_profile_id: userId,
      user_id: userId,

      direction: "outbound",
      channel: "pipeline",

      body: eventBody,

      sent_at: nowIso,
      created_at: nowIso,

      event_type: "lead_rejected",
      event_data: {
        old_setter_id: userId,
        new_setter_id: newSetterId,
        rejection_count: nextCount,
        prospector_id: (lead as any).prospector_id ?? null,
      },
    });

    if (msgErr) {
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

    return NextResponse.json(
      {
        ok: true,
        newSetterId,
        rejectedCount: nextCount,
      },
      { status: 200 },
    );
  } catch (e: any) {
    return jsonError("unexpected_error", 500, String(e?.message ?? e));
  }
}
