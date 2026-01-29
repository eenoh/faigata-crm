// src/app/api/integrations/stripe/disconnect/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../_org";

export const runtime = "nodejs";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: userData } = await sb.auth.getUser(jwt);
  if (!userData?.user) return NextResponse.json({ error: "invalid_session" }, { status: 401 });

  const orgId = await ensureOrgIdForUser(sb as any, userData.user.id);
  if (!orgId) return NextResponse.json({ error: "missing_org" }, { status: 400 });

  const { error } = await sb
    .from("organization_stripe_accounts")
    .delete()
    .eq("org_id", orgId)
    .eq("livemode", false);

  if (error) {
    return NextResponse.json({ error: "db_delete_failed", details: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
