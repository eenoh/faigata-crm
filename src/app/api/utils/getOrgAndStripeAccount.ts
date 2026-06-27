import { getUserFromAccessToken } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureOrgIdForUser,
  getConnectedStripeAccountId,
} from "@/features/organizations/server/organization.service";

export async function getOrgIdForUser(userId: string) {
  return ensureOrgIdForUser(userId);
}

export { getConnectedStripeAccountId };

export async function getUserFromBearer(jwt: string) {
  return getUserFromAccessToken(jwt);
}

export function adminClient() {
  return getSupabaseAdminClient();
}
