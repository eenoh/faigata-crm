// src/app/api/crm/dashboard/pipeline/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // ✅ used for ordering the Stage-to-Stage Performance table
  position: number | null;

  // ✅ from conversion_metrics.label
  label: string;

  targetRate: number | null;
  actualConversionRate: number | null;
  dropOffCount: number;
  dropOffRate: number | null;
};

type PipelineStageRow = {
  id: string;
  team_id: string;
  name: string | null;
  position: number | null;
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

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role: string | null;
  joined_at: string | null;
};
type ProfileRow = { id: string; team_id: string | null; role: any };

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function getBearerToken(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isScope(v: string): v is Scope {
  return v === "team" || v === "me";
}

function normalizeRole(v: unknown): Role {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "admin") return "admin";
  if (s === "manager") return "manager";
  return "member";
}

function normalizeRolesArray(raw: unknown): Role[] {
  if (Array.isArray(raw)) return raw.map(normalizeRole);
  if (typeof raw === "string") return [normalizeRole(raw)];
  return [];
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

async function resolveTeamContext(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  req: Request,
): Promise<{ teamId: string; roles: Role[]; isManagerOrAdmin: boolean }> {
  const url = new URL(req.url);
  // ✅ searchParams.get returns string | null (never undefined) → use `|| ""` to avoid "?? unreachable"
  const teamIdParam = (url.searchParams.get("teamId") || "").trim() || null;

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

      const role = normalizeRole(tm.role);
      return {
        teamId: String(tm.team_id),
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

    if (error) throw error;

    const tm = (data as Pick<TeamMemberRow, "team_id" | "role"> | null) ?? null;
    if (!tm?.team_id) throw new Error("missing_team_membership");

    const role = normalizeRole(tm.role);
    return {
      teamId: String(tm.team_id),
      roles: [role],
      isManagerOrAdmin: role === "admin" || role === "manager",
    };
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const code = String(e?.code ?? "");
    const isMissingTable =
      code === "42P01" ||
      (msg.toLowerCase().includes("relation") &&
        msg.toLowerCase().includes("team_members"));

    if (!isMissingTable) throw e;

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
  buildQuery: (sel: string) => Promise<any>,
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

function normKey(s: string) {
  return s.trim().toLowerCase();
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("missing_auth", 401);

    const url = new URL(req.url);
    const scopeRaw = String(url.searchParams.get("scope") || "team").trim();
    if (!isScope(scopeRaw)) return jsonError("invalid_scope", 400);
    const requestedScope: Scope = scopeRaw;

    const admin = supabaseAdmin();

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const user = userRes?.user ?? null;
    if (userErr || !user)
      return jsonError("invalid_session", 401, userErr?.message);
    const userId = String(user.id);

    const { teamId, roles, isManagerOrAdmin } = await resolveTeamContext(
      admin,
      userId,
      req,
    );
    const effectiveScope: Scope = isManagerOrAdmin ? requestedScope : "me";

    const applyLeadScope = (q: any) => {
      let qq = q.eq("team_id", teamId);
      if (effectiveScope === "me")
        qq = qq.or(`setter_id.eq.${userId},closer_id.eq.${userId}`);
      return qq;
    };

    // Load stages + conversion metrics
    const [stagesRes, metricsRes] = await Promise.all([
      admin
        .from("pipeline_stages")
        .select("id, team_id, name, position, created_at")
        .eq("team_id", teamId)
        // Supabase JS doesn't support nullsLast, so we do a basic order then sort in JS.
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("conversion_metrics")
        .select(
          "id, team_id, label, from_stage_id, to_stage_id, position, target_rate",
        )
        .eq("team_id", teamId)
        .order("position", { ascending: true }),
    ]);

    if (stagesRes.error)
      return jsonError("stages_load_failed", 500, stagesRes.error);
    if (metricsRes.error)
      return jsonError("metrics_load_failed", 500, metricsRes.error);

    // ✅ avoid "?? unreachable" in setups where supabase types make `.data` non-nullish
    let stages: PipelineStageRow[] = Array.isArray(stagesRes.data)
      ? (stagesRes.data as any)
      : [];
    const metrics: ConversionMetricRow[] = Array.isArray(metricsRes.data)
      ? (metricsRes.data as any)
      : [];

    // Sort stages with null positions last (JS-side)
    stages = [...stages].sort((a, b) => {
      const ap = a.position ?? Number.POSITIVE_INFINITY;
      const bp = b.position ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      const an = normKey(String(a.name ?? ""));
      const bn = normKey(String(b.name ?? ""));
      if (an !== bn) return an.localeCompare(bn);
      return String(a.id).localeCompare(String(b.id));
    });

    // Build maps for name/id lookups (for leads.stage fallback)
    const stageIdToName = new Map<string, string>();
    const stageNameToId = new Map<string, string>(); // normalized name -> id
    for (const s of stages) {
      const id = String(s.id);
      const nm = String(s.name ?? "Untitled");
      stageIdToName.set(id, nm);
      stageNameToId.set(normKey(nm), id);
    }

    // Leads schema fallback: stage_id OR stage(text)
    const { data: leadRowsRaw, usedSelect } = await selectWithFallback(
      (sel) => applyLeadScope(admin.from("leads").select(sel)),
      ["id, stage_id", "id, stage"],
    );

    const leadRows: any[] = Array.isArray(leadRowsRaw) ? leadRowsRaw : [];

    // Count leads per stage id
    const stageIdToCount = new Map<string, number>();

    if (usedSelect.includes("stage_id")) {
      for (const l of leadRows) {
        const sid = l?.stage_id ? String(l.stage_id) : "";
        if (!sid) continue;
        stageIdToCount.set(sid, (stageIdToCount.get(sid) ?? 0) + 1);
      }
    } else {
      for (const l of leadRows) {
        const nmRaw = l?.stage ? String(l.stage) : "";
        if (!nmRaw) continue;
        const sid = stageNameToId.get(normKey(nmRaw));
        if (!sid) continue;
        stageIdToCount.set(sid, (stageIdToCount.get(sid) ?? 0) + 1);
      }
    }

    const funnelStages: FunnelStage[] = stages.map((s) => ({
      id: String(s.id),
      name: String(s.name ?? "Untitled"),
      position: s.position ?? null,
      leadCount: stageIdToCount.get(String(s.id)) ?? 0,
    }));

    // Map conversion metrics by from/to stage ids (include position!)
    const metricByPair = new Map<
      string,
      {
        label: string | null;
        target_rate: number | null;
        position: number | null;
      }
    >();

    for (const m of metrics) {
      metricByPair.set(`${m.from_stage_id}__${m.to_stage_id}`, {
        label: m.label ?? null,
        target_rate: m.target_rate == null ? null : Number(m.target_rate),
        position: m.position ?? null,
      });
    }

    // Build edges for adjacent stage pairs
    const edges: FunnelEdge[] = [];
    for (let i = 0; i < funnelStages.length - 1; i++) {
      const fromS = funnelStages[i];
      const toS = funnelStages[i + 1];

      const fromCount = fromS.leadCount;
      const toCount = toS.leadCount;

      const metric = metricByPair.get(`${fromS.id}__${toS.id}`);

      const label =
        metric?.label && metric.label.trim().length > 0
          ? metric.label.trim()
          : "Next stage";
      const targetRate = metric?.target_rate ?? null;

      // Snapshot-based logic: reached FROM ~= still in FROM + already in TO
      const denom = fromCount + toCount;
      const actualConversionRate =
        denom > 0 ? Math.round((toCount / denom) * 1000) / 10 : null;

      // Not converted yet = still in FROM
      const dropOffCount = fromCount;
      const dropOffRate =
        denom > 0 ? Math.round((dropOffCount / denom) * 1000) / 10 : null;

      edges.push({
        fromStageId: fromS.id,
        toStageId: toS.id,
        fromStageName: fromS.name,
        toStageName: toS.name,
        position: metric?.position ?? i,
        label,
        targetRate,
        actualConversionRate,
        dropOffCount,
        dropOffRate,
      });
    }

    return NextResponse.json({
      ok: true,
      teamId,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      funnel: {
        leadTotal: leadRows.length,
        stages: funnelStages,
        edges,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("[dashboard-pipeline] unexpected:", e);
    return jsonError("unhandled_error", 500, msg);
  }
}
