import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ensureOrgIdForUser as ensureOrgId } from "@/features/organizations/server/organization.service";

export async function ensureOrgIdForUser(
  supabase: AppSupabaseClient,
  userId: string,
) {
  return ensureOrgId(userId, supabase);
}
