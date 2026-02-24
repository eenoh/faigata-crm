// src/app/api/utils/authedBilling.ts

/**
 * Simplifications made:
 * • Consolidated repeated supabaseAdmin.auth.getUser(token) logic into one helper
 * • Centralized bearer-token parsing (case-insensitive header) into a single function
 * • Simplified cookie parsing + token extraction while keeping the same supported cookie patterns
 * • Reduced nesting in the main function with early returns
 * • Kept the same AuthReason values, role normalization behavior, and outputs
 * • Kept backwards-compatible getAuthedBillingContext() wrapper unchanged
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";

type Authed = {
  userId: string;
  orgId: string;
  livemode: boolean;
  stripeAccountId: string;
};

type AuthReason =
  | "no_user"
  | "profile_missing"
  | "missing_org"
  | "missing_privilege"
  | "missing_stripe_account"
  | "internal_error";

type AuthOk = { ok: true; ctx: Authed };
type AuthFail = { ok: false; reason: AuthReason; details?: any };
export type AuthedWithReason = AuthOk | AuthFail;

const PRIV_ROLES = new Set(["closer", "manager", "admin"]);

const normalize = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();

/**
 * ✅ profiles.role can be:
 * - text[] (array)
 * - text   (single string legacy)
 * - null
 */
function normalizeRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((r) => normalize(String(r))).filter(Boolean);
  }
  if (typeof raw === "string") {
    const v = normalize(raw);
    return v ? [v] : [];
  }
  return [];
}

function parseCookieHeader(
  cookieHeader: string | null,
): Record<string, string> {
  if (!cookieHeader) return {};

  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Best-effort extraction of a Supabase access token from cookies,
 * WITHOUT using @supabase/auth-helpers-nextjs.
 *
 * Supports common patterns:
 * - sb-access-token / supabase-access-token / access-token
 * - supabase-auth-token (JSON array string used by older helpers)
 * - sb-<projectRef>-auth-token (JSON array string)
 */
function getAccessTokenFromCookies(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));

  const direct =
    cookies["sb-access-token"] ||
    cookies["supabase-access-token"] ||
    cookies["access-token"];

  if (direct) return decodeURIComponent(direct);

  const authTokenKey =
    (Object.keys(cookies).find((k) => k === "supabase-auth-token") ??
      Object.keys(cookies).find((k) => k.endsWith("-auth-token"))) ||
    null;

  if (!authTokenKey) return null;

  const raw = cookies[authTokenKey];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(parsed) && typeof parsed[0] === "string"
      ? parsed[0]
      : null;
  } catch {
    return null;
  }
}

function getBearerToken(req: Request): string | null {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function getUserFromToken(token: string | null) {
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data?.user ?? null;
}

/**
 * ✅ Use this in routes when you want clean 401 reasons.
 */
export async function getAuthedBillingContextWithReason(
  req: Request,
): Promise<AuthedWithReason> {
  try {
    // 1) Prefer bearer token
    let user = await getUserFromToken(getBearerToken(req));

    // 2) Fallback to cookie session
    if (!user) user = await getUserFromToken(getAccessTokenFromCookies(req));

    if (!user) return { ok: false, reason: "no_user" };

    const sb = adminClient();

    const { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("team_id, company_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr)
      return { ok: false, reason: "internal_error", details: profileErr };
    if (!profile) return { ok: false, reason: "profile_missing" };

    // org should be company_id; fallback to team_id so nothing breaks
    const orgId =
      (profile.company_id as string | null) ??
      (profile.team_id as string | null) ??
      null;

    if (!orgId) return { ok: false, reason: "missing_org" };

    const roles = normalizeRoles(profile.role);
    const privileged = roles.some((r) => PRIV_ROLES.has(r));

    if (!privileged) {
      return { ok: false, reason: "missing_privilege", details: { roles } };
    }

    const livemode = process.env.STRIPE_LIVEMODE === "true";

    const { data: acct, error: acctErr } = await sb
      .from("organization_stripe_accounts")
      .select("stripe_account_id")
      .eq("org_id", orgId)
      .eq("livemode", livemode)
      .maybeSingle();

    if (acctErr)
      return { ok: false, reason: "internal_error", details: acctErr };

    const stripeAccountId = (acct?.stripe_account_id as string | null) ?? null;
    if (!stripeAccountId)
      return { ok: false, reason: "missing_stripe_account" };

    return {
      ok: true,
      ctx: { userId: user.id, orgId, livemode, stripeAccountId },
    };
  } catch (e: any) {
    return {
      ok: false,
      reason: "internal_error",
      details: String(e?.message ?? e),
    };
  }
}

/**
 * Backwards-compatible helper if you want the old style.
 */
export async function getAuthedBillingContext(
  req: Request,
): Promise<Authed | null> {
  const res = await getAuthedBillingContextWithReason(req);
  return res.ok ? res.ctx : null;
}
