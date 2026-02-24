// src/app/api/crm/dashboard/overview/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Scope = "team" | "me";
type Role = "admin" | "manager" | "member";

/* -------------------- db row types -------------------- */

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role: string | null;
  joined_at: string | null;
};
type ProfileRow = { id: string; team_id: string | null; role: any };

type LeadMessageRow = { lead_id: string; sent_at: string | null };
type BookingOutcomeRow = {
  attended_status: string | null;
  closed_on_call: boolean | null;
  closer_user_id?: string | null;
};

type PipelineStageRow = {
  id: string;
  name: string | null;
  position: number | null;
  created_at?: string | null;
};

type ConversionMetricRow = {
  id: string;
  team_id: string;
  label: string | null;
  from_stage_id: string;
  to_stage_id: string;
  position: number | null;
  target_rate: number | null;
};

type LeadRowStage = {
  id: string;
  stage_id?: string | null;
  stage?: string | null;
  team_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
};

/* -------------------- api payload types -------------------- */

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
  position: number | null;
  label: string;
  targetRate: number | null;
  actualConversionRate: number | null;
  dropOffCount: number;
  dropOffRate: number | null;
};

type ActivityPoint = {
  bucket_start: string;
  leads_created: number;
  messages_sent: number;
};

/* -------------------- helpers -------------------- */

const json = (data: any, status = 200) => NextResponse.json(data, { status });
const jsonError = (error: string, status = 500, details?: unknown) =>
  json({ error, details }, status);

const bearer = (req: Request) => {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
};

const normalizeRole = (v: unknown): Role => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "admin") return "admin";
  if (s === "manager") return "manager";
  return "member";
};

const normalizeRolesArray = (raw: unknown): Role[] => {
  if (Array.isArray(raw)) return raw.map(normalizeRole);
  if (typeof raw === "string") return [normalizeRole(raw)];
  return [];
};

const isScope = (v: string): v is Scope => v === "team" || v === "me";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("missing_supabase_url");
  if (!serviceKey) throw new Error("missing_service_role_key");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const normalizeTargetRate = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const asPct = n > 0 && n < 1 ? n * 100 : n;
  const clamped = Math.max(0, Math.min(100, asPct));
  return Math.round(clamped * 10) / 10;
};

async function resolveTeamContext(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  req: Request,
): Promise<{ teamId: string; roles: Role[]; isManagerOrAdmin: boolean }> {
  const url = new URL(req.url);
  const teamIdParam = (url.searchParams.get("teamId") || "").trim() || null;

  const roleInfo = (role: unknown) => {
    const r = normalizeRole(role);
    return {
      roles: [r] as Role[],
      isManagerOrAdmin: r === "admin" || r === "manager",
    };
  };

  const isMissingTeamMembersTable = (e: any) => {
    const msg = String(e?.message ?? "").toLowerCase();
    const code = String(e?.code ?? "");
    return (
      code === "42P01" ||
      (msg.includes("relation") && msg.includes("team_members"))
    );
  };

  try {
    if (teamIdParam) {
      const { data, error } = await admin
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", userId)
        .eq("team_id", teamIdParam)
        .maybeSingle();

      if (error) throw error;

      const tm =
        (data as Pick<TeamMemberRow, "team_id" | "role"> | null) ?? null;
      if (!tm?.team_id) throw new Error("not_a_member_of_team");
      return { teamId: String(tm.team_id), ...roleInfo(tm.role) };
    }

    const { data, error } = await admin
      .from("team_members")
      .select("team_id, role, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const tm = (data as Pick<TeamMemberRow, "team_id" | "role"> | null) ?? null;
    if (!tm?.team_id) throw new Error("missing_team_membership");
    return { teamId: String(tm.team_id), ...roleInfo(tm.role) };
  } catch (e: any) {
    if (!isMissingTeamMembersTable(e)) throw e;

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, team_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) throw new Error("profile_lookup_failed");

    const p = (profile as ProfileRow | null) ?? null;
    if (!p?.team_id) throw new Error("missing_team");

    const roles = normalizeRolesArray(p.role);
    const isManagerOrAdmin =
      roles.includes("admin") || roles.includes("manager");

    return {
      teamId: String(p.team_id),
      roles: roles.length ? roles : ["member"],
      isManagerOrAdmin,
    };
  }
}

async function selectWithFallback(
  admin: any,
  buildQuery: (sel: string) => any,
  selects: string[],
) {
  let lastErr: any = null;
  for (const sel of selects) {
    const { data, error } = await buildQuery(sel);
    if (!error) return { data: data ?? [], usedSelect: sel };
    lastErr = error;
  }
  throw lastErr ?? new Error("select_failed");
}

/* -------------------- attendance normalization for SHOW RATE -------------------- */

const normAttendance = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const SHOW_VALUES = new Set(["attended", "showed", "show"]);

/* -------------------- route -------------------- */

export async function GET(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return jsonError("missing_auth", 401);

    const url = new URL(req.url);
    const scopeRaw = String(url.searchParams.get("scope") ?? "team").trim();
    if (!isScope(scopeRaw)) return jsonError("invalid_scope", 400);

    const requestedScope: Scope = scopeRaw;

    const admin = supabaseAdmin();

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const userId = userRes?.user?.id ? String(userRes.user.id) : null;
    if (userErr || !userId)
      return jsonError("invalid_session", 401, userErr?.message);

    const { teamId, roles, isManagerOrAdmin } = await resolveTeamContext(
      admin,
      userId,
      req,
    );
    const effectiveScope: Scope = isManagerOrAdmin ? requestedScope : "me";

    const now = new Date();
    const from7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const applyLeadScope = (q: any) => {
      let qq = q.eq("team_id", teamId);
      if (effectiveScope === "me")
        qq = qq.or(`setter_id.eq.${userId},closer_id.eq.${userId}`);
      return qq;
    };

    const applyMsgScope = (q: any) => {
      let qq = q.eq("team_id", teamId);
      if (effectiveScope === "me") qq = qq.eq("sender_profile_id", userId);
      return qq;
    };

    // ---------- KPIs ----------
    const kpisPromise = (async () => {
      const { count: leads_total, error: ltErr } = await applyLeadScope(
        admin.from("leads").select("id", { count: "exact", head: true }),
      );
      if (ltErr) throw ltErr;

      const [{ count: leads_new_7d }, { count: leads_new_30d }] =
        await Promise.all([
          applyLeadScope(
            admin
              .from("leads")
              .select("id", { count: "exact", head: true })
              .gte("created_at", from7.toISOString()),
          ),
          applyLeadScope(
            admin
              .from("leads")
              .select("id", { count: "exact", head: true })
              .gte("created_at", from30.toISOString()),
          ),
        ]);

      const [{ count: messages_sent_7d }, { count: messages_sent_30d }] =
        await Promise.all([
          applyMsgScope(
            admin
              .from("lead_messages")
              .select("id", { count: "exact", head: true })
              .gte("sent_at", from7.toISOString())
              .eq("direction", "outbound")
              .neq("channel", "pipeline"),
          ),
          applyMsgScope(
            admin
              .from("lead_messages")
              .select("id", { count: "exact", head: true })
              .gte("sent_at", from30.toISOString())
              .eq("direction", "outbound")
              .neq("channel", "pipeline"),
          ),
        ]);

      const [{ count: bookings_7d }, { count: bookings_30d }] =
        await Promise.all([
          admin
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("team_id", teamId)
            .gte("created_at", from7.toISOString()),
          admin
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("team_id", teamId)
            .gte("created_at", from30.toISOString()),
        ]);

      let outcomesQ: any = admin
        .from("booking_outcomes")
        .select("attended_status, closed_on_call, closer_user_id, created_at")
        .eq("team_id", teamId)
        .gte("created_at", from30.toISOString());

      if (effectiveScope === "me")
        outcomesQ = outcomesQ.eq("closer_user_id", userId);

      const { data: outcomes, error: oErr } = await outcomesQ;
      if (oErr) throw oErr;

      // ✅ fix "?? unreachable" by avoiding redundant nullish coalescing
      const rows: BookingOutcomeRow[] = Array.isArray(outcomes)
        ? (outcomes as BookingOutcomeRow[])
        : [];

      const eligible = rows.filter(
        (r) => normAttendance(r.attended_status).length > 0,
      );
      const total = eligible.length;
      const attended = eligible.filter((r) =>
        SHOW_VALUES.has(normAttendance(r.attended_status)),
      ).length;
      const closed = eligible.filter((r) => !!r.closed_on_call).length;

      const show_rate_30d = total
        ? Math.round((attended / total) * 1000) / 10
        : null;
      const close_rate_30d = total
        ? Math.round((closed / total) * 1000) / 10
        : null;

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

    // ---------- Panels ----------
    const panelsPromise = (async () => {
      const to14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const { data: upcomingRaw, error: upErr } = await admin
        .from("bookings")
        .select(
          "id, start_at, end_at, lead_id, invitee_first_name, invitee_email, booking_link_id",
        )
        .eq("team_id", teamId)
        .gte("start_at", now.toISOString())
        .lte("start_at", to14.toISOString())
        .order("start_at", { ascending: true })
        .limit(12);

      if (upErr) throw upErr;

      const upcoming = (upcomingRaw ?? [])
        .filter((b: any) => !!b.start_at)
        .map((b: any) => ({
          id: String(b.id ?? ""),
          start_at: String(b.start_at),
          end_at: b.end_at ? String(b.end_at) : null,
          lead_id: b.lead_id ? String(b.lead_id) : null,
          invitee_first_name: b.invitee_first_name ?? null,
          invitee_email: b.invitee_email ?? null,
          booking_link_id: b.booking_link_id ? String(b.booking_link_id) : null,
        }));

      const { data: recentRaw } = await selectWithFallback(
        admin,
        (sel) =>
          applyLeadScope(
            admin
              .from("leads")
              .select(sel)
              .order("created_at", { ascending: false })
              .limit(8),
          ),
        [
          "id, lead_name, stage_id, stage, created_at, score",
          "id, lead_name, stage_id, created_at, score",
          "id, lead_name, stage, created_at, score",
          "id, lead_name, stage_id, created_at",
          "id, lead_name, stage, created_at",
          "id, created_at",
        ],
      );

      const recentLeads = (recentRaw ?? []) as any[];
      const leadIds = recentLeads
        .map((l) => String(l.id ?? ""))
        .filter(Boolean);

      const { data: msgRowsRaw } = await admin
        .from("lead_messages")
        .select("lead_id, sent_at")
        .eq("team_id", teamId)
        .in(
          "lead_id",
          leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"],
        )
        .order("sent_at", { ascending: false })
        .limit(200);

      // ✅ fix "?? unreachable" by avoiding redundant nullish coalescing
      const msgRows: LeadMessageRow[] = Array.isArray(msgRowsRaw)
        ? (msgRowsRaw as LeadMessageRow[])
        : [];

      const lastByLead = new Map<string, string>();
      for (const m of msgRows) {
        const lid = String(m.lead_id ?? "");
        if (lid && !lastByLead.has(lid))
          lastByLead.set(lid, String(m.sent_at ?? ""));
      }

      const normalizedRecent = recentLeads.map((l) => ({
        id: String(l.id ?? ""),
        name: (l.lead_name ?? l.name ?? null) as string | null,
        stage: (l.stage ?? null) as string | null,
        created_at: String(l.created_at ?? ""),
        score: l.score == null ? null : Number(l.score),
      }));

      const needs_attention = normalizedRecent
        .map((l) => ({
          id: l.id,
          name: l.name ?? "Unnamed",
          stage: l.stage ?? "—",
          score: l.score ?? null,
          last_activity_at: lastByLead.get(l.id) ?? null,
        }))
        .filter((x) => {
          if (!x.last_activity_at) return true;
          const ms = Date.parse(x.last_activity_at);
          return (
            !Number.isFinite(ms) || ms < Date.now() - 3 * 24 * 60 * 60 * 1000
          );
        })
        .sort((a, b) => Number(b.score ?? -1) - Number(a.score ?? -1))
        .slice(0, 6);

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

      const feedMsgRows = Array.isArray(feedMsgsRes.data)
        ? feedMsgsRes.data
        : [];
      const feedBookingRows = Array.isArray(feedBookingsRes.data)
        ? feedBookingsRes.data
        : [];

      const feed: any[] = [
        ...normalizedRecent.map((l) => ({
          type: "lead_created",
          at: l.created_at,
          lead_id: l.id,
          label: `Lead added: ${l.name ?? "Unnamed"}`,
        })),
        ...feedMsgRows.map((m: any) => ({
          type: "message",
          at: String(m.sent_at ?? ""),
          lead_id: m.lead_id ?? null,
          label: `${m.direction === "inbound" ? "Inbound" : "Outbound"} message`,
        })),
        ...feedBookingRows.map((b: any) => ({
          type: "booking",
          at: String(b.created_at ?? ""),
          lead_id: b.lead_id ?? null,
          label: `Booking created (${b.invitee_email ?? "invitee"})`,
        })),
      ].sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at)));

      return {
        upcoming_bookings: upcoming,
        recent_leads: normalizedRecent,
        needs_attention,
        feed: feed.slice(0, 20),
      };
    })();

    // ---------- Funnel ----------
    const funnelPromise = (async () => {
      const { data: stageRowsRaw, error: stErr } = await admin
        .from("pipeline_stages")
        .select("id, name, position, created_at")
        .eq("team_id", teamId)
        .order("position", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (stErr) throw stErr;

      const stageRows = (stageRowsRaw ?? []) as PipelineStageRow[];
      if (!stageRows.length) {
        return {
          leadTotal: 0,
          stages: [] as FunnelStage[],
          edges: [] as FunnelEdge[],
        };
      }

      const { data: metricsRaw, error: mErr } = await admin
        .from("conversion_metrics")
        .select(
          "id, team_id, label, from_stage_id, to_stage_id, position, target_rate",
        )
        .eq("team_id", teamId)
        .order("position", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (mErr) throw mErr;

      const metrics = (metricsRaw ?? []) as ConversionMetricRow[];

      const metricByPair = new Map<
        string,
        {
          label: string | null;
          position: number | null;
          targetRate: number | null;
        }
      >();

      for (const m of metrics) {
        const key = `${m.from_stage_id}__${m.to_stage_id}`;
        if (!metricByPair.has(key)) {
          metricByPair.set(key, {
            label: m.label ?? null,
            position: m.position ?? null,
            targetRate: normalizeTargetRate(m.target_rate),
          });
        }
      }

      let leads: LeadRowStage[] = [];
      try {
        const { data: leadRows, error: lErr } = await applyLeadScope(
          admin.from("leads").select("id, stage_id, stage"),
        );
        if (lErr) throw lErr;
        leads = (leadRows ?? []) as LeadRowStage[];
      } catch {
        const { data: leadRows2, error: lErr2 } = await applyLeadScope(
          admin.from("leads").select("id, stage"),
        );
        if (lErr2) throw lErr2;
        leads = (leadRows2 ?? []) as LeadRowStage[];
      }

      const countsByStageId = new Map<string, number>(
        stageRows.map((s) => [String(s.id), 0]),
      );

      for (const l of leads) {
        const sid = l.stage_id ? String(l.stage_id) : null;
        if (sid && countsByStageId.has(sid)) {
          countsByStageId.set(sid, (countsByStageId.get(sid) ?? 0) + 1);
          continue;
        }

        const stageText = String(l.stage ?? "")
          .trim()
          .toLowerCase();
        if (!stageText) continue;

        const match = stageRows.find(
          (s) =>
            String(s.name ?? "")
              .trim()
              .toLowerCase() === stageText,
        );
        if (match) {
          countsByStageId.set(
            String(match.id),
            (countsByStageId.get(String(match.id)) ?? 0) + 1,
          );
        }
      }

      const stages: FunnelStage[] = [...stageRows]
        .sort(
          (a, b) =>
            (a.position ?? Number.POSITIVE_INFINITY) -
              (b.position ?? Number.POSITIVE_INFINITY) ||
            Date.parse(String(a.created_at ?? "")) -
              Date.parse(String(b.created_at ?? "")),
        )
        .map((s) => ({
          id: String(s.id),
          name: String(s.name ?? "Untitled"),
          position: s.position ?? null,
          leadCount: countsByStageId.get(String(s.id)) ?? 0,
        }));

      const edges: FunnelEdge[] = stages.slice(0, -1).map((from, i) => {
        const to = stages[i + 1];
        const metric = metricByPair.get(`${from.id}__${to.id}`);

        const denom = from.leadCount + to.leadCount;
        const actualConversionRate = denom
          ? Math.round((to.leadCount / denom) * 1000) / 10
          : null;

        const dropOffCount = from.leadCount;
        const dropOffRate = denom
          ? Math.round((dropOffCount / denom) * 1000) / 10
          : null;

        const label =
          (metric?.label ?? "").trim().length > 0
            ? String(metric!.label).trim()
            : "Next stage";

        return {
          fromStageId: from.id,
          toStageId: to.id,
          fromStageName: from.name,
          toStageName: to.name,
          position: metric?.position ?? i,
          label,
          targetRate: metric?.targetRate ?? null,
          actualConversionRate,
          dropOffCount,
          dropOffRate,
        };
      });

      return { leadTotal: leads.length, stages, edges };
    })();

    // ---------- Activity ----------
    const activityPromise = (async () => {
      const bucketRaw = String(url.searchParams.get("bucket") ?? "week").trim();
      const daysRaw = Number(url.searchParams.get("days") ?? 120);

      const bucket: "day" | "week" | "month" =
        bucketRaw === "day" || bucketRaw === "month" ? bucketRaw : "week";
      const days = Number.isFinite(daysRaw)
        ? Math.max(7, Math.min(365, daysRaw))
        : 120;

      const to = new Date();
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [leadsRes, msgsRes] = await Promise.all([
        applyLeadScope(
          admin
            .from("leads")
            .select("id, created_at")
            .gte("created_at", from.toISOString()),
        ),
        applyMsgScope(
          admin
            .from("lead_messages")
            .select("id, sent_at, direction, channel")
            .gte("sent_at", from.toISOString())
            .eq("direction", "outbound")
            .neq("channel", "pipeline"),
        ),
      ]);

      if (leadsRes.error) throw leadsRes.error;
      if (msgsRes.error) throw msgsRes.error;

      const bucketKey = (d: Date) => {
        const dd = new Date(d);
        if (bucket === "day") {
          dd.setHours(0, 0, 0, 0);
          return dd.toISOString();
        }
        if (bucket === "week") {
          const day = (dd.getDay() + 6) % 7;
          dd.setDate(dd.getDate() - day);
          dd.setHours(0, 0, 0, 0);
          return dd.toISOString();
        }
        dd.setDate(1);
        dd.setHours(0, 0, 0, 0);
        return dd.toISOString();
      };

      const map = new Map<string, ActivityPoint>();

      const leadsRows = Array.isArray(leadsRes.data) ? leadsRes.data : [];
      const msgRows = Array.isArray(msgsRes.data) ? msgsRes.data : [];

      for (const l of leadsRows) {
        const t = Date.parse(String((l as any).created_at ?? ""));
        if (!Number.isFinite(t)) continue;
        const key = bucketKey(new Date(t));
        const cur = map.get(key) ?? {
          bucket_start: key,
          leads_created: 0,
          messages_sent: 0,
        };
        cur.leads_created += 1;
        map.set(key, cur);
      }

      for (const m of msgRows) {
        const t = Date.parse(String((m as any).sent_at ?? ""));
        if (!Number.isFinite(t)) continue;
        const key = bucketKey(new Date(t));
        const cur = map.get(key) ?? {
          bucket_start: key,
          leads_created: 0,
          messages_sent: 0,
        };
        cur.messages_sent += 1;
        map.set(key, cur);
      }

      const series = Array.from(map.values()).sort(
        (a, b) => Date.parse(a.bucket_start) - Date.parse(b.bucket_start),
      );

      return {
        ok: true,
        bucket,
        from: from.toISOString(),
        to: to.toISOString(),
        series,
      };
    })();

    const [kpis, panels, funnel, activity] = await Promise.all([
      kpisPromise,
      panelsPromise,
      funnelPromise,
      activityPromise,
    ]);

    return json({
      ok: true,
      teamId,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      kpis,
      funnel,
      activity,
      panels,
    });
  } catch (e: any) {
    console.error("[dashboard-overview] unexpected:", e);
    return jsonError("unhandled_error", 500, String(e?.message ?? e));
  }
}
