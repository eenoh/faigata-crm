// src/app/api/crm/dashboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* -------------------- domain types -------------------- */

type Bucket = "day" | "week" | "month";
type Scope = "team" | "me";
type Role = "admin" | "manager" | "member";

type FunnelStage = {
  id: string;
  name: string;
  position: number | null;
  leadCount: number;
};

type FunnelEdge = {
  fromStageId: string;
  toStageId: string;
  fromStageName: string;
  toStageName: string;
  label: string;
  targetRate: number | null;
  actualConversionRate: number | null;
  dropOffCount: number;
  dropOffRate: number | null;
};

type DashboardActivityRow = Record<string, unknown>;

/* -------------------- DB row shapes (local TS only) -------------------- */

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role: string | null;
  joined_at: string | null;
};

type PipelineStageRow = {
  id: string;
  team_id: string;
  name: string;
  position: number;
};

type ConversionMetricRow = {
  id: string;
  team_id: string;
  label: string | null;
  from_stage_id: string;
  to_stage_id: string;
  position: number;
  target_rate: number | null;
};

type LeadRow = {
  id: string;
  team_id: string;
  stage_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  created_at: string;
  score: number | null;
  // NOTE: installs differ; your DB has lead_name (NOT name)
  lead_name: string | null;
  name: string | null;
};

type LeadMessageRow = {
  id: string;
  team_id: string;
  lead_id: string;
  sender_profile_id: string | null;
  direction: string | null;
  channel: string | null;
  sent_at: string | null;
};

type BookingRow = {
  id: string;
  team_id: string;
  lead_id: string | null;
  invitee_first_name: string | null;
  invitee_email: string | null;
  booking_link_id: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
};

type BookingOutcomeRow = {
  id: string;
  team_id: string;
  closer_user_id: string | null;
  attended_status: string | null;
  closed_on_call: boolean | null;
  created_at: string | null;
};

/* -------------------- helpers -------------------- */

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isBucket(v: string): v is Bucket {
  return v === "day" || v === "week" || v === "month";
}
function isScope(v: string): v is Scope {
  return v === "team" || v === "me";
}

function normalizeRole(v: unknown): Role {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "admin") return "admin";
  if (s === "manager") return "manager";
  return "member";
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("missing_supabase_url");
  if (!serviceKey) throw new Error("missing_service_role_key");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Multi-workspace:
 * - accept ?teamId=
 * - else use first team_members row (earliest joined_at)
 */
async function resolveTeamContext(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  req: Request
): Promise<{ teamId: string; role: Role; roles: Role[]; isManagerOrAdmin: boolean }> {
  const url = new URL(req.url);
  const teamIdParam = (url.searchParams.get("teamId") ?? "").trim() || null;

  if (teamIdParam) {
    const { data, error } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .eq("team_id", teamIdParam)
      .maybeSingle();

    if (error) throw new Error("team_member_lookup_failed");

    const tm = (data as Pick<TeamMemberRow, "team_id" | "role"> | null) ?? null;
    if (!tm?.team_id) throw new Error("not_a_member_of_team");

    const role = normalizeRole(tm.role);
    return {
      teamId: String(tm.team_id),
      role,
      roles: [role],
      isManagerOrAdmin: role === "admin" || role === "manager",
    };
  }

  const { data, error } = await admin
    .from("team_members")
    .select("team_id, role, joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("team_member_lookup_failed");

  const firstTm = (data as Pick<TeamMemberRow, "team_id" | "role" | "joined_at"> | null) ?? null;
  if (!firstTm?.team_id) throw new Error("missing_team_membership");

  const role = normalizeRole(firstTm.role);
  return {
    teamId: String(firstTm.team_id),
    role,
    roles: [role],
    isManagerOrAdmin: role === "admin" || role === "manager",
  };
}

/**
 * Leads schema differs across installs.
 * PostgREST fails the whole query if you select a non-existent column,
 * so we attempt "best" selects and fall back to minimal.
 *
 * IMPORTANT: your DB DOES NOT have leads.name, so we try lead_name first.
 */
async function loadRecentLeadsWithFallback(args: {
  admin: ReturnType<typeof supabaseAdmin>;
  applyLeadScope: (q: any) => any;
}): Promise<{ rows: any[]; usedSelect: string }> {
  const { admin, applyLeadScope } = args;

  const selectCandidates = [
    // Your schema (lead_name exists)
    "id, lead_name, stage_id, created_at, score",
    "id, lead_name, stage_id, created_at",

    // Other schema variants (name exists)
    "id, name, stage_id, created_at, score",
    "id, name, stage_id, created_at",

    // Minimum guaranteed fields
    "id, stage_id, created_at",
  ];

  let lastErr: any = null;

  for (const sel of selectCandidates) {
    const q = applyLeadScope(
      admin.from("leads").select(sel).order("created_at", { ascending: false }).limit(8)
    );

    const { data, error } = await q;
    if (!error) return { rows: (data ?? []) as any[], usedSelect: sel };

    lastErr = error;
  }

  const e = new Error("recent_leads_failed");
  (e as any).details = lastErr ?? "recent_leads_select_failed";
  throw e;
}

/* -------------------- unified GET -------------------- */

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("missing_auth", 401);

    const url = new URL(req.url);
    const bucketRaw = String(url.searchParams.get("bucket") ?? "week").trim();
    const daysRaw = Number(url.searchParams.get("days") ?? "120");
    const scopeRaw = String(url.searchParams.get("scope") ?? "team").trim();

    if (!isBucket(bucketRaw)) return jsonError("invalid_bucket", 400);
    if (!Number.isFinite(daysRaw) || daysRaw < 7 || daysRaw > 365) return jsonError("invalid_days", 400);
    if (!isScope(scopeRaw)) return jsonError("invalid_scope", 400);

    const bucket: Bucket = bucketRaw;
    const days = daysRaw;
    const requestedScope: Scope = scopeRaw;

    const admin = supabaseAdmin();

    // validate token => user
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const user = userRes?.user ?? null;
    if (userErr || !user) return jsonError("invalid_session", 401, userErr?.message);

    const userId = String(user.id);

    // team/role from team_members
    const { teamId, role, roles, isManagerOrAdmin } = await resolveTeamContext(admin, userId, req);

    // scope enforcement
    const effectiveScope: Scope = isManagerOrAdmin ? requestedScope : "me";

    // date windows
    const now = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const from7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // RBAC helper: leads visible
    const applyLeadScope = (q: any) => {
      let qq = q.eq("team_id", teamId);
      if (effectiveScope === "me") {
        qq = qq.or(`setter_id.eq.${userId},closer_id.eq.${userId}`);
      }
      return qq;
    };

    // ---------------------------
    // Stages + Metrics (shared)
    // ---------------------------
    const [stagesRes, metricsRes] = await Promise.all([
      admin
        .from("pipeline_stages")
        .select("id, team_id, name, position")
        .eq("team_id", teamId)
        .order("position", { ascending: true }),
      admin
        .from("conversion_metrics")
        .select("id, team_id, label, from_stage_id, to_stage_id, position, target_rate")
        .eq("team_id", teamId)
        .order("position", { ascending: true }),
    ]);

    if (stagesRes.error) return jsonError("stages_load_failed", 500, stagesRes.error);
    if (metricsRes.error) return jsonError("metrics_load_failed", 500, metricsRes.error);

    const stages = ((stagesRes.data ?? []) as PipelineStageRow[]) ?? [];
    const metrics = ((metricsRes.data ?? []) as ConversionMetricRow[]) ?? [];

    const stageIdToName = new Map<string, string>();
    for (const s of stages) stageIdToName.set(String(s.id), String(s.name));

    // ---------------------------
    // Funnel
    // ---------------------------
    const funnelPromise = (async () => {
      const leadsQuery = applyLeadScope(
        admin.from("leads").select("id, team_id, stage_id, setter_id, closer_id")
      );

      const { data, error } = await leadsQuery;
      if (error) throw new Error("leads_load_failed");

      const safeLeads = ((data ?? []) as Pick<LeadRow, "id" | "stage_id" | "setter_id" | "closer_id">[]) ?? [];
      const stageIdToCount = new Map<string, number>();

      for (const l of safeLeads) {
        const sid = l.stage_id ? String(l.stage_id) : "";
        if (!sid) continue;
        stageIdToCount.set(sid, (stageIdToCount.get(sid) ?? 0) + 1);
      }

      const funnelStages: FunnelStage[] = stages.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        position: (s.position ?? null) as number | null,
        leadCount: stageIdToCount.get(String(s.id)) ?? 0,
      }));

      const metricByPair = new Map<string, { label: string; target_rate: number | null }>();
      for (const m of metrics) {
        metricByPair.set(`${m.from_stage_id}__${m.to_stage_id}`, {
          label: String(m.label ?? ""),
          target_rate: m.target_rate == null ? null : Number(m.target_rate),
        });
      }

      const edges: FunnelEdge[] = [];
      for (let i = 0; i < funnelStages.length - 1; i++) {
        const fromS = funnelStages[i];
        const toS = funnelStages[i + 1];

        const fromCount = fromS.leadCount;
        const toCount = toS.leadCount;

        const metric = metricByPair.get(`${fromS.id}__${toS.id}`);
        const label = metric?.label?.trim() ? metric.label.trim() : `${fromS.name} → ${toS.name}`;
        const targetRate = metric?.target_rate ?? null;

        const actualConversionRate = fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : null;
        const dropOffCount = Math.max(0, fromCount - toCount);
        const dropOffRate = fromCount > 0 ? Math.round(((fromCount - toCount) / fromCount) * 1000) / 10 : null;

        edges.push({
          fromStageId: fromS.id,
          toStageId: toS.id,
          fromStageName: fromS.name,
          toStageName: toS.name,
          label,
          targetRate,
          actualConversionRate,
          dropOffCount,
          dropOffRate,
        });
      }

      return { leadTotal: safeLeads.length, stages: funnelStages, edges };
    })();

    // ---------------------------
    // Activity (RPC)
    // ---------------------------
    const activityPromise = (async () => {
      const { data, error } = await (admin as any).rpc("dashboard_activity_series", {
        p_team_id: teamId,
        p_user_id: userId,
        p_bucket: bucket,
        p_from: from.toISOString(),
        p_to: now.toISOString(),
      });

      if (error) {
        return {
          ok: false,
          bucket,
          from: from.toISOString(),
          to: now.toISOString(),
          series: [] as DashboardActivityRow[],
        };
      }

      return {
        ok: true,
        bucket,
        from: from.toISOString(),
        to: now.toISOString(),
        series: ((data ?? []) as DashboardActivityRow[]) ?? [],
      };
    })();

    // ---------------------------
    // KPIs
    // ---------------------------
    const kpisPromise = (async () => {
      const leadsTotalQ = applyLeadScope(admin.from("leads").select("id", { count: "exact", head: true }));
      const { count: leads_total, error: ltErr } = await leadsTotalQ;
      if (ltErr) throw new Error("kpi_leads_total_failed");

      const leads7Q = applyLeadScope(
        admin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", from7.toISOString())
      );
      const leads30Q = applyLeadScope(
        admin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", from30.toISOString())
      );

      const [{ count: leads_new_7d }, { count: leads_new_30d }] = await Promise.all([leads7Q, leads30Q]);

      const applyMsgScope = (q: any) => {
        let qq = q.eq("team_id", teamId);
        if (effectiveScope === "me") qq = qq.eq("sender_profile_id", userId);
        return qq;
      };

      const msgs7Q = applyMsgScope(
        admin
          .from("lead_messages")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", from7.toISOString())
          .eq("direction", "outbound")
          .neq("channel", "pipeline")
      );
      const msgs30Q = applyMsgScope(
        admin
          .from("lead_messages")
          .select("id", { count: "exact", head: true })
          .gte("sent_at", from30.toISOString())
          .eq("direction", "outbound")
          .neq("channel", "pipeline")
      );

      const [{ count: messages_sent_7d }, { count: messages_sent_30d }] = await Promise.all([msgs7Q, msgs30Q]);

      const bookings7Q = admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .gte("created_at", from7.toISOString());

      const bookings30Q = admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .gte("created_at", from30.toISOString());

      const [{ count: bookings_7d }, { count: bookings_30d }] = await Promise.all([bookings7Q, bookings30Q]);

      let outcomesQ: any = admin
        .from("booking_outcomes")
        .select("attended_status, closed_on_call, closer_user_id")
        .eq("team_id", teamId)
        .gte("created_at", from30.toISOString());

      if (effectiveScope === "me") outcomesQ = outcomesQ.eq("closer_user_id", userId);

      const { data: outcomes, error: oErr } = await outcomesQ;
      if (oErr) throw new Error("kpi_outcomes_failed");

      const rows = ((outcomes ?? []) as Pick<BookingOutcomeRow, "attended_status" | "closed_on_call">[]) ?? [];
      const totalOutcomes = rows.length;

      const showed = rows.filter((r) => String(r.attended_status ?? "") === "showed").length;
      const closed = rows.filter((r) => !!r.closed_on_call).length;

      const show_rate_30d = totalOutcomes > 0 ? Math.round((showed / totalOutcomes) * 1000) / 10 : null;
      const close_rate_30d = totalOutcomes > 0 ? Math.round((closed / totalOutcomes) * 1000) / 10 : null;

      return {
        leads_total: leads_total ?? 0,
        leads_new_7d: leads_new_7d ?? 0,
        leads_new_30d: leads_new_30d ?? 0,
        messages_sent_7d: messages_sent_7d ?? 0,
        messages_sent_30d: messages_sent_30d ?? 0,
        bookings_7d: bookings_7d ?? 0,
        bookings_30d: bookings_30d ?? 0,
        show_rate_30d,
        close_rate_30d,
      };
    })();

    // ---------------------------
    // Panels
    // ---------------------------
    const panelsPromise = (async () => {
      const to14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const { data: upcomingRaw, error: upErr } = await admin
        .from("bookings")
        .select("id, start_at, end_at, lead_id, invitee_first_name, invitee_email, booking_link_id")
        .eq("team_id", teamId)
        .gte("start_at", now.toISOString())
        .lte("start_at", to14.toISOString())
        .order("start_at", { ascending: true })
        .limit(12);

      if (upErr) throw new Error("upcoming_bookings_failed");

      const upcoming = (((upcomingRaw ?? []) as Partial<BookingRow>[]) ?? [])
        .filter((b) => !!b.start_at)
        .map((b) => ({
          id: String(b.id ?? ""),
          start_at: String(b.start_at),
          end_at: b.end_at ? String(b.end_at) : null,
          lead_id: b.lead_id ? String(b.lead_id) : null,
          invitee_first_name: b.invitee_first_name ?? null,
          invitee_email: b.invitee_email ?? null,
          booking_link_id: b.booking_link_id ? String(b.booking_link_id) : null,
        }));

      // ✅ FIX: robust leads selects (no assumptions about "name")
      const { rows: recentRaw } = await loadRecentLeadsWithFallback({
        admin,
        applyLeadScope,
      });

      const normalizedRecent = (recentRaw ?? []).map((l: any) => {
        const stageId = l.stage_id ? String(l.stage_id) : null;
        const stage_name = stageId ? stageIdToName.get(stageId) ?? null : null;

        return {
          id: String(l.id ?? ""),
          name: (l.lead_name ?? l.name ?? null) as string | null,
          stage_id: stageId,
          stage_name,
          stage: stage_name, // ✅ client expects "stage"
          created_at: String(l.created_at ?? ""),
          score: l.score == null ? null : Number(l.score),
        };
      });

      const leadIds = normalizedRecent.map((l: any) => l.id).filter(Boolean);

      const { data: msgRowsRaw } = await admin
        .from("lead_messages")
        .select("lead_id, sent_at")
        .eq("team_id", teamId)
        .in("lead_id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"])
        .order("sent_at", { ascending: false })
        .limit(200);

      const msgRows = ((msgRowsRaw ?? []) as Pick<LeadMessageRow, "lead_id" | "sent_at">[]) ?? [];

      const lastByLead = new Map<string, string>();
      for (const m of msgRows) {
        const lid = String(m.lead_id ?? "");
        if (!lid) continue;
        if (!lastByLead.has(lid)) lastByLead.set(lid, String(m.sent_at ?? ""));
      }

      const needs_attention = normalizedRecent
        .map((l: any) => ({
          id: l.id,
          name: l.name ?? "Unnamed",
          stage: l.stage_name ?? "—",
          score: l.score ?? null,
          last_activity_at: lastByLead.get(l.id) ?? null,
        }))
        .filter((x: any) => {
          if (!x.last_activity_at) return true;
          const ms = Date.parse(x.last_activity_at);
          if (!Number.isFinite(ms)) return true;
          return ms < Date.now() - 3 * 24 * 60 * 60 * 1000;
        })
        .sort((a: any, b: any) => Number(b.score ?? -1) - Number(a.score ?? -1))
        .slice(0, 6);

      const feed: Array<any> = [];

      const [feedMsgsRes, feedBookingsRes] = await Promise.all([
        admin
          .from("lead_messages")
          .select("id, lead_id, direction, channel, sent_at")
          .eq("team_id", teamId)
          .order("sent_at", { ascending: false })
          .limit(10),
        admin
          .from("bookings")
          .select("id, lead_id, invitee_email, start_at, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      for (const l of normalizedRecent) {
        feed.push({
          type: "lead_created",
          at: l.created_at,
          lead_id: l.id,
          label: `Lead added: ${l.name ?? "Unnamed"}`,
        });
      }

      for (const m of (feedMsgsRes.data ?? []) as any[]) {
        feed.push({
          type: "message",
          at: String(m.sent_at ?? ""),
          lead_id: m.lead_id ?? null,
          label: `${m.direction === "inbound" ? "Inbound" : "Outbound"} message`,
        });
      }

      for (const b of (feedBookingsRes.data ?? []) as any[]) {
        feed.push({
          type: "booking",
          at: String(b.created_at ?? ""),
          lead_id: b.lead_id ?? null,
          label: `Booking created (${b.invitee_email ?? "invitee"})`,
        });
      }

      feed.sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at)));

      return {
        upcoming_bookings: upcoming,
        recent_leads: normalizedRecent,
        needs_attention,
        feed: feed.slice(0, 20),
      };
    })();

    const [funnel, activity, kpis, panels] = await Promise.all([
      funnelPromise,
      activityPromise,
      kpisPromise,
      panelsPromise,
    ]);

    return NextResponse.json({
      ok: true,
      teamId,
      role,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      kpis,
      funnel,
      activity,
      panels,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "missing_team_membership") {
      return jsonError("missing_team", 400, "User is not in any team_members row");
    }
    if (msg === "not_a_member_of_team") {
      return jsonError("forbidden", 403, "Not a member of requested teamId");
    }
    if (msg === "recent_leads_failed") {
      return jsonError("recent_leads_failed", 500, (e as any).details ?? "unknown_recent_leads_error");
    }

    console.error("[dashboard] unexpected:", e);
    return jsonError("unhandled_error", 500, msg);
  }
}
