// src/app/api/integrations/stripe/connect/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../../_org";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

type StatePayload = {
  orgId: string;
  userId: string;
  nonce: string;
  ts: number;
  livemode?: boolean;
};

function safeDecodeState(state: string): StatePayload | null {
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed?.orgId || !parsed?.userId || !parsed?.nonce || !parsed?.ts) return null;
    return parsed as StatePayload;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stripeError = url.searchParams.get("error");

  // ✅ your UI is /settings/integrations
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectBase = `${appUrl}/profile/integrations`;

  if (stripeError) {
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(stripeError)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${redirectBase}?error=missing_code_or_state`);
  }

  const payload = safeDecodeState(state);
  if (!payload) {
    return NextResponse.redirect(`${redirectBase}?error=invalid_state`);
  }

  const MAX_AGE_MS = 10 * 60 * 1000;
  if (Date.now() - Number(payload.ts) > MAX_AGE_MS) {
    return NextResponse.redirect(`${redirectBase}?error=state_expired`);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY_TEST;
  if (!stripeSecret) {
    return NextResponse.redirect(`${redirectBase}?error=stripe_secret_missing`);
  }

  const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${stripeSecret}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }),
  });

  const tokenJson: any = await tokenRes.json().catch(() => null);

  if (!tokenRes.ok) {
    const msg = tokenJson?.error_description || tokenJson?.error || "token_exchange_failed";
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(msg)}`);
  }

  const connectedAccountId = tokenJson?.stripe_user_id as string | undefined;
  if (!connectedAccountId?.startsWith("acct_")) {
    return NextResponse.redirect(`${redirectBase}?error=missing_connected_account`);
  }

  const sb = supabaseAdmin();

  const orgId = await ensureOrgIdForUser(sb as any, payload.userId);
    if (!orgId) {
      return NextResponse.redirect(`${redirectBase}?error=missing_org`);
    }

    // ✅ hard guarantee org exists in organizations
    const { data: orgRow, error: orgErr } = await sb
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr || !orgRow?.id) {
      return NextResponse.redirect(`${redirectBase}?error=org_not_in_organizations`);
    }

  const row = {
    org_id: orgId,
    livemode: false,
    stripe_account_id: connectedAccountId,
  };

  const { error: upsertErr } = await sb
    .from("organization_stripe_accounts")
    .upsert(row, { onConflict: "org_id,livemode" });

  if (upsertErr) {
    const msg = `db_upsert_failed:${upsertErr.code ?? ""}:${upsertErr.message ?? ""}`;
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(msg)}`);
  }

  return NextResponse.redirect(`${redirectBase}?connected=stripe`);
}
