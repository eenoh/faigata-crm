import { NextRequest, NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { normalizeString } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import {
  normalizeTeamRoles,
  TEAM_ROLE_PROFILE_DB_VALUE,
  type TeamRole,
  uniq,
} from "@/features/crm/server/team-roles.shared";
import { resolveUserTeamMembership } from "@/features/organizations/server/team-membership.service";

type TeamMemberResponse = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  roles: TeamRole[];
};

type TeamMemberResponseWithEmail = TeamMemberResponse & {
  email: string | null;
};

function normalizeId(raw: unknown): string | null {
  const value = normalizeString(raw);
  return value || null;
}

function getTeamIdFromRequest(request: NextRequest, bodyTeamId?: unknown) {
  const fromQuery = normalizeId(request.nextUrl.searchParams.get("teamId"));
  if (fromQuery) return fromQuery;

  const fromBody = normalizeId(bodyTeamId);
  if (fromBody) return fromBody;

  return normalizeId(request.cookies.get("current_team_id")?.value);
}

function jsonError(
  error: string,
  status = 500,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(request, admin);

    if (!auth.ok) {
      return jsonError("Unauthorized", 401);
    }

    const teamId = getTeamIdFromRequest(request);
    if (!teamId) {
      return jsonError("Missing teamId", 400);
    }

    const teamContext = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request,
      requestedTeamId: teamId,
    });

    if (!teamContext.isManagerOrAdmin) {
      return jsonError("Forbidden", 403, { callerRoles: teamContext.roles });
    }

    const teamMembersTable = admin.from("team_members") as any;
    const profilesTable = admin.from("profiles") as any;

    const { data: memberRows, error: membersError } = await teamMembersTable
      .select("user_id, role")
      .eq("team_id", teamId);

    if (membersError) {
      return jsonError("Failed to load members.", 500, {
        details: membersError,
      });
    }

    const memberUserIds = uniq(
      (memberRows ?? []).map((row: any) => String(row.user_id)),
    );

    const { data: legacyProfiles, error: legacyError } = await profilesTable
      .select("id")
      .eq("team_id", teamId);

    if (legacyError) {
      return jsonError("Failed to load members.", 500, {
        details: legacyError,
      });
    }

    const legacyUserIds = uniq(
      (legacyProfiles ?? []).map((row: any) => String(row.id)),
    );

    const userIds = uniq([...memberUserIds, ...legacyUserIds]);

    if (userIds.length === 0) {
      return NextResponse.json({
        ok: true,
        callerRoles: teamContext.roles,
        members: [],
      });
    }

    const { data: profiles, error: profilesError } = await profilesTable
      .select("id, first_name, last_name, role")
      .in("id", userIds);

    if (profilesError) {
      return jsonError("Failed to load members.", 500, {
        details: profilesError,
      });
    }

    const memberRoleByUserId = new Map<string, TeamRole[]>();

    for (const row of memberRows ?? []) {
      memberRoleByUserId.set(
        String((row as any).user_id),
        normalizeTeamRoles((row as any).role),
      );
    }

    const membersBase: TeamMemberResponse[] = (profiles ?? []).map(
      (profile: any) => {
        const userId = String(profile.id);
        const roles = uniq([
          ...normalizeTeamRoles(profile.role),
          ...(memberRoleByUserId.get(userId) ?? []),
        ]);

        return {
          user_id: userId,
          first_name: profile.first_name ?? null,
          last_name: profile.last_name ?? null,
          roles,
        };
      },
    );

    const members: TeamMemberResponseWithEmail[] = await Promise.all(
      membersBase.map(async (member): Promise<TeamMemberResponseWithEmail> => {
        try {
          const { data } = await admin.auth.admin.getUserById(member.user_id);

          return {
            ...member,
            email:
              typeof data?.user?.email === "string" ? data.user.email : null,
          };
        } catch {
          return { ...member, email: null };
        }
      }),
    );

    return NextResponse.json({
      ok: true,
      callerRoles: teamContext.roles,
      members,
    });
  } catch (error: any) {
    console.error("[team-roles][GET] unexpected error", error);

    return jsonError("Unexpected error", 500, {
      details: error?.message ?? String(error),
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(request, admin);

    if (!auth.ok) {
      return jsonError("Unauthorized", 401);
    }

    const body = (await request.json().catch(() => null)) as {
      teamId?: unknown;
      userId?: unknown;
      roles?: unknown;
    } | null;

    const teamId = getTeamIdFromRequest(request, body?.teamId);
    const targetUserId = normalizeId(body?.userId);

    if (!teamId || !targetUserId) {
      return jsonError("Missing teamId/userId", 400);
    }

    const desiredRoles = normalizeTeamRoles(body?.roles);
    if (desiredRoles.length === 0) {
      return jsonError("At least one role is required.", 400);
    }

    const teamContext = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request,
      requestedTeamId: teamId,
    });

    if (!teamContext.isManagerOrAdmin) {
      return jsonError("Forbidden", 403);
    }

    const isAdmin = teamContext.roles.includes("admin");
    const safeRoles = uniq(
      isAdmin ? desiredRoles : desiredRoles.filter((role) => role !== "Admin"),
    );

    if (safeRoles.length === 0) {
      return jsonError("Managers cannot grant Admin.", 400);
    }

    await resolveUserTeamMembership({
      admin,
      userId: targetUserId,
      request,
      requestedTeamId: teamId,
    });

    const dbRoles = safeRoles.map((role) => TEAM_ROLE_PROFILE_DB_VALUE[role]);

    const profilesTable = admin.from("profiles") as any;
    const teamMembersTable = admin.from("team_members") as any;

    const { error: updateProfileError } = await profilesTable
      .update({ role: dbRoles })
      .eq("id", targetUserId);

    if (updateProfileError) {
      return jsonError("Failed to update profile roles.", 500, {
        details: updateProfileError,
      });
    }

    const { error: updateMemberError } = await teamMembersTable
      .update({ role: dbRoles })
      .eq("team_id", teamId)
      .eq("user_id", targetUserId);

    if (updateMemberError) {
      return jsonError("Failed to update team member roles.", 500, {
        details: updateMemberError,
      });
    }

    return NextResponse.json({
      ok: true,
      roles: safeRoles,
      callerRoles: teamContext.roles,
    });
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (message === "not_a_member_of_team") {
      return jsonError("Target user is not in this team.", 400);
    }

    console.error("[team-roles][PATCH] unexpected error", error);

    return jsonError("Unexpected error", 500, {
      details: error?.message ?? String(error),
    });
  }
}
