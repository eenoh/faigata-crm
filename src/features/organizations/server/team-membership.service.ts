import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";

const TEAM_ORG_COLUMNS = [
  "organization_id",
  "org_id",
  "organizationId",
] as const;

export type WorkspaceRole = "admin" | "manager" | "closer" | "member";

type TeamMemberRow = {
  team_id: string;
  role: unknown;
  joined_at?: string | null;
};

type ProfileRow = {
  team_id: string | null;
  company_id: string | null;
};

export type ResolvedTeamMembership = {
  teamId: string;
  orgId: string | null;
  roles: WorkspaceRole[];
  highestRole: WorkspaceRole;
  roleSources: {
    teamMembers: WorkspaceRole[];
    profiles: WorkspaceRole[];
  };
};

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "closer") return "closer";

  return "member";
}

export function normalizeWorkspaceRoles(value: unknown): WorkspaceRole[] {
  if (Array.isArray(value)) {
    return value.map(normalizeWorkspaceRole);
  }

  if (value == null) return [];

  return [normalizeWorkspaceRole(value)];
}

export function pickHighestWorkspaceRole(
  roles: readonly WorkspaceRole[],
): WorkspaceRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("closer")) return "closer";

  return "member";
}

function mergeUniqueRoles(...groups: WorkspaceRole[][]): WorkspaceRole[] {
  const merged = new Set<WorkspaceRole>();

  for (const group of groups) {
    for (const role of group) {
      merged.add(role);
    }
  }

  return merged.size ? Array.from(merged) : ["member"];
}

function collectTeamMemberRoles(rows: TeamMemberRow[]): WorkspaceRole[] {
  const merged = new Set<WorkspaceRole>();

  for (const row of rows) {
    for (const role of normalizeWorkspaceRoles(row.role)) {
      merged.add(role);
    }
  }

  return Array.from(merged);
}

function getRequestedTeamId(
  request: Request,
  requestedTeamId?: string | null,
): string | null {
  if (requestedTeamId?.trim()) return requestedTeamId.trim();

  const url = new URL(request.url);
  const queryTeamId = url.searchParams.get("teamId")?.trim();
  if (queryTeamId) return queryTeamId;

  const headerTeamId = request.headers.get("x-team-id")?.trim();
  return headerTeamId || null;
}

function isMissingTeamMembersTable(error: unknown) {
  const message = String(
    (error as { message?: string })?.message ?? "",
  ).toLowerCase();
  const code = String((error as { code?: string })?.code ?? "");

  return (
    code === "42P01" ||
    (message.includes("relation") && message.includes("team_members"))
  );
}

async function getTeamOrganizationId(
  admin: AppSupabaseClient,
  teamId: string,
): Promise<string | null> {
  for (const column of TEAM_ORG_COLUMNS) {
    const { data, error } = await admin
      .from("teams")
      .select(`id, ${column}`)
      .eq("id", teamId)
      .maybeSingle();

    if (error) continue;

    const value = (data as Record<string, unknown> | null)?.[column];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

export async function resolveUserTeamMembership(args: {
  admin: AppSupabaseClient;
  userId: string;
  request: Request;
  requestedTeamId?: string | null;
}): Promise<ResolvedTeamMembership> {
  const { admin, userId, request, requestedTeamId: requestedTeamIdOverride } =
    args;
  const requestedTeamId = getRequestedTeamId(request, requestedTeamIdOverride);

  let membershipTeamId: string | null = null;
  let teamMemberRoles: WorkspaceRole[] = [];
  let missingTeamMembersTable = false;

  try {
    if (requestedTeamId) {
      const { data, error } = await admin
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", userId)
        .eq("team_id", requestedTeamId);

      if (error) throw error;

      const memberships = (Array.isArray(data) ? data : []) as TeamMemberRow[];
      const matchingMemberships = memberships.filter(
        (membership) => membership?.team_id === requestedTeamId,
      );
      if (!matchingMemberships.length) {
        throw new Error("not_a_member_of_team");
      }

      membershipTeamId = requestedTeamId;
      teamMemberRoles = collectTeamMemberRoles(matchingMemberships);
    } else {
      const { data, error } = await admin
        .from("team_members")
        .select("team_id, role, joined_at")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true, nullsFirst: true })
        .limit(50);

      if (error) throw error;

      const memberships = (Array.isArray(data) ? data : []) as TeamMemberRow[];
      const firstTeamId =
        memberships.find(
          (membership) =>
            typeof membership?.team_id === "string" &&
            membership.team_id.trim().length > 0,
        )?.team_id ?? null;

      if (firstTeamId) {
        membershipTeamId = String(firstTeamId);
        teamMemberRoles = collectTeamMemberRoles(
          memberships.filter((membership) => membership?.team_id === firstTeamId),
        );
      }
    }
  } catch (error) {
    if (!isMissingTeamMembersTable(error)) throw error;
    missingTeamMembersTable = true;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("team_id, company_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error("profile_lookup_failed");

  const profileRow = (profile as ProfileRow | null) ?? null;
  const profileRoles: WorkspaceRole[] = [];
  const profileTeamId = profileRow?.team_id?.trim() || null;

  if (
    requestedTeamId &&
    missingTeamMembersTable &&
    profileTeamId &&
    profileTeamId !== requestedTeamId
  ) {
    throw new Error("not_a_member_of_team");
  }

  const teamId = membershipTeamId ?? profileTeamId;
  if (!teamId) throw new Error("missing_team");

  if (requestedTeamId && teamId !== requestedTeamId) {
    throw new Error("not_a_member_of_team");
  }

  const orgId =
    (await getTeamOrganizationId(admin, teamId)) ?? profileRow?.company_id ?? null;
  const roles = mergeUniqueRoles(teamMemberRoles, profileRoles);

  return {
    teamId,
    orgId,
    roles,
    highestRole: pickHighestWorkspaceRole(roles),
    roleSources: {
      teamMembers: teamMemberRoles,
      profiles: profileRoles,
    },
  };
}
