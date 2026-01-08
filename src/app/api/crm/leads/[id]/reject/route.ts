// src/app/api/crm/leads/[id]/reject/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function hasSetterRole(role: unknown): boolean {
  const arr = Array.isArray(role) ? role : [];
  return arr.map((r) => String(r).trim().toLowerCase()).includes("setter");
}

function readBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function jsonError(code: string, status: number, detail?: unknown) {
  return NextResponse.json(
    { ok: false, error: code, ...(detail !== undefined ? { detail } : null) },
    { status }
  );
}

async function readParamsId(ctx: any): Promise<string> {
  const p = await Promise.resolve(ctx?.params ?? {});
  return String(p?.id ?? "").trim();
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

export async function POST(req: Request, ctx: any) {
  try {
    const supabase = getSupabaseServerClient();

    // ---- leadId ----
    const idFromParams = await readParamsId(ctx);
    const idFromUrl = readIdFromUrl(req);
    const leadId = (idFromParams || idFromUrl).trim();

    if (!leadId) {
      return jsonError(
        "missing_lead_id",
        400,
        "No lead id found in route params or URL. Expected /api/crm/leads/:id/reject"
      );
    }
    if (!isUuid(leadId)) return jsonError("invalid_lead_id", 400, "Lead id must be a UUID.");

    // ---- body ----
    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.teamId ?? "").trim();
    if (!teamId) return jsonError("missing_team_id", 400);

    // ---- auth ----
    const token = readBearerToken(req);
    if (!token) return jsonError("missing_auth_token", 401);

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    const user = userRes?.user;
    if (userErr || !user) return jsonError("unauthorized", 401);

    const userId = user.id;

    // 1) requester must be a setter
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, team_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (meErr) return jsonError("profile_load_failed", 500, meErr.message);
    if (!me) return jsonError("profile_not_found", 403);
    if (String(me.team_id ?? "") !== teamId) return jsonError("team_mismatch", 403);
    if (!hasSetterRole(me.role)) return jsonError("not_a_setter", 403);

    // 2) load lead + ensure requester is current setter
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, team_id, setter_id, prospector_id, rejected_count, rejected_by")
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (leadErr) return jsonError("lead_load_failed", 500, leadErr.message);
    if (!lead) return jsonError("lead_not_found", 404);
    if (String(lead.setter_id ?? "") !== userId) return jsonError("not_current_setter", 403);

    // 3) choose a new setter
    const { data: teamProfiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("team_id", teamId);

    if (profilesErr) return jsonError("failed_to_load_setters", 500, profilesErr.message);

    const eligible = (teamProfiles ?? [])
      .filter((p) => p?.id && p.id !== userId)
      .filter((p) => hasSetterRole((p as any).role))
      .map((p) => p.id as string);

    if (eligible.length === 0) return jsonError("no_other_setter_available", 409);

    const newSetterId = eligible[Math.floor(Math.random() * eligible.length)];

    // 4) update lead reject tracking
    const nextCount = Number(lead.rejected_count ?? 0) + 1;
    const prevRejectedBy = Array.isArray(lead.rejected_by) ? (lead.rejected_by as string[]) : [];
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

    if (updateErr) return jsonError("lead_update_failed", 500, updateErr.message);

    // 5) Insert timeline event (KEEP LEGACY BODY FORMAT so UI doesn't break)
    // Body format: LEAD_REJECTED|<oldSetterId>|<newSetterId>|<count>
    const eventBody = `LEAD_REJECTED|${userId}|${newSetterId}|${nextCount}`;

    const { error: msgErr } = await supabase.from("lead_messages").insert({
      team_id: teamId,
      lead_id: leadId,

      // ✅ keep existing column (don’t break reads)
      sender_profile_id: userId,

      // ✅ new generic column (for future events + analytics)
      user_id: userId,

      direction: "outbound",
      channel: "pipeline",
      body: eventBody,
      sent_at: nowIso,

      // ✅ analytics
      event_type: "lead_rejected",
      event_data: {
        old_setter_id: userId,
        new_setter_id: newSetterId,
        rejection_count: nextCount,
        prospector_id: lead.prospector_id ?? null,
      },
    });

    if (msgErr) {
      return NextResponse.json(
        { ok: true, newSetterId, rejectedCount: nextCount, warning: "timeline_insert_failed" },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, newSetterId, rejectedCount: nextCount }, { status: 200 });
  } catch (e: any) {
    return jsonError("unexpected_error", 500, String(e?.message ?? e));
  }
}
