// src/app/api/integrations/stripe/connect/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * IMPORTANT:
 * Billing uses profiles.team_id as orgId.
 * Stripe connect MUST store the mapping under the same orgId.
 */
async function getOrgIdForUser(userId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .single();

  if (error) return null;
  return (data?.team_id as string | null) ?? null;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  const userId = userData.user.id;
  const orgId = await getOrgIdForUser(userId);
  if (!orgId) return NextResponse.json({ error: "missing_org" }, { status: 400 });

  const clientId = process.env.STRIPE_CLIENT_ID_TEST;
  const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI_TEST;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "stripe_env_missing" }, { status: 500 });
  }

  const statePayload = {
    orgId,
    userId,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
    livemode: false,
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const authUrl =
    "https://connect.stripe.com/oauth/authorize" +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&scope=read_write` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.json({ authUrl });
}
