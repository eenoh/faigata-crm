import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function getOrgIdForUser(userId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (error) return null;
  return (data?.company_id as string | null) ?? null;
}

export async function getConnectedStripeAccountId(orgId: string, livemode: boolean) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .maybeSingle();

  if (error) return null;
  return (data?.stripe_account_id as string | null) ?? null;
}

export async function getUserFromBearer(jwt: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

export function adminClient() {
  return supabaseAdmin();
}
