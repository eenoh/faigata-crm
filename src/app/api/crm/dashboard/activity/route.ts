// src/app/api/crm/dashboard/activity/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Bucket = "day" | "week" | "month";
type Scope = "team" | "me";
type Role = "admin" | "manager" | "member";

type TeamMemberRow = {
  team_id: string;
  user_id: string;
  role: string | null;
  joined_at: string | null;
};
type ProfileRow = { id: string; team_id: string | null; role: any };

const json = (data: any, status = 200) => NextResponse.json(data, { status });
const jsonError = (error: string, status = 500, details?: unknown) =>
  json({ error, details }, status);

const bearer = (req: Request) => {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
};

const isBucket = (v: string): v is Bucket =>
  v === "day" || v === "week" || v === "month";
const isScope = (v: string): v is Scope => v === "team" || v === "me";

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

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("missing_supabase_url");
  if (!serviceKey) throw new Error("missing_service_role_key");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const isoRange = (days: number) => {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from, to, fromISO: from.toISOString(), toISO: to.toISOString() };
};

async function rpcWithFallback(admin: any, fn: string, argSets: any[]) {
  let lastErr: any = null;
  for (const args of argSets) {
    const { data, error } = await admin.rpc(fn, args);
    if (!error) return { ok: true as const, data: data ?? [] };
    lastErr = error;
  }
  return { ok: false as const, error: lastErr };
}

async function resolveTeamContext(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  req: Request,
): Promise<{ teamId: string; roles: Role[]; isManagerOrAdmin: boolean }> {
  const url = new URL(req.url);
  const teamIdParam = (url.searchParams.get("teamId") ?? "").trim() || null;

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

    // fallback for older schemas
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

export async function GET(req: Request) {
  try {
    const token = bearer(req);
    if (!token) return jsonError("missing_auth", 401);

    const url = new URL(req.url);
    const bucketRaw = String(url.searchParams.get("bucket") ?? "week").trim();
    const scopeRaw = String(url.searchParams.get("scope") ?? "team").trim();
    const days = Number(url.searchParams.get("days") ?? "120");

    if (!isBucket(bucketRaw)) return jsonError("invalid_bucket", 400);
    if (!isScope(scopeRaw)) return jsonError("invalid_scope", 400);
    if (!Number.isFinite(days) || days < 7 || days > 365)
      return jsonError("invalid_days", 400);

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
    const requestedScope: Scope = scopeRaw;
    const effectiveScope: Scope = isManagerOrAdmin ? requestedScope : "me";

    const { from, to, fromISO, toISO } = isoRange(days);

    // Some DBs have dashboard_activity_series(p_team_id,p_user_id,p_bucket,p_from,p_to)
    // Others include p_scope. We try both.
    const rpcRes = await rpcWithFallback(
      admin as any,
      "dashboard_activity_series",
      [
        {
          p_team_id: teamId,
          p_user_id: userId,
          p_bucket: bucketRaw,
          p_from: fromISO,
          p_to: toISO,
          p_scope: effectiveScope,
        },
        {
          p_team_id: teamId,
          p_user_id: userId,
          p_bucket: bucketRaw,
          p_from: fromISO,
          p_to: toISO,
        },
      ],
    );

    const base = {
      teamId,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      bucket: bucketRaw as Bucket,
      from: from.toISOString(),
      to: to.toISOString(),
    };

    if (!rpcRes.ok) return json({ ok: false, ...base, series: [] });

    return json({ ok: true, ...base, series: rpcRes.data });
  } catch (e: any) {
    console.error("[dashboard-activity] unexpected:", e);
    return jsonError("unhandled_error", 500, String(e?.message ?? e));
  }
}
