import "server-only";

import {
  applyEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  buildLeadNicheOptions,
  findDuplicateNiche,
  normalizeNicheName,
  toNormalizedNicheName,
  type LeadNicheOption,
  type NicheRecord,
} from "@/features/crm/server/niches.shared";

type TeamSummary = {
  id: string;
  name: string | null;
  organization_id: string | null;
};

type TeamNichesSettingsPayload = {
  team: TeamSummary;
  catalog: NicheRecord[];
  enabledNicheIds: string[];
  enabledNiches: NicheRecord[];
};

type LeadFormNichesPayload = {
  options: LeadNicheOption[];
};

type CreateReusableNicheResult = {
  niche: NicheRecord;
  created: boolean;
  alreadyEnabledForTeam: boolean;
};

function parseNicheRow(row: any): NicheRecord | null {
  const id = String(row?.id ?? "").trim();
  const name = String(row?.name ?? "").trim();
  const normalized_name = String(row?.normalized_name ?? "").trim();

  if (!id || !name || !normalized_name) return null;

  return {
    id,
    name,
    normalized_name,
    created_by:
      typeof row?.created_by === "string" && row.created_by.trim()
        ? row.created_by
        : null,
    created_at:
      typeof row?.created_at === "string" && row.created_at.trim()
        ? row.created_at
        : null,
    updated_at:
      typeof row?.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at
        : null,
    organization_id:
      typeof row?.organization_id === "string" && row.organization_id.trim()
        ? row.organization_id
        : null,
    organization_name:
      typeof row?.organization_name === "string" && row.organization_name.trim()
        ? row.organization_name
        : null,
  };
}

async function getTeamSummary(admin: AppSupabaseClient, teamId: string) {
  const { data, error } = await admin
    .from("teams")
    .select("id, name, organization_id")
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw error;

  const team = data as TeamSummary | null;
  if (!team?.id) throw new Error("missing_team");
  return team;
}

async function getOrganizationsById(
  admin: AppSupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { data, error } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", uniqueIds);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of Array.isArray(data) ? data : []) {
    const id = String((row as any)?.id ?? "").trim();
    if (!id) continue;
    map.set(id, String((row as any)?.name ?? "").trim() || "Organization");
  }
  return map;
}

async function getCatalogNiches(
  admin: AppSupabaseClient,
): Promise<NicheRecord[]> {
  const { data, error } = await admin
    .from("niches")
    .select(
      "id, name, normalized_name, organization_id, created_by, created_at, updated_at",
    )
    .order("name", { ascending: true });

  if (error) throw error;

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => parseNicheRow(row))
    .filter((row): row is NicheRecord => Boolean(row));

  const orgMap = await getOrganizationsById(
    admin,
    rows.map((row) => row.organization_id ?? "").filter(Boolean),
  );

  return rows.map((row) => ({
    ...row,
    organization_name: row.organization_id
      ? (orgMap.get(row.organization_id) ?? null)
      : null,
  }));
}

async function getTeamEnabledNiches(
  admin: AppSupabaseClient,
  teamId: string,
): Promise<NicheRecord[]> {
  const { data, error } = await admin
    .from("team_niches")
    .select(
      "niche_id, niches(id, name, normalized_name, organization_id, created_by, created_at, updated_at)",
    )
    .eq("team_id", teamId);

  if (error) throw error;

  const rows = (Array.isArray(data) ? data : [])
    .map((row: any) => parseNicheRow(row?.niches))
    .filter((row): row is NicheRecord => Boolean(row));

  const orgMap = await getOrganizationsById(
    admin,
    rows.map((row) => row.organization_id ?? "").filter(Boolean),
  );

  return rows
    .map((row) => ({
      ...row,
      organization_name: row.organization_id
        ? (orgMap.get(row.organization_id) ?? null)
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getNicheById(
  admin: AppSupabaseClient,
  nicheId: string,
): Promise<NicheRecord | null> {
  const { data, error } = await admin
    .from("niches")
    .select(
      "id, name, normalized_name, organization_id, created_by, created_at, updated_at",
    )
    .eq("id", nicheId)
    .maybeSingle();

  if (error) throw error;

  const niche = parseNicheRow(data);
  if (!niche) return null;

  const orgMap = await getOrganizationsById(
    admin,
    niche.organization_id ? [niche.organization_id] : [],
  );

  return {
    ...niche,
    organization_name: niche.organization_id
      ? (orgMap.get(niche.organization_id) ?? null)
      : null,
  };
}

async function isNicheEnabledForTeam(
  admin: AppSupabaseClient,
  teamId: string,
  nicheId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("team_niches")
    .select("team_id, niche_id")
    .eq("team_id", teamId)
    .eq("niche_id", nicheId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function enableNicheForTeam(
  admin: AppSupabaseClient,
  teamId: string,
  nicheId: string,
): Promise<void> {
  const alreadyEnabled = await isNicheEnabledForTeam(admin, teamId, nicheId);
  if (alreadyEnabled) return;

  const { error } = await admin.from("team_niches").insert({
    team_id: teamId,
    niche_id: nicheId,
  });

  if (error) throw error;
}

export async function getTeamNichesSettingsData(args: {
  admin: AppSupabaseClient;
  teamId: string;
  requestedLocale?: string;
}): Promise<TeamNichesSettingsPayload> {
  const team = await getTeamSummary(args.admin, args.teamId);
  const [catalog, enabledNiches] = await Promise.all([
    getCatalogNiches(args.admin),
    getTeamEnabledNiches(args.admin, args.teamId),
  ]);

  if (args.requestedLocale) {
    await applyEntityTranslations({
      admin: args.admin,
      teamId: args.teamId,
      organizationId: team.organization_id,
      entityTable: "niches",
      rows: catalog,
      requestedLocale: args.requestedLocale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name,
          assign: (row, value) => {
            row.name = value;
          },
        },
      ],
    });

    await applyEntityTranslations({
      admin: args.admin,
      teamId: args.teamId,
      organizationId: team.organization_id,
      entityTable: "niches",
      rows: enabledNiches,
      requestedLocale: args.requestedLocale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name,
          assign: (row, value) => {
            row.name = value;
          },
        },
      ],
    });
  }

  return {
    team,
    catalog,
    enabledNicheIds: enabledNiches.map((niche) => niche.id),
    enabledNiches,
  };
}

export async function getLeadFormNichesData(args: {
  admin: AppSupabaseClient;
  teamId: string;
  includeArchivedNicheId?: string | null;
  requestedLocale?: string;
}): Promise<LeadFormNichesPayload> {
  const [enabledNiches, team] = await Promise.all([
    getTeamEnabledNiches(args.admin, args.teamId),
    getTeamSummary(args.admin, args.teamId),
  ]);

  let archived: NicheRecord | null = null;
  if (args.includeArchivedNicheId?.trim()) {
    archived = await getNicheById(
      args.admin,
      args.includeArchivedNicheId.trim(),
    );
  }

  if (args.requestedLocale) {
    await applyEntityTranslations({
      admin: args.admin,
      teamId: args.teamId,
      organizationId: team.organization_id,
      entityTable: "niches",
      rows: enabledNiches,
      requestedLocale: args.requestedLocale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name,
          assign: (row, value) => {
            row.name = value;
          },
        },
      ],
    });

    if (archived) {
      await applyEntityTranslations({
        admin: args.admin,
        teamId: args.teamId,
        organizationId: team.organization_id,
        entityTable: "niches",
        rows: [archived],
        requestedLocale: args.requestedLocale,
        fields: [
          {
            fieldKey: "name",
            sourceText: (row) => row.name,
            assign: (row, value) => {
              row.name = value;
            },
          },
        ],
      });
    }
  }

  return {
    options: buildLeadNicheOptions({
      enabled: enabledNiches,
      archived,
    }),
  };
}

export async function createReusableNiche(args: {
  admin: AppSupabaseClient;
  teamId: string;
  userId: string;
  name: string;
  sourceLocale?: string | null;
}): Promise<CreateReusableNicheResult> {
  const team = await getTeamSummary(args.admin, args.teamId);

  const cleanedName = normalizeNicheName(args.name);
  const normalizedName = toNormalizedNicheName(args.name);

  if (!cleanedName) throw new Error("missing_name");

  const existingCatalog = await getCatalogNiches(args.admin);
  const duplicate = findDuplicateNiche(existingCatalog, normalizedName);

  if (duplicate) {
    const alreadyEnabledForTeam = await isNicheEnabledForTeam(
      args.admin,
      args.teamId,
      duplicate.id,
    );

    if (!alreadyEnabledForTeam) {
      await enableNicheForTeam(args.admin, args.teamId, duplicate.id);
    }

    return {
      niche: duplicate,
      created: false,
      alreadyEnabledForTeam,
    };
  }

  const insertPayload = {
    name: cleanedName,
    normalized_name: normalizedName,
    organization_id: team.organization_id,
    created_by: args.userId,
  };

  const { data, error } = await args.admin
    .from("niches")
    .insert(insertPayload as any)
    .select(
      "id, name, normalized_name, organization_id, created_by, created_at, updated_at",
    )
    .single();

  if (error) throw error;

  const niche = parseNicheRow(data);
  if (!niche) throw new Error("niche_insert_failed");

  await enableNicheForTeam(args.admin, args.teamId, niche.id);

  const orgMap = await getOrganizationsById(
    args.admin,
    niche.organization_id ? [niche.organization_id] : [],
  );

  await syncEntityTranslationSources({
    admin: args.admin,
    teamId: args.teamId,
    organizationId: niche.organization_id,
    entityTable: "niches",
    rows: [niche],
    fields: [{ fieldKey: "name", sourceText: (row) => row.name }],
    sourceLocale: args.sourceLocale,
  });

  return {
    niche: {
      ...niche,
      organization_name: niche.organization_id
        ? (orgMap.get(niche.organization_id) ?? null)
        : null,
    },
    created: true,
    alreadyEnabledForTeam: false,
  };
}

export async function saveTeamNicheSelection(args: {
  admin: AppSupabaseClient;
  teamId: string;
  nicheIds: string[];
}) {
  const requestedIds = Array.from(
    new Set(args.nicheIds.map((id) => id.trim()).filter(Boolean)),
  );

  if (requestedIds.length > 0) {
    const { data, error } = await args.admin
      .from("niches")
      .select("id")
      .in("id", requestedIds);

    if (error) throw error;

    const foundIds = new Set(
      (Array.isArray(data) ? data : []).map((row: any) => String(row.id)),
    );

    if (foundIds.size !== requestedIds.length) {
      throw new Error("invalid_niche_selection");
    }
  }

  const { error: deleteError } = await args.admin
    .from("team_niches")
    .delete()
    .eq("team_id", args.teamId);

  if (deleteError) throw deleteError;

  if (requestedIds.length === 0) {
    return { nicheIds: [] };
  }

  const { error: insertError } = await args.admin.from("team_niches").insert(
    requestedIds.map((nicheId) => ({
      team_id: args.teamId,
      niche_id: nicheId,
    })),
  );

  if (insertError) throw insertError;

  return { nicheIds: requestedIds };
}

export async function resolveEnabledLeadNiche(args: {
  admin: AppSupabaseClient;
  teamId: string;
  nicheId: string;
}): Promise<NicheRecord | null> {
  const { data, error } = await args.admin
    .from("team_niches")
    .select(
      "niche_id, niches(id, name, normalized_name, organization_id, created_by, created_at, updated_at)",
    )
    .eq("team_id", args.teamId)
    .eq("niche_id", args.nicheId)
    .maybeSingle();

  if (error) {
    console.error("[resolveEnabledLeadNiche] failed", error);
    return null;
  }

  const niche = parseNicheRow((data as any)?.niches);
  if (!niche) return null;

  const orgMap = await getOrganizationsById(
    args.admin,
    niche.organization_id ? [niche.organization_id] : [],
  );

  return {
    ...niche,
    organization_name: niche.organization_id
      ? (orgMap.get(niche.organization_id) ?? null)
      : null,
  };
}
