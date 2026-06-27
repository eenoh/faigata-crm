import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureOrgIdForUser } from "@/features/organizations/server/organization.service";

export const runtime = "nodejs";

const jsonError = (
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth.ok) return jsonError(auth.reason, 401);

  const supabase = getSupabaseAdminClient();
  const orgId = await ensureOrgIdForUser(auth.user.id, supabase);
  if (!orgId) return jsonError("missing_org", 400);

  const { error } = await supabase
    .from("organization_stripe_accounts")
    .delete()
    .eq("org_id", orgId)
    .eq("livemode", false);

  if (error) return jsonError("db_delete_failed", 500, { details: error });

  return NextResponse.json({ ok: true });
}
