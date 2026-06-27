import "server-only";

import { redirectWithParams, jsonError, jsonOk } from "@/lib/http/responses";
import { getRequestUser } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env/server";
import { ensureOrgIdForUser } from "@/features/organizations/server/organization.service";
import {
  decodeStripeConnectState,
  encodeStripeConnectState,
  type StripeConnectState,
} from "@/features/integrations/stripe/server/connect-state";

const CONNECT_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function getConnectMode() {
  return serverEnv.stripe.livemode() ? "live" : "test";
}

function getIntegrationsRedirectBase() {
  return `${serverEnv.appUrl()}/profile/integrations`;
}

async function exchangeStripeToken(code: string, secretKey: string) {
  const response = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${secretKey}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; error_description?: string; stripe_user_id?: string }
    | null;

  if (!response.ok) {
    return {
      ok: false as const,
      error:
        payload?.error_description || payload?.error || "token_exchange_failed",
    };
  }

  const accountId = payload?.stripe_user_id;
  if (!accountId?.startsWith("acct_")) {
    return { ok: false as const, error: "missing_connected_account" };
  }

  return { ok: true as const, accountId };
}

export async function handleStripeConnectRequest(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth.ok) {
    return jsonError(auth.reason, 401);
  }

  const orgId = await ensureOrgIdForUser(auth.user.id);
  if (!orgId) {
    return jsonError("missing_org", 400);
  }

  const mode = getConnectMode();
  const statePayload: StripeConnectState = {
    orgId,
    userId: auth.user.id,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
    livemode: mode === "live",
  };

  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", serverEnv.stripe.connectClientId(mode));
  url.searchParams.set("scope", "read_write");
  url.searchParams.set(
    "redirect_uri",
    serverEnv.stripe.connectRedirectUri(mode),
  );
  url.searchParams.set("state", encodeStripeConnectState(statePayload));

  return jsonOk({ authUrl: url.toString() });
}

export async function handleStripeConnectCallback(request: Request) {
  const url = new URL(request.url);
  const stripeError = url.searchParams.get("error");
  if (stripeError) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: stripeError,
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: "missing_code_or_state",
    });
  }

  const payload = decodeStripeConnectState(state);
  if (!payload) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: "invalid_state",
    });
  }

  if (Date.now() - payload.ts > CONNECT_STATE_MAX_AGE_MS) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: "state_expired",
    });
  }

  const mode = payload.livemode ? "live" : "test";
  const token = await exchangeStripeToken(
    code,
    serverEnv.stripe.secretKey(mode),
  );

  if (!token.ok) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: token.error,
    });
  }

  const supabase = getSupabaseAdminClient();
  const orgId = await ensureOrgIdForUser(payload.userId, supabase);
  if (!orgId) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: "missing_org",
    });
  }

  const { data: orgRow, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !(orgRow as { id?: string } | null)?.id) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: "org_not_in_organizations",
    });
  }

  const { error: upsertError } = await supabase
    .from("organization_stripe_accounts")
    .upsert(
      {
        org_id: orgId,
        livemode: payload.livemode,
        stripe_account_id: token.accountId,
      },
      { onConflict: "org_id,livemode" },
    );

  if (upsertError) {
    return redirectWithParams(getIntegrationsRedirectBase(), {
      error: `db_upsert_failed:${upsertError.code ?? ""}:${upsertError.message ?? ""}`,
    });
  }

  return redirectWithParams(getIntegrationsRedirectBase(), {
    connected: "stripe",
  });
}

