// src/app/api/integrations/stripe/connect/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../_org";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
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

  // ✅ always resolve an organizations.id
  const orgId = await ensureOrgIdForUser(sb as any, userId);
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
