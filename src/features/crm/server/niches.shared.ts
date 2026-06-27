export type NicheRecord = {
  id: string;
  name: string;
  normalized_name: string;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  organization_id: string | null;
  organization_name?: string | null;
  scope?: "global" | "organization";
  visibility?: "public" | "private";
};

export type LeadNicheOption = {
  id: string;
  label: string;
  archived: boolean;
  normalizedName: string;
  description?: string;
};

export function normalizeNicheName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function toNormalizedNicheName(value: string): string {
  return normalizeNicheName(value).toLowerCase();
}

export function resolveLeadNicheOption(
  options: LeadNicheOption[],
  value: string | null | undefined,
): LeadNicheOption | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const directMatch =
    options.find((option) => option.id === raw) ?? null;
  if (directMatch) return directMatch;

  const normalized = toNormalizedNicheName(raw);

  return (
    options.find((option) => {
      const normalizedLabel = toNormalizedNicheName(option.label);
      const normalizedName = toNormalizedNicheName(option.normalizedName);

      return (
        normalizedLabel === normalized ||
        normalizedName === normalized
      );
    }) ?? null
  );
}

export function findDuplicateNiche(
  catalog: NicheRecord[],
  normalizedName: string,
  currentOrganizationId?: string | null,
): NicheRecord | null {
  return (
    catalog.find(
      (niche) =>
        niche.normalized_name.trim().toLowerCase() === normalizedName &&
        (!currentOrganizationId ||
          canTeamSelectNiche(niche, currentOrganizationId)),
    ) ?? null
  );
}

export function buildLeadNicheOptions(args: {
  enabled: NicheRecord[];
  currentOrganizationId?: string | null;
  archived?: NicheRecord | null;
}): LeadNicheOption[] {
  const map = new Map<string, LeadNicheOption>();

  const enabled = args.currentOrganizationId
    ? args.enabled.filter((niche) =>
        canTeamSelectNiche(niche, args.currentOrganizationId),
      )
    : args.enabled;

  for (const niche of enabled) {
    map.set(niche.id, {
      id: niche.id,
      label: niche.name,
      archived: false,
      normalizedName: niche.normalized_name,
      description: describeNiche(niche),
    });
  }

  if (args.archived && !map.has(args.archived.id)) {
    map.set(args.archived.id, {
      id: args.archived.id,
      label: args.archived.name,
      archived: true,
      normalizedName: args.archived.normalized_name,
      description: "Archived / no longer enabled",
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.archived !== b.archived) {
      return a.archived ? -1 : 1;
    }

    return a.label.localeCompare(b.label);
  });
}

function isGlobalNiche(niche: NicheRecord) {
  return niche.scope === "global" || niche.organization_id == null;
}

function describeNiche(niche: NicheRecord) {
  if (isGlobalNiche(niche)) {
    return "Shared across all teams";
  }

  if (niche.organization_name) {
    return `Created by ${niche.organization_name}`;
  }

  return "Created by your organization";
}

export function canTeamSelectNiche(
  niche: NicheRecord,
  currentOrganizationId: string | null | undefined,
) {
  if (isGlobalNiche(niche)) {
    return true;
  }

  if (!niche.organization_id) {
    return true;
  }

  if (niche.organization_id === (currentOrganizationId ?? null)) {
    return true;
  }

  return niche.visibility === "public";
}

export function groupCatalogNiches(
  catalog: NicheRecord[],
  currentOrganizationId: string | null | undefined,
) {
  const selectable = catalog.filter((niche) =>
    canTeamSelectNiche(niche, currentOrganizationId),
  );
  const byName = (a: NicheRecord, b: NicheRecord) => a.name.localeCompare(b.name);

  return {
    global: selectable.filter((niche) => isGlobalNiche(niche)).sort(byName),
    organization: selectable
      .filter(
        (niche) =>
          !isGlobalNiche(niche) &&
          niche.organization_id === (currentOrganizationId ?? null),
      )
      .sort(byName),
    "public-other": selectable
      .filter(
        (niche) =>
          !isGlobalNiche(niche) &&
          niche.organization_id !== (currentOrganizationId ?? null),
      )
      .sort(byName),
  };
}
