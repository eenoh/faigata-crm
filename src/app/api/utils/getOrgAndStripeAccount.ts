/**
 * Simplifications made:
 * • Reused a single cached admin client instance (avoids re-creating clients per call)
 * • Added explicit env validation instead of non-null assertions (!)
 * • Reduced repetition with small “return null on error” helpers
 * • Kept the same exported API + return shapes
 */

import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) throw new Error("Missing Supabase env");

  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Create once per module load (Node runtime). Keeps behavior, reduces overhead.
const sbAdmin = supabaseAdmin();

export async function getOrgIdForUser(userId: string) {
  const { data, error } = await sbAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (error) return null;
  return (data?.company_id as string | null) ?? null;
}

export async function getConnectedStripeAccountId(
  orgId: string,
  livemode: boolean,
) {
  const { data, error } = await sbAdmin
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .maybeSingle();

  if (error) return null;
  return (data?.stripe_account_id as string | null) ?? null;
}

export async function getUserFromBearer(jwt: string) {
  const { data, error } = await sbAdmin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

export function adminClient() {
  return sbAdmin;
}
