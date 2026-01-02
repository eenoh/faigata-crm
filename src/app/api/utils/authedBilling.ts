// src/app/api/utils/authedBilling.ts
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
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

function normalize(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

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

async function getUserFromBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

async function getUserFromCookies() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * ✅ Use this in routes when you want clean 401 reasons.
 */
export async function getAuthedBillingContextWithReason(
  req: Request
): Promise<AuthedWithReason> {
  try {
    // 1) Prefer bearer token
    let user = await getUserFromBearer(req);

    // 2) Fallback to cookie session
    if (!user) user = await getUserFromCookies();

    if (!user) return { ok: false, reason: "no_user" };

    const sb = adminClient();

    const { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("team_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return { ok: false, reason: "internal_error", details: profileErr };
    }

    if (!profile) return { ok: false, reason: "profile_missing" };

    const orgId = (profile.team_id as string | null) ?? null;
    if (!orgId) return { ok: false, reason: "missing_org" };

    // ✅ IMPORTANT: roles may be array
    const roles = normalizeRoles(profile.role);
    const privileged = roles.some((r) => PRIV_ROLES.has(r));
    if (!privileged) {
      return {
        ok: false,
        reason: "missing_privilege",
        details: { roles },
      };
    }

    const livemode = process.env.STRIPE_LIVEMODE === "true";


    const { data: acct, error: acctErr } = await sb
      .from("organization_stripe_accounts")
      .select("stripe_account_id")
      .eq("org_id", orgId)
      .eq("livemode", livemode)
      .maybeSingle();

    if (acctErr) {
      return { ok: false, reason: "internal_error", details: acctErr };
    }

    const stripeAccountId = (acct?.stripe_account_id as string | null) ?? null;
    if (!stripeAccountId) return { ok: false, reason: "missing_stripe_account" };

    return {
      ok: true,
      ctx: { userId: user.id, orgId, livemode, stripeAccountId },
    };
  } catch (e: any) {
    return { ok: false, reason: "internal_error", details: String(e?.message ?? e) };
  }
}

/**
 * Backwards-compatible helper if you want the old style.
 */
export async function getAuthedBillingContext(req: Request): Promise<Authed | null> {
  const res = await getAuthedBillingContextWithReason(req);
  return res.ok ? res.ctx : null;
}
