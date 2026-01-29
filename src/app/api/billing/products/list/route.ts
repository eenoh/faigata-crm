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
  organizationId: string | null; // ✅ NEW
  role: Role; // highest role resolved
  roleSources: {
    team_members?: Role;
    profiles?: Role;
    profilesRaw?: unknown;
    teamMembersRaw?: unknown;
  };
  livemode: boolean;
  stripeAccountId: string | null;
};

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
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isStripeAccountId(v: unknown) {
  const s = String(v ?? "").trim();
  return /^acct_[a-zA-Z0-9]+$/.test(s);
}

function parseLivemode(req: NextRequest): boolean {
  // Supported:
  // ?mode=live|test
  // ?livemode=1|0|true|false
  const sp = req.nextUrl.searchParams;

  const mode = String(sp.get("mode") ?? "").trim().toLowerCase();
  if (mode === "live") return true;
  if (mode === "test") return false;

  const lm = String(sp.get("livemode") ?? "").trim().toLowerCase();
  if (lm === "1" || lm === "true") return true;
  if (lm === "0" || lm === "false") return false;

  // Default: TEST
  return false;
}

/**
 * roles can be:
 * - "admin"
 * - ["member","admin"]
 * - null/undefined
 */
function roleSetFromUnknown(v: unknown): Set<Role> {
  const out = new Set<Role>();

  const pushOne = (x: unknown) => {
    const s = String(x ?? "").trim().toLowerCase();
    if (s === "admin") out.add("admin");
    else if (s === "manager") out.add("manager");
    else if (s === "closer") out.add("closer");
    else if (s) out.add("member");
  };

  if (Array.isArray(v)) {
    for (const x of v) pushOne(x);
  } else {
    pushOne(v);
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

function mergeHighestRole(...roleLikes: unknown[]): { highest: Role; merged: Set<Role> } {
  const merged = new Set<Role>();
  for (const rl of roleLikes) {
    const set = roleSetFromUnknown(rl);
    for (const r of set) merged.add(r);
  }
  return { highest: pickHighestRole(merged), merged };
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
  const teamIdHeader = String(req.headers.get("x-team-id") ?? "").trim() || null;
  const teamIdCandidate = teamIdParam || teamIdHeader;

  const livemode = parseLivemode(req);

  let teamId: string | null = null;

  // We'll compute role from BOTH sources then take the highest
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

  // If not found, pick earliest membership
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

  // 2) profiles fallback (for team_id OR for role enrichment)
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

  // ✅ profiles.role can be an array → merge roles + pick highest
  const mergedRole = mergeHighestRole(teamMembersRoleRaw, profilesRoleRaw).highest;

  // ✅ NEW: translate teamId -> organization_id (because organization_stripe_accounts.org_id = organization_id)
  const { data: teamRow, error: teamErr } = await admin
    .from("teams")
    .select("organization_id")
    .eq("id", teamId)
    .maybeSingle();

  const organizationId =
    !teamErr && teamRow?.organization_id ? String(teamRow.organization_id) : null;

  // Resolve stripe account id using organizationId (not teamId)
  let stripeAccountId: string | null = null;
  if (organizationId) {
    const { data: acctRow, error: acctErr } = await admin
      .from("organization_stripe_accounts")
      .select("stripe_account_id")
      .eq("org_id", organizationId)
      .eq("livemode", livemode)
      .maybeSingle();

    stripeAccountId =
      !acctErr && acctRow?.stripe_account_id ? String(acctRow.stripe_account_id) : null;
  }

  return {
    teamId,
    organizationId,
    role: mergedRole,
    roleSources: {
      team_members: pickHighestRole(roleSetFromUnknown(teamMembersRoleRaw)),
      profiles: pickHighestRole(roleSetFromUnknown(profilesRoleRaw)),
      profilesRaw: profilesRoleRaw,
      teamMembersRaw: teamMembersRoleRaw,
    },
    livemode,
    stripeAccountId,
  };
}

// -----------------------------
// Route
// -----------------------------
export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "missing_token", message: "Missing Authorization: Bearer <token>." },
        { status: 401 }
      );
    }

    const ctx = await resolveBillingCtx(req);
    if (!ctx) {
      return NextResponse.json(
        { error: "unauthorized", message: "Invalid session or user not found." },
        { status: 401 }
      );
    }

    // ✅ Allowed roles
    const allowed: Role[] = ["admin", "manager", "closer"];
    if (!allowed.includes(ctx.role)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "You do not have permission to view billing products.",
          details: {
            teamId: ctx.teamId,
            organizationId: ctx.organizationId,
            role: ctx.role,
            roleSources: ctx.roleSources,
            livemode: ctx.livemode,
          },
        },
        { status: 403 }
      );
    }

    if (!ctx.organizationId) {
      return NextResponse.json(
        {
          error: "missing_organization_id",
          message: "teams.organization_id is null for this team; cannot resolve Stripe account mapping.",
          details: { teamId: ctx.teamId },
        },
        { status: 400 }
      );
    }

    const stripeAccountId = String(ctx.stripeAccountId ?? "").trim();
    if (!stripeAccountId) {
      return NextResponse.json(
        {
          error: "missing_stripe_account_id",
          message: `No connected Stripe account found for this organization in ${ctx.livemode ? "LIVE" : "TEST"} mode.`,
          hint:
            "Insert a row in organization_stripe_accounts with org_id=<teams.organization_id>, livemode=<true|false>, stripe_account_id='acct_...'.",
          details: { teamId: ctx.teamId, organizationId: ctx.organizationId, livemode: ctx.livemode },
        },
        { status: 400 }
      );
    }

    if (!isStripeAccountId(stripeAccountId)) {
      return NextResponse.json(
        { error: "invalid_stripe_account_id", message: `Invalid stripe_account_id: ${stripeAccountId}` },
        { status: 400 }
      );
    }

    const stripe = stripeClient(ctx.livemode);
    const res = await stripe.products.list({ limit: 100 }, { stripeAccount: stripeAccountId });

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
      stripeAccountId,
      teamId: ctx.teamId,
      organizationId: ctx.organizationId,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "billing_products_list_failed",
        message: String(e?.message ?? e),
        stripe: {
          type: e?.type ?? null,
          code: e?.code ?? null,
          statusCode: e?.statusCode ?? null,
          requestId: e?.requestId ?? null,
        },
      },
      { status: 500 }
    );
  }
}
