import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureOrgIdForUser } from "@/features/organizations/server/organization.service";

export async function GET(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth.ok) return NextResponse.json({ connected: false });

  const supabase = getSupabaseAdminClient();
  const orgId = await ensureOrgIdForUser(auth.user.id, supabase);
  if (!orgId) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", false)
    .maybeSingle();

  return NextResponse.json({
    connected: Boolean((data as { stripe_account_id?: string | null } | null)?.stripe_account_id),
  });
}
