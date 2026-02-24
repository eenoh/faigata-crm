// src/app/api/integrations/stripe/connect/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureOrgIdForUser } from "../../_org";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const REDIRECT_BASE = `${APP_URL}/profile/integrations`;
const MAX_AGE_MS = 10 * 60 * 1000;

type StatePayload = {
  orgId: string;
  userId: string;
  nonce: string;
  ts: number;
  livemode?: boolean;
};

const redirect = (params: Record<string, string>) =>
  NextResponse.redirect(`${REDIRECT_BASE}?${new URLSearchParams(params)}`);

const supabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const decodeState = (state: string): StatePayload | null => {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const ok = parsed?.orgId && parsed?.userId && parsed?.nonce && parsed?.ts;
    return ok ? (parsed as StatePayload) : null;
  } catch {
    return null;
  }
};

async function exchangeStripeToken(code: string, secret: string) {
  const res = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${secret}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code }),
  });

  const json: any = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      json?.error_description || json?.error || "token_exchange_failed";
    return { ok: false as const, error: msg };
  }

  const acct = json?.stripe_user_id as string | undefined;
  if (!acct?.startsWith("acct_")) {
    return { ok: false as const, error: "missing_connected_account" };
  }

  return { ok: true as const, accountId: acct };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const stripeError = url.searchParams.get("error");

  if (stripeError) return redirect({ error: stripeError });
  if (!code || !state) return redirect({ error: "missing_code_or_state" });

  const payload = decodeState(state);
  if (!payload) return redirect({ error: "invalid_state" });
  if (Date.now() - Number(payload.ts) > MAX_AGE_MS)
    return redirect({ error: "state_expired" });

  const stripeSecret = process.env.STRIPE_SECRET_KEY_TEST;
  if (!stripeSecret) return redirect({ error: "stripe_secret_missing" });

  const token = await exchangeStripeToken(code, stripeSecret);
  if (!token.ok) return redirect({ error: token.error });

  const sb = supabaseAdmin();

  const orgId = await ensureOrgIdForUser(sb as any, payload.userId);
  if (!orgId) return redirect({ error: "missing_org" });

  // hard guarantee org exists in organizations
  const { data: orgRow, error: orgErr } = await sb
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr || !orgRow?.id)
    return redirect({ error: "org_not_in_organizations" });

  const { error: upsertErr } = await sb
    .from("organization_stripe_accounts")
    .upsert(
      { org_id: orgId, livemode: false, stripe_account_id: token.accountId },
      { onConflict: "org_id,livemode" },
    );

  if (upsertErr) {
    const msg = `db_upsert_failed:${upsertErr.code ?? ""}:${upsertErr.message ?? ""}`;
    return redirect({ error: msg });
  }

  return redirect({ connected: "stripe" });
}
