// src/app/api/crm/dashboard/activity/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Bucket = "day" | "week" | "month";
type Scope = "team" | "me";
type Role = "admin" | "manager" | "member";

type TeamMemberRow = { team_id: string; user_id: string; role: string | null; joined_at: string | null };
type ProfileRow = { id: string; team_id: string | null; role: any };

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
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveTeamContext(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  req: Request
): Promise<{ teamId: string; roles: Role[]; isManagerOrAdmin: boolean }> {
  const url = new URL(req.url);
  const teamIdParam = (url.searchParams.get("teamId") ?? "").trim() || null;

  try {
    if (teamIdParam) {
      const { data, error } = await admin
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", userId)
        .eq("team_id", teamIdParam)
        .maybeSingle();
      if (error) throw error;

      const tm = (data as Pick<TeamMemberRow, "team_id" | "role"> | null) ?? null;
      if (!tm?.team_id) throw new Error("not_a_member_of_team");
      const role = normalizeRole(tm.role);
      return { teamId: String(tm.team_id), roles: [role], isManagerOrAdmin: role === "admin" || role === "manager" };
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
    return { teamId: String(tm.team_id), roles: [role], isManagerOrAdmin: role === "admin" || role === "manager" };
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const code = String(e?.code ?? "");
    const isMissingTable =
      code === "42P01" || (msg.toLowerCase().includes("relation") && msg.toLowerCase().includes("team_members"));

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
    const isManagerOrAdmin = roles.includes("admin") || roles.includes("manager");
    return { teamId: String(p.team_id), roles: roles.length ? roles : ["member"], isManagerOrAdmin };
  }
}

async function rpcWithFallback(admin: any, fn: string, argSets: any[]) {
  let lastErr: any = null;
  for (const args of argSets) {
    const { data, error } = await admin.rpc(fn, args);
    if (!error) return { ok: true, data: data ?? [] };
    lastErr = error;
  }
  return { ok: false, error: lastErr };
}

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

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const user = userRes?.user ?? null;
    if (userErr || !user) return jsonError("invalid_session", 401, userErr?.message);
    const userId = String(user.id);

    const { teamId, roles, isManagerOrAdmin } = await resolveTeamContext(admin, userId, req);
    const effectiveScope: Scope = isManagerOrAdmin ? requestedScope : "me";

    const now = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Some DBs have dashboard_activity_series(p_team_id,p_user_id,p_bucket,p_from,p_to)
    // Others include p_scope. We try both.
    const rpcRes = await rpcWithFallback(admin as any, "dashboard_activity_series", [
      {
        p_team_id: teamId,
        p_user_id: userId,
        p_bucket: bucket,
        p_from: from.toISOString(),
        p_to: now.toISOString(),
        p_scope: effectiveScope,
      },
      {
        p_team_id: teamId,
        p_user_id: userId,
        p_bucket: bucket,
        p_from: from.toISOString(),
        p_to: now.toISOString(),
      },
    ]);

    if (!rpcRes.ok) {
      return NextResponse.json({
        ok: false,
        teamId,
        roles,
        isManagerOrAdmin,
        scope: effectiveScope,
        bucket,
        from: from.toISOString(),
        to: now.toISOString(),
        series: [],
      });
    }

    return NextResponse.json({
      ok: true,
      teamId,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      bucket,
      from: from.toISOString(),
      to: now.toISOString(),
      series: rpcRes.data,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("[dashboard-activity] unexpected:", e);
    return jsonError("unhandled_error", 500, msg);
  }
}
