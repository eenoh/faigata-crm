// src/app/api/integrations/stripe/status/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../_org";

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) throw new Error("Missing Supabase env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
};

export async function GET(req: Request) {
  const jwt = getBearerToken(req);
  if (!jwt) return NextResponse.json({ connected: false });

  const sb = supabaseAdmin();

  const { data: userData } = await sb.auth.getUser(jwt);
  if (!userData?.user) return NextResponse.json({ connected: false });

  const orgId = await ensureOrgIdForUser(sb as any, userData.user.id);
  if (!orgId) return NextResponse.json({ connected: false });

  const { data } = await sb
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", false)
    .maybeSingle();

  return NextResponse.json({
    connected: Boolean(data?.stripe_account_id),
  });
}
