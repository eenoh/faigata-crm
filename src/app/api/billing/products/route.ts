// src/app/api/billing/products/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------
// Types
// -----------------------------
type Role = "admin" | "manager" | "closer" | "member";

type BillingCtx = {
  userId: string;
  teamId: string;
  orgId: string | null;
  livemode: boolean;
  role: Role; // highest
  roleSources: {
    team_members?: Role;
    profiles?: Role;
    profilesRaw?: unknown;
    teamMembersRaw?: unknown;
  };
  stripeAccountId: string | null;
};

type CurrentPrice = {
  currency: string | null;
  unit_amount: number | null;
  recurring?: { interval: "day" | "week" | "month" | "year"; interval_count?: number } | null;
};

// -----------------------------
// Supabase Admin (service role)
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
function normalize(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isStripeAccountId(v: unknown) {
  const s = String(v ?? "").trim();
  return /^acct_[a-zA-Z0-9]+$/.test(s);
}

function parseLivemode(req: Request): boolean {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const mode = String(sp.get("mode") ?? "").trim().toLowerCase();
  if (mode === "live") return true;
  if (mode === "test") return false;

  const lm = String(sp.get("livemode") ?? "").trim().toLowerCase();
  if (lm === "1" || lm === "true") return true;
  if (lm === "0" || lm === "false") return false;

  // default TEST
  return false;
}

/**
 * roles can be:
 * - "Admin" / "admin"
 * - ["member","admin"]  (profiles.role array)
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

async function resolveOrgIdFromTeamId(admin: ReturnType<typeof supabaseAdmin>, teamId: string) {
  const { data, error } = await admin.from("teams").select("organization_id").eq("id", teamId).maybeSingle();
  if (error) return null;

  const orgId = String((data as any)?.organization_id ?? "").trim();
  return orgId || null;
}

async function resolveStripeAccountIdForOrg(
  admin: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  livemode: boolean
) {
  const { data, error } = await admin
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .maybeSingle();

  if (error) return null;

  const stripeAccountId = String((data as any)?.stripe_account_id ?? "").trim();
  return stripeAccountId || null;
}

async function resolveBillingCtx(req: Request): Promise<BillingCtx | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const admin = supabaseAdmin();
  const livemode = parseLivemode(req);

  // 1) resolve user
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const user = userRes?.user ?? null;
  if (userErr || !user) return null;

  const userId = String(user.id);

  // 2) resolve teamId hint from query/header
  const url = new URL(req.url);
  const teamIdParam = String(url.searchParams.get("teamId") ?? "").trim() || null;
  const teamIdHeader = String(req.headers.get("x-team-id") ?? "").trim() || null;
  const teamIdCandidate = teamIdParam || teamIdHeader;

  let teamId: string | null = null;
  let teamMembersRoleRaw: unknown = null;
  let profilesRoleRaw: unknown = null;

  // 3) prefer team_members for team + role
  if (teamIdCandidate) {
    const { data, error } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .eq("team_id", teamIdCandidate)
      .maybeSingle();

    if (!error && data?.team_id) {
      teamId = String((data as any).team_id);
      teamMembersRoleRaw = (data as any).role;
    }
  }

  // 4) otherwise pick earliest membership
  if (!teamId) {
    const { data, error } = await admin
      .from("team_members")
      .select("team_id, role, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    if (!error && data?.team_id) {
      teamId = String((data as any).team_id);
      teamMembersRoleRaw = (data as any).role;
    }
  }

  // 5) profiles fallback (team_id + role array)
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profErr && profile) {
    profilesRoleRaw = (profile as any).role;
    if (!teamId && (profile as any).team_id) teamId = String((profile as any).team_id);
  }

  if (!teamId) return null;

  // 6) merged role (case-insensitive + array support)
  const mergedRole = mergeHighestRole(teamMembersRoleRaw, profilesRoleRaw).highest;

  // 7) teamId -> orgId (teams.organization_id)
  const orgId = await resolveOrgIdFromTeamId(admin, teamId);

  // 8) orgId -> stripeAccountId
  const stripeAccountId = orgId ? await resolveStripeAccountIdForOrg(admin, orgId, livemode) : null;

  return {
    userId,
    teamId,
    orgId,
    livemode,
    role: mergedRole,
    roleSources: {
      team_members: pickHighestRole(roleSetFromUnknown(teamMembersRoleRaw)),
      profiles: pickHighestRole(roleSetFromUnknown(profilesRoleRaw)),
      profilesRaw: profilesRoleRaw,
      teamMembersRaw: teamMembersRoleRaw,
    },
    stripeAccountId,
  };
}

// -----------------------------
// Stripe helpers
// -----------------------------
async function listAll<T extends { id: string }>(
  listFn: (params: { limit: number; starting_after?: string }, opts: any) => Promise<{ data: T[]; has_more: boolean }>,
  opts: any
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;

  while (true) {
    const page = await listFn({ limit: 100, ...(starting_after ? { starting_after } : {}) }, opts);

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;

    starting_after = page.data[page.data.length - 1]!.id;
  }

  return out;
}

function toCurrentPriceShape(pr: Stripe.Price | null | undefined): CurrentPrice | null {
  if (!pr) return null;

  const recurring =
    pr.type === "recurring" && pr.recurring?.interval
      ? { interval: pr.recurring.interval, interval_count: pr.recurring.interval_count ?? 1 }
      : null;

  return {
    currency: pr.currency ?? null,
    unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
    recurring,
  };
}

function extractDefaultPriceId(p: Stripe.Product): string | null {
  const dp: any = (p as any).default_price ?? null;
  if (!dp) return null;
  if (typeof dp === "string") return dp;
  if (typeof dp === "object" && typeof dp.id === "string") return dp.id;
  return null;
}

function pickCurrentPriceForProduct(
  product: Stripe.Product,
  pricesByProduct: Map<string, Stripe.Price[]>,
  priceById: Map<string, Stripe.Price>
): Stripe.Price | null {
  const defaultPriceId = extractDefaultPriceId(product);
  if (defaultPriceId) {
    const found = priceById.get(defaultPriceId) ?? null;
    if (found) return found;
  }

  const list = pricesByProduct.get(product.id) ?? [];
  if (!list.length) return null;

  const sorted = [...list].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const newestActive = sorted.find((x) => x.active) ?? null;
  if (newestActive) return newestActive;

  return sorted[0] ?? null;
}

// -----------------------------
// Route
// -----------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

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

    // ✅ allowed roles
    const allowed: Role[] = ["admin", "manager", "closer"];
    if (!allowed.includes(ctx.role)) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "You do not have permission to view billing products.",
          details: {
            teamId: ctx.teamId,
            orgId: ctx.orgId,
            role: ctx.role,
            roleSources: ctx.roleSources,
          },
        },
        { status: 403 }
      );
    }

    // ✅ Must have orgId
    if (!ctx.orgId) {
      return NextResponse.json(
        {
          error: "missing_org_id",
          message: "teams.organization_id is not set for this team.",
          hint: "Set teams.organization_id for the current team, then connect Stripe at org level.",
          details: { teamId: ctx.teamId },
        },
        { status: 400 }
      );
    }

    // ✅ Must have stripe account mapping (org-level)
    const stripeAccountId = String(ctx.stripeAccountId ?? "").trim();
    if (!stripeAccountId) {
      return NextResponse.json(
        {
          error: "missing_stripe_account_id",
          message: `No connected Stripe account found for this org in ${ctx.livemode ? "LIVE" : "TEST"} mode.`,
          hint:
            "Insert a row in organization_stripe_accounts with " +
            "org_id=<teams.organization_id>, livemode=<true|false>, stripe_account_id='acct_...'.",
          details: { teamId: ctx.teamId, orgId: ctx.orgId, livemode: ctx.livemode },
        },
        { status: 400 }
      );
    }

    if (!isStripeAccountId(stripeAccountId)) {
      return NextResponse.json(
        { error: "invalid_stripe_account_id", message: `Invalid stripeAccountId: ${stripeAccountId}` },
        { status: 400 }
      );
    }

    const stripe = stripeClient(ctx.livemode);

    // 1) all products
    const productsAll = await listAll<Stripe.Product>((params, opts) => stripe.products.list(params, opts) as any, {
      stripeAccount: stripeAccountId,
    });

    // 2) all prices
    const pricesAll = await listAll<Stripe.Price>((params, opts) => stripe.prices.list(params, opts) as any, {
      stripeAccount: stripeAccountId,
    });

    const pricesByProduct = new Map<string, Stripe.Price[]>();
    const priceById = new Map<string, Stripe.Price>();

    for (const pr of pricesAll) {
      priceById.set(pr.id, pr);
      const pid = typeof pr.product === "string" ? pr.product : ((pr.product as any)?.id ?? null);
      if (!pid) continue;

      const list = pricesByProduct.get(pid) ?? [];
      list.push(pr);
      pricesByProduct.set(pid, list);
    }

    const rows = productsAll.map((p) => {
      const stripe_created = typeof p.created === "number" ? p.created : null;
      const currentStripePrice = pickCurrentPriceForProduct(p, pricesByProduct, priceById);
      const current_price = toCurrentPriceShape(currentStripePrice);

      return {
        stripe_product_id: p.id,
        stripe_name: p.name ?? null,
        stripe_description: p.description ?? null,
        stripe_active: !!p.active,
        stripe_created,

        local_name: null,
        local_description: null,
        is_archived: false,

        updated_at: stripe_created ? new Date(stripe_created * 1000).toISOString() : new Date().toISOString(),
        display_name: p.name ?? p.id,

        current_price,
        price_count: pricesByProduct.get(p.id)?.length ?? 0,
      };
    });

    const filtered =
      q.length > 0
        ? rows.filter((r) => {
            const hay = [
              normalize(r.display_name),
              normalize(r.stripe_name),
              normalize(r.local_name),
              normalize(r.stripe_product_id),
              normalize(r.stripe_description),
              normalize(r.local_description),
            ].join(" ");
            return hay.includes(normalize(q));
          })
        : rows;

    filtered.sort((a, b) => (b.stripe_created ?? 0) - (a.stripe_created ?? 0));

    return NextResponse.json({
      products: filtered,
      q,
      stripeAccountId,
      livemode: ctx.livemode,
      teamId: ctx.teamId,
      orgId: ctx.orgId,
      source: "stripe",
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "stripe_list_failed",
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
