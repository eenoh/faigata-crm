// src/app/api/crm/team-roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!SUPABASE_ANON_KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

const ROLE_CANONICAL: Record<string, TeamRole> = {
  prospector: "Prospector",
  setter: "Setter",
  closer: "Closer",
  manager: "Manager",
  admin: "Admin",

  Prospector: "Prospector",
  Setter: "Setter",
  Closer: "Closer",
  Manager: "Manager",
  Admin: "Admin",
};

const ROLE_DB_VALUE: Record<TeamRole, string> = {
  Prospector: "prospector",
  Setter: "setter",
  Closer: "closer",
  Manager: "manager",
  Admin: "admin",
};

function toTeamRole(v: unknown): TeamRole | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return ROLE_CANONICAL[s] ?? ROLE_CANONICAL[s.toLowerCase()] ?? null;
}

function normalizeRoles(raw: unknown): TeamRole[] {
  if (Array.isArray(raw)) return uniq(raw.map(toTeamRole).filter((r): r is TeamRole => Boolean(r)));
  const single = toTeamRole(raw);
  return single ? [single] : [];
}

function normalizeId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function getBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

function getTeamIdFromRequest(req: NextRequest, bodyTeamId?: unknown) {
  const fromQuery = req.nextUrl.searchParams.get("teamId");
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();

  const fromBody = normalizeId(bodyTeamId);
  if (fromBody) return fromBody;

  const fromCookie = req.cookies.get("current_team_id")?.value;
  if (typeof fromCookie === "string" && fromCookie.trim()) return fromCookie.trim();

  return null;
}

/**
 * IMPORTANT:
 * Use a request-scoped Supabase client authenticated as the CALLER (JWT),
 * so RLS/triggers see the real user and allow Admin grants correctly.
 */
function supabaseForJwt(jwt: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

/**
 * Membership + role resolution using the caller JWT client (RLS-aware)
 * - membership if team_members row exists OR profiles.team_id matches (legacy)
 * - roles = union(profiles.role, team_members.role)
 */
async function getMembershipAndRoles(sb: ReturnType<typeof supabaseForJwt>, userId: string, teamId: string) {
  const [{ data: profile, error: profErr }, { data: member, error: memErr }] = await Promise.all([
    sb.from("profiles").select("id, team_id, role, first_name, last_name").eq("id", userId).maybeSingle(),
    sb.from("team_members").select("team_id, user_id, role").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
  ]);

  if (profErr) throw profErr;
  if (memErr) throw memErr;

  const profileTeamId = (profile as any)?.team_id ?? null;
  const inTeam = Boolean(member) || (profileTeamId !== null && String(profileTeamId) === teamId);

  const roles = uniq([
    ...normalizeRoles((profile as any)?.role),
    ...normalizeRoles((member as any)?.role),
  ]);

  return { inTeam, roles, profile: profile ?? null, member: member ?? null };
}

/**
 * GET /api/crm/team-roles?teamId=...
 * Returns: { ok, callerRoles, members }
 */
export async function GET(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const sb = supabaseForJwt(jwt);

    // Validate token -> user
    const { data: ures, error: uerr } = await sb.auth.getUser();
    if (uerr || !ures.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const teamId = getTeamIdFromRequest(req);
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });

    const caller = await getMembershipAndRoles(sb, ures.user.id, teamId);
    if (!caller.inTeam) return NextResponse.json({ ok: false, error: "Forbidden", callerRoles: caller.roles }, { status: 403 });

    const isAdmin = caller.roles.includes("Admin");
    const isManager = caller.roles.includes("Manager") || isAdmin;
    if (!isManager) {
      return NextResponse.json({ ok: false, error: "Forbidden", callerRoles: caller.roles }, { status: 403 });
    }

    // Primary membership source
    const { data: memberRows, error: membersErr } = await sb
      .from("team_members")
      .select("user_id, role")
      .eq("team_id", teamId);

    if (membersErr) {
      console.error("[team-roles][GET] team_members error", membersErr);
      return NextResponse.json({ ok: false, error: "Failed to load members.", details: membersErr }, { status: 500 });
    }

    const memberUserIds = uniq((memberRows ?? []).map((m: any) => String(m.user_id)));

    // Legacy fallback
    const { data: legacyProfiles, error: legacyErr } = await sb
      .from("profiles")
      .select("id")
      .eq("team_id", teamId);

    if (legacyErr) {
      console.error("[team-roles][GET] legacy profiles error", legacyErr);
      return NextResponse.json({ ok: false, error: "Failed to load members.", details: legacyErr }, { status: 500 });
    }

    const legacyUserIds = uniq((legacyProfiles ?? []).map((p: any) => String(p.id)));
    const userIds = uniq([...memberUserIds, ...legacyUserIds]);

    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, callerRoles: caller.roles, members: [] }, { status: 200 });
    }

    const { data: profiles, error: profErr } = await sb
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("id", userIds);

    if (profErr) {
      console.error("[team-roles][GET] profiles error", profErr);
      return NextResponse.json({ ok: false, error: "Failed to load members.", details: profErr }, { status: 500 });
    }

    const memberRoleByUserId = new Map<string, TeamRole[]>();
    for (const m of memberRows ?? []) {
      const uid = String((m as any).user_id);
      memberRoleByUserId.set(uid, normalizeRoles((m as any).role));
    }

    const membersBase = (profiles ?? []).map((p: any) => {
      const uid = String(p.id);
      const roles = uniq([...normalizeRoles(p.role), ...(memberRoleByUserId.get(uid) ?? [])]);
      return { user_id: uid, first_name: p.first_name ?? null, last_name: p.last_name ?? null, roles };
    });

    // Email lookup (best-effort). If service role missing, just return null emails.
    const withEmail = await Promise.all(
      membersBase.map(async (m) => {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
          return { ...m, email: data?.user?.email ?? null };
        } catch {
          return { ...m, email: null };
        }
      })
    );

    return NextResponse.json({ ok: true, callerRoles: caller.roles, members: withEmail }, { status: 200 });
  } catch (err: any) {
    console.error("[team-roles][GET] unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/crm/team-roles
 * body: { teamId, userId, roles }
 *
 * Uses the CALLER JWT client so triggers/RLS get real claims.
 * Persists lowercase roles into BOTH:
 * - profiles.role
 * - team_members.role
 */
export async function PATCH(req: NextRequest) {
  try {
    const jwt = getBearer(req);
    if (!jwt) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const sb = supabaseForJwt(jwt);

    const { data: ures, error: uerr } = await sb.auth.getUser();
    if (uerr || !ures.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { teamId?: string; userId?: string; roles?: unknown };

    const teamId = getTeamIdFromRequest(req, body.teamId);
    const targetUserId = normalizeId(body.userId);
    if (!teamId || !targetUserId) {
      return NextResponse.json({ ok: false, error: "Missing teamId/userId" }, { status: 400 });
    }

    const desiredRoles = normalizeRoles(body.roles);
    if (desiredRoles.length === 0) {
      return NextResponse.json({ ok: false, error: "At least one role is required." }, { status: 400 });
    }

    const caller = await getMembershipAndRoles(sb, ures.user.id, teamId);
    if (!caller.inTeam) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const isAdmin = caller.roles.includes("Admin");
    const isManager = caller.roles.includes("Manager") || isAdmin;
    if (!isManager) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Managers cannot grant Admin
    const safeRoles = uniq(isAdmin ? desiredRoles : desiredRoles.filter((r) => r !== "Admin"));
    if (safeRoles.length === 0) {
      return NextResponse.json({ ok: false, error: "Managers cannot grant Admin." }, { status: 400 });
    }

    const target = await getMembershipAndRoles(sb, targetUserId, teamId);
    if (!target.inTeam) {
      return NextResponse.json({ ok: false, error: "Target user is not in this team." }, { status: 400 });
    }

    const safeDbRoles = safeRoles.map((r) => ROLE_DB_VALUE[r]);

    // Update profiles.role (lowercase)
    const { error: updProfileErr } = await sb.from("profiles").update({ role: safeDbRoles }).eq("id", targetUserId);
    if (updProfileErr) {
      console.error("[team-roles][PATCH] profiles update error", updProfileErr);
      return NextResponse.json(
        { ok: false, error: "Failed to update profile roles.", details: updProfileErr },
        { status: 500 }
      );
    }

    // Update team_members.role (lowercase)
    // Note: this assumes there is exactly one row per (team_id,user_id). If not, enforce it in DB.
    const { error: updMemberErr } = await sb
      .from("team_members")
      .update({ role: safeDbRoles })
      .eq("team_id", teamId)
      .eq("user_id", targetUserId);

    if (updMemberErr) {
      console.error("[team-roles][PATCH] team_members update error", updMemberErr);
      return NextResponse.json(
        { ok: false, error: "Failed to update team member roles.", details: updMemberErr },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, roles: safeRoles }, { status: 200 });
  } catch (err: any) {
    console.error("[team-roles][PATCH] unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
