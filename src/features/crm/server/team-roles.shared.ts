import "server-only";

export const AVAILABLE_TEAM_ROLES = [
  "Prospector",
  "Setter",
  "Closer",
  "Manager",
  "Admin",
] as const;

export type TeamRole = (typeof AVAILABLE_TEAM_ROLES)[number];

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

export const TEAM_ROLE_PROFILE_DB_VALUE: Record<TeamRole, string> = {
  Prospector: "prospector",
  Setter: "setter",
  Closer: "closer",
  Manager: "manager",
  Admin: "admin",
};

export const TEAM_ROLE_INVITE_DB_VALUE: Record<TeamRole, TeamRole> = {
  Prospector: "Prospector",
  Setter: "Setter",
  Closer: "Closer",
  Manager: "Manager",
  Admin: "Admin",
};

export function uniq<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

export function toTeamRole(value: unknown): TeamRole | null {
  if (value == null) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  return ROLE_CANONICAL[normalized] ?? ROLE_CANONICAL[normalized.toLowerCase()] ?? null;
}

export function normalizeTeamRoles(value: unknown): TeamRole[] {
  if (Array.isArray(value)) {
    return uniq(
      value.map(toTeamRole).filter((role): role is TeamRole => Boolean(role)),
    );
  }

  const single = toTeamRole(value);
  return single ? [single] : [];
}
