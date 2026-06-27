import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  normalizeWorkspaceRole,
  normalizeWorkspaceRoles,
  resolveUserTeamMembership,
} from "@/features/organizations/server/team-membership.service";

export type CrmRole = "admin" | "manager" | "member";

export function normalizeCrmRole(value: unknown): CrmRole {
  const normalized = normalizeWorkspaceRole(value);

  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";

  return "member";
}

export function normalizeCrmRoles(value: unknown): CrmRole[] {
  return normalizeWorkspaceRoles(value).map(normalizeCrmRole);
}

export function isManagerOrAdmin(roles: CrmRole[]) {
  return roles.includes("admin") || roles.includes("manager");
}

export async function resolveCrmTeamContext(args: {
  admin: AppSupabaseClient;
  userId: string;
  request: Request;
  requestedTeamId?: string | null;
}) {
  const membership = await resolveUserTeamMembership(args);
  const roles = membership.roles.map(normalizeCrmRole);
  const normalizedRoles = roles.length ? roles : (["member"] as CrmRole[]);

  return {
    teamId: membership.teamId,
    roles: normalizedRoles,
    isManagerOrAdmin: isManagerOrAdmin(normalizedRoles),
  };
}
