import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeRoles(raw: unknown): TeamRole[] {
  if (Array.isArray(raw)) {
    return uniq(
      raw
        .map((r) => String(r))
        .filter((r): r is TeamRole => AVAILABLE_ROLES.includes(r as TeamRole))
    );
  }
  if (typeof raw === "string" && AVAILABLE_ROLES.includes(raw as TeamRole)) {
    return [raw as TeamRole];
  }
  return [];
}

function normalizeTeamId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const jwt = authHeader.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

function getTeamIdFromRequest(req: NextRequest, bodyTeamId?: unknown) {
  const fromQuery = req.nextUrl.searchParams.get("teamId");
  if (fromQuery && typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;

  const fromBody = normalizeTeamId(bodyTeamId);
  if (fromBody) return fromBody;

  const fromCookie = req.cookies.get("current_team_id")?.value;
  if (fromCookie && typeof fromCookie === "string" && fromCookie.length > 0) return fromCookie;

  return null;
}

async function getCallerProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, team_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String((data as any).id),
    team_id: (data as any).team_id as string | null,
    role: normalizeRoles((data as any).role),
  };
}

/**
 * GET /api/crm/team-roles
 * - teamId from query/body/cookie
 * - members from profiles where team_id = teamId
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const teamId = getTeamIdFromRequest(req);
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });

    const caller = await getCallerProfile(user.id);
    if (!caller) return NextResponse.json({ ok: false, error: "Profile not found." }, { status: 403 });

    // must be same team
    if ((caller.team_id ?? null) !== teamId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // permission: Manager or Admin (from profiles.role array)
    const isAdmin = caller.role.includes("Admin");
    const isManager = caller.role.includes("Manager") || isAdmin;
    if (!isManager) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Load members from profiles for this team
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, role")
      .eq("team_id", teamId);

    if (profErr) {
      console.error("[team-roles][GET] profiles error", profErr);
      return NextResponse.json({ ok: false, error: "Failed to load members." }, { status: 500 });
    }

    const membersBase = (profiles ?? []).map((p: any) => ({
      user_id: String(p.id),
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      roles: normalizeRoles(p.role),
    }));

    // Best-effort email via auth admin
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

    return NextResponse.json({ ok: true, members: withEmail });
  } catch (err) {
    console.error("[team-roles][GET] unexpected error", err);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/team-roles
 * body: { teamId?, userId, roles: TeamRole[] }
 * - Updates ONLY profiles.role (text[]) and keeps team_id
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { teamId?: string; userId?: string; roles?: TeamRole[] };

    const teamId = getTeamIdFromRequest(req, body.teamId);
    const targetUserId = normalizeTeamId(body.userId);

    if (!teamId || !targetUserId) {
      return NextResponse.json({ ok: false, error: "Missing teamId/userId" }, { status: 400 });
    }

    const roles = normalizeRoles(body.roles);
    if (roles.length === 0) {
      return NextResponse.json({ ok: false, error: "At least one role is required." }, { status: 400 });
    }

    const caller = await getCallerProfile(user.id);
    if (!caller) return NextResponse.json({ ok: false, error: "Profile not found." }, { status: 403 });

    // must be same team
    if ((caller.team_id ?? null) !== teamId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = caller.role.includes("Admin");
    const isManager = caller.role.includes("Manager") || isAdmin;
    if (!isManager) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Managers cannot grant Admin
    const safeRoles = uniq(isAdmin ? roles : roles.filter((r) => r !== "Admin"));
    if (safeRoles.length === 0) {
      return NextResponse.json({ ok: false, error: "Managers cannot grant Admin." }, { status: 400 });
    }

    // Ensure target user is in this team (profiles.team_id must match)
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("id, team_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ ok: false, error: "Target profile not found." }, { status: 404 });
    }

    if ((targetProfile as any).team_id !== teamId) {
      return NextResponse.json({ ok: false, error: "Target user is not in this team." }, { status: 400 });
    }

    // Update profiles.role as ARRAY (text[])
    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ role: safeRoles })
      .eq("id", targetUserId);

    if (updErr) {
      console.error("[team-roles][PATCH] profiles update error", updErr);
      return NextResponse.json({ ok: false, error: "Failed to update profile roles." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, roles: safeRoles });
  } catch (err) {
    console.error("[team-roles][PATCH] unexpected error", err);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
