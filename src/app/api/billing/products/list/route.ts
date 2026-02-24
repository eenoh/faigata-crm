// src/app/api/billing/products/list/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------
// Types
// -----------------------------
type Role = "admin" | "manager" | "closer" | "member";

type BillingCtx = {
  teamId: string;
  organizationId: string; // resolved from teams.organization_id
  role: Role; // highest role resolved
  livemode: boolean;
  stripeAccountId: string; // resolved from organization_stripe_accounts
};

// -----------------------------
// Response helpers
// -----------------------------
function jsonError(error: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

// -----------------------------
// Supabase Admin
// -----------------------------
function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("missing_supabase_url");
  if (!serviceKey) throw new Error("missing_service_role_key");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// -----------------------------
// Helpers
// -----------------------------
function getBearerToken(req: NextRequest) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isStripeAccountId(v: unknown) {
  return /^acct_[a-zA-Z0-9]+$/.test(String(v ?? "").trim());
}

function parseLivemode(req: NextRequest): boolean {
  // Supported:
  // ?mode=live|test
  // ?livemode=1|0|true|false
  const sp = req.nextUrl.searchParams;

  const mode = String(sp.get("mode") ?? "")
    .trim()
    .toLowerCase();
  if (mode === "live") return true;
  if (mode === "test") return false;

  const lm = String(sp.get("livemode") ?? "")
    .trim()
    .toLowerCase();
  if (lm === "1" || lm === "true") return true;
  if (lm === "0" || lm === "false") return false;

  return false; // default TEST
}

function normalizeRoleOne(v: unknown): Role {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "admin") return "admin";
  if (s === "manager") return "manager";
  if (s === "closer") return "closer";
  if (s === "member") return "member";
  return "member";
}

/**
 * roles can be:
 * - "admin"
 * - ["member","admin"]
 * - null/undefined
 */
function rolesFromUnknown(v: unknown): Set<Role> {
  const out = new Set<Role>();

  if (Array.isArray(v)) {
    for (const x of v) out.add(normalizeRoleOne(x));
  } else if (v != null) {
    out.add(normalizeRoleOne(v));
  }

  if (out.size === 0) out.add("member");
  return out;
}

function pickHighestRole(roles: Set<Role>): Role {
  if (roles.has("admin")) return "admin";
  if (roles.has("manager")) return "manager";
  if (roles.has("closer")) return "closer";
  return "member";
}

function mergeHighestRole(...roleLikes: unknown[]): Role {
  const merged = new Set<Role>();
  for (const rl of roleLikes) {
    for (const r of rolesFromUnknown(rl)) merged.add(r);
  }
  return pickHighestRole(merged);
}

async function resolveBillingCtx(req: NextRequest): Promise<BillingCtx | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const admin = supabaseAdmin();

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const user = userRes?.user ?? null;
  if (userErr || !user) return null;

  const userId = String(user.id);
  const sp = req.nextUrl.searchParams;

  const teamIdParam = String(sp.get("teamId") ?? "").trim() || null;
  const teamIdHeader =
    String(req.headers.get("x-team-id") ?? "").trim() || null;
  const teamIdCandidate = teamIdParam || teamIdHeader;

  const livemode = parseLivemode(req);

  let teamId: string | null = null;
  let teamMembersRoleRaw: unknown = null;
  let profilesRoleRaw: unknown = null;

  // 1) team_members membership (preferred for team selection)
  if (teamIdCandidate) {
    const { data, error } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .eq("team_id", teamIdCandidate)
      .maybeSingle();

    if (!error && data?.team_id) {
      teamId = String(data.team_id);
      teamMembersRoleRaw = (data as any).role;
    }
  }

  // fallback: earliest membership
  if (!teamId) {
    const { data, error } = await admin
      .from("team_members")
      .select("team_id, role, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    if (!error && data?.team_id) {
      teamId = String(data.team_id);
      teamMembersRoleRaw = (data as any).role;
    }
  }

  // 2) profiles fallback (for team_id OR role enrichment)
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profErr && profile) {
    profilesRoleRaw = (profile as any).role;
    if (!teamId && profile.team_id) teamId = String(profile.team_id);
  }

  if (!teamId) return null;

  // merge roles + pick highest
  const role = mergeHighestRole(teamMembersRoleRaw, profilesRoleRaw);

  // teamId -> organization_id (organization_stripe_accounts.org_id = organization_id)
  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .select("organization_id")
    .eq("id", teamId)
    .maybeSingle();

  const organizationId =
    !teamErr && teamRow?.organization_id
      ? String(teamRow.organization_id)
      : null;

  if (!organizationId) return null;

  // orgId -> stripe account
  const { data: acctRow, error: acctErr } = await admin
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", organizationId)
    .eq("livemode", livemode)
    .maybeSingle();

  const stripeAccountId =
    !acctErr && acctRow?.stripe_account_id
      ? String(acctRow.stripe_account_id)
      : null;

  if (!stripeAccountId) return null;
  if (!isStripeAccountId(stripeAccountId)) return null;

  return { teamId, organizationId, role, livemode, stripeAccountId };
}

// -----------------------------
// Route
// -----------------------------
export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveBillingCtx(req);
    if (!ctx) {
      return jsonError("unauthorized", 401, {
        message:
          "Missing/invalid session or could not resolve org/Stripe account mapping.",
        hint: "Ensure Authorization: Bearer <token> is sent; teams.organization_id is set; and organization_stripe_accounts has a row for (org_id=teams.organization_id, livemode).",
      });
    }

    // Allowed roles
    const allowed: Role[] = ["admin", "manager", "closer"];
    if (!allowed.includes(ctx.role)) {
      return jsonError("forbidden", 403, {
        message: "You do not have permission to view billing products.",
        details: {
          teamId: ctx.teamId,
          organizationId: ctx.organizationId,
          role: ctx.role,
          livemode: ctx.livemode,
        },
      });
    }

    const stripe = stripeClient(ctx.livemode);
    const res = await stripe.products.list(
      { limit: 100 },
      { stripeAccount: ctx.stripeAccountId },
    );

    const products = (res.data ?? []).map((p) => ({
      id: p.id,
      name: p.name ?? null,
      active: !!p.active,
      created: typeof p.created === "number" ? p.created : null,
    }));

    return NextResponse.json({
      ok: true,
      products,
      livemode: ctx.livemode,
      stripeAccountId: ctx.stripeAccountId,
      teamId: ctx.teamId,
      organizationId: ctx.organizationId,
    });
  } catch (e: any) {
    return jsonError("billing_products_list_failed", 500, {
      message: String(e?.message ?? e),
      stripe: {
        type: e?.type ?? null,
        code: e?.code ?? null,
        statusCode: e?.statusCode ?? null,
        requestId: e?.requestId ?? null,
      },
    });
  }
}
