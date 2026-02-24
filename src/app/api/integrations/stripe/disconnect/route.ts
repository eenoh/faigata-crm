// src/app/api/integrations/stripe/disconnect/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../_org";

export const runtime = "nodejs";

const jsonError = (
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) => NextResponse.json({ error, ...extra }, { status });

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) throw new Error("Missing Supabase env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
};

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!jwt) return jsonError("unauthorized", 401);

  const sb = supabaseAdmin();

  const { data: userData } = await sb.auth.getUser(jwt);
  if (!userData?.user) return jsonError("invalid_session", 401);

  const orgId = await ensureOrgIdForUser(sb as any, userData.user.id);
  if (!orgId) return jsonError("missing_org", 400);

  const { error } = await sb
    .from("organization_stripe_accounts")
    .delete()
    .eq("org_id", orgId)
    .eq("livemode", false);

  if (error) return jsonError("db_delete_failed", 500, { details: error });

  return NextResponse.json({ ok: true });
}
