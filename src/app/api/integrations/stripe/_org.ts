// src/app/api/integrations/stripe/_org.ts

import type { SupabaseClient } from "@supabase/supabase-js";

const TEAM_ORG_COLS = ["organization_id", "org_id", "organizationId"] as const;

const asTrimmedString = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
};

async function maybeSingleId(sb: SupabaseClient, id: string) {
  const { data, error } = await sb
    .from("organizations")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  const found = (data as any)?.id;
  return found ? String(found) : null;
}

async function ensureOrganizationRow(
  sb: SupabaseClient,
  orgId: string,
  name: string,
): Promise<string | null> {
  const exists = await maybeSingleId(sb, orgId);
  if (exists) return exists;

  // Create the organization using EXACT id (important for FK)
  const { data, error } = await sb
    .from("organizations")
    .upsert({ id: orgId, name } as any, { onConflict: "id" })
    .select("id")
    .single();

  if (error) return null;
  return (data as any)?.id ? String((data as any).id) : null;
}

async function safeSelectTeamName(
  sb: SupabaseClient,
  teamId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();

  if (error) return null;
  return asTrimmedString((data as any)?.name);
}

async function tryReadTeamOrgId(
  sb: SupabaseClient,
  teamId: string,
): Promise<string | null> {
  for (const col of TEAM_ORG_COLS) {
    const { data, error } = await sb
      .from("teams")
      .select(`id, ${col}`)
      .eq("id", teamId)
      .maybeSingle();

    if (error) continue;

    const v = (data as any)?.[col];
    if (typeof v === "string" && v.length) return v;
  }
  return null;
}

async function tryWriteTeamOrgId(
  sb: SupabaseClient,
  teamId: string,
  orgId: string,
) {
  for (const col of TEAM_ORG_COLS) {
    const patch: Record<string, any> = { [col]: orgId };
    const { error } = await sb.from("teams").update(patch).eq("id", teamId);
    if (!error) return true;
  }
  return false;
}

async function tryWriteProfileCompanyId(
  sb: SupabaseClient,
  userId: string,
  orgId: string,
) {
  // best-effort: don’t fail the flow if this column doesn’t exist / RLS, etc.
  const { error } = await sb
    .from("profiles")
    .update({ company_id: orgId } as any)
    .eq("id", userId);

  return !error;
}

/**
 * ✅ STRONG GUARANTEE:
 * returns an orgId that EXISTS in organizations.id (or null if impossible).
 *
 * Strategy:
 * 1) profile.company_id -> if set, ensure organizations row exists for that exact id
 * 2) profile.team_id -> ensure organizations row exists for that exact id (common pattern)
 * 3) teams.organization_id/org_id -> ensure organizations row exists
 * 4) create fresh org (generated id) and link best-effort
 */
export async function ensureOrgIdForUser(
  sb: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("team_id, company_id")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return null;

  const companyId = (profile as any)?.company_id
    ? String((profile as any).company_id)
    : null;

  const teamId = (profile as any)?.team_id
    ? String((profile as any).team_id)
    : null;

  const teamName = teamId ? await safeSelectTeamName(sb, teamId) : null;
  const fallbackName = teamName || "New organization";

  // 1) company_id candidate
  if (companyId) {
    const ensured = await ensureOrganizationRow(sb, companyId, fallbackName);
    if (ensured) return ensured;
  }

  // 2) team_id candidate
  if (teamId) {
    const ensured = await ensureOrganizationRow(sb, teamId, fallbackName);
    if (ensured) return ensured;
  }

  // 3) team explicit org id field
  if (teamId) {
    const teamOrgId = await tryReadTeamOrgId(sb, teamId);
    if (teamOrgId) {
      const ensured = await ensureOrganizationRow(sb, teamOrgId, fallbackName);
      if (ensured) return ensured;
    }
  }

  // 4) last resort: create a brand new org with generated id
  const { data: newOrg, error: insErr } = await sb
    .from("organizations")
    .insert({ name: fallbackName } as any)
    .select("id")
    .single();

  if (insErr || !(newOrg as any)?.id) return null;

  const newOrgId = String((newOrg as any).id);

  // best-effort linking
  if (teamId) await tryWriteTeamOrgId(sb, teamId, newOrgId);
  await tryWriteProfileCompanyId(sb, userId, newOrgId);

  return newOrgId;
}
