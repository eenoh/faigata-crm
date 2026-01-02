import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getOrgIdForUser(userId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .single();

  if (error) return null;
  return (data?.team_id as string | null) ?? null;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!jwt) return NextResponse.json({ connected: false });

  const sb = supabaseAdmin();
  const { data: userData } = await sb.auth.getUser(jwt);
  if (!userData?.user) return NextResponse.json({ connected: false });

  const orgId = await getOrgIdForUser(userData.user.id);
  if (!orgId) return NextResponse.json({ connected: false });

  const { data } = await sb
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", false)
    .maybeSingle();

  return NextResponse.json({ connected: !!data?.stripe_account_id });
}
