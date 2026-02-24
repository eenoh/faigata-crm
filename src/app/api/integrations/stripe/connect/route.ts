// src/app/api/integrations/stripe/connect/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../_org";

export const runtime = "nodejs";

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!jwt) return jsonError("missing_token", 401);

  const sb = supabaseAdmin();

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonError("invalid_session", 401);

  const userId = userData.user.id;

  // Always resolve an organizations.id
  const orgId = await ensureOrgIdForUser(sb as any, userId);
  if (!orgId) return jsonError("missing_org", 400);

  const clientId = process.env.STRIPE_CLIENT_ID_TEST;
  const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI_TEST;

  if (!clientId || !redirectUri) return jsonError("stripe_env_missing", 500);

  const statePayload = {
    orgId,
    userId,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
    livemode: false,
  };

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const authUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "read_write");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return NextResponse.json({ authUrl: authUrl.toString() });
}
