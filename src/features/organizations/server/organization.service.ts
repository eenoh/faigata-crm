import "server-only";

import type { Database } from "@/types/database";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const TEAM_ORG_COLUMNS = [
  "organization_id",
  "org_id",
  "organizationId",
] as const;

type OrganizationInsert =
  Database["public"]["Tables"]["organizations"]["Insert"];
type TeamUpdate = Database["public"]["Tables"]["teams"]["Update"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function maybeSingleId(
  supabase: AppSupabaseClient,
  id: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;

  const value = (data as { id?: unknown } | null)?.id;
  return typeof value === "string" ? value : null;
}

async function ensureOrganizationRow(
  supabase: AppSupabaseClient,
  orgId: string,
  name: string,
): Promise<string | null> {
  const existing = await maybeSingleId(supabase, orgId);
  if (existing) return existing;

  const payload: OrganizationInsert = {
    id: orgId,
    name,
  };

  const { data, error } = await supabase
    .from("organizations")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();

  if (error) return null;

  return ((data as { id?: string } | null)?.id ?? null) as string | null;
}

async function getTeamName(
  supabase: AppSupabaseClient,
  teamId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();

  if (error) return null;

  return asTrimmedString((data as { name?: unknown } | null)?.name);
}

async function readTeamOrgId(
  supabase: AppSupabaseClient,
  teamId: string,
): Promise<string | null> {
  for (const column of TEAM_ORG_COLUMNS) {
    const { data, error } = await supabase
      .from("teams")
      .select(`id, ${column}`)
      .eq("id", teamId)
      .maybeSingle();

    if (error) continue;

    const value = (data as Record<string, unknown> | null)?.[column];
    if (typeof value === "string" && value.trim()) return value;
  }

  return null;
}

async function writeTeamOrgId(
  supabase: AppSupabaseClient,
  teamId: string,
  orgId: string,
): Promise<boolean> {
  for (const column of TEAM_ORG_COLUMNS) {
    const patch = { [column]: orgId } as TeamUpdate;
    const { error } = await supabase
      .from("teams")
      .update(patch)
      .eq("id", teamId);

    if (!error) return true;
  }

  return false;
}

async function writeProfileCompanyId(
  supabase: AppSupabaseClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const patch: ProfileUpdate = { company_id: orgId };

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  return !error;
}

export async function ensureOrgIdForUser(
  userId: string,
  supabase: AppSupabaseClient = getSupabaseAdminClient(),
): Promise<string | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("team_id, company_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;

  const profileRow = (profile as {
    team_id?: string | null;
    company_id?: string | null;
  } | null) ?? { team_id: null, company_id: null };

  const companyId = profileRow.company_id ?? null;
  const teamId = profileRow.team_id ?? null;
  const teamName = teamId ? await getTeamName(supabase, teamId) : null;
  const organizationName = teamName || "New organization";

  if (companyId) {
    const ensured = await ensureOrganizationRow(
      supabase,
      companyId,
      organizationName,
    );
    if (ensured) return ensured;
  }

  if (teamId) {
    const ensured = await ensureOrganizationRow(
      supabase,
      teamId,
      organizationName,
    );
    if (ensured) return ensured;
  }

  if (teamId) {
    const teamOrgId = await readTeamOrgId(supabase, teamId);
    if (teamOrgId) {
      const ensured = await ensureOrganizationRow(
        supabase,
        teamOrgId,
        organizationName,
      );
      if (ensured) return ensured;
    }
  }

  const insertPayload: OrganizationInsert = {
    name: organizationName,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("organizations")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) return null;

  const orgId = ((inserted as { id?: string } | null)?.id ?? null) as
    | string
    | null;

  if (!orgId) return null;

  if (teamId) await writeTeamOrgId(supabase, teamId, orgId);
  await writeProfileCompanyId(supabase, userId, orgId);

  return orgId;
}

export async function getConnectedStripeAccountId(
  orgId: string,
  livemode: boolean,
  supabase: AppSupabaseClient = getSupabaseAdminClient(),
): Promise<string | null> {
  const { data, error } = await supabase
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .maybeSingle();

  if (error) return null;

  return ((data as { stripe_account_id?: string } | null)?.stripe_account_id ??
    null) as string | null;
}

export function getOrganizationsAdminClient(): AppSupabaseClient {
  return getSupabaseAdminClient();
}
