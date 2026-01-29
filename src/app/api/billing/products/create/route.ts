// src/app/api/billing/products/[productId]/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ productId: string }> };

type Role = "admin" | "manager" | "closer" | "member";

type BillingCtx = {
  userId: string;
  teamId: string;
  orgId: string;
  role: Role; // highest
  livemode: boolean;
  stripeAccountId: string;
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
function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
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

  // Default: TEST
  return false;
}

function normalizeRoleOne(v: unknown): Role {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "admin") return "admin";
  if (s === "manager") return "manager";
  if (s === "closer") return "closer";
  if (s === "member") return "member";
  return "member";
}

function roleSetFromUnknown(v: unknown): Set<Role> {
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
    const set = roleSetFromUnknown(rl);
    for (const r of set) merged.add(r);
  }
  return pickHighestRole(merged);
}

function isStripeAccountId(v: unknown) {
  const s = String(v ?? "").trim();
  return /^acct_[a-zA-Z0-9]+$/.test(s);
}

// Stripe paginator
async function listAll<T extends { id: string }>(
  listFn: (
    params: { limit: number; starting_after?: string },
    opts: any
  ) => Promise<{ data: T[]; has_more: boolean }>,
  opts: any
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;

  while (true) {
    const page = await listFn(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      opts
    );

    out.push(...(page.data ?? []));
    if (!page.has_more || !page.data?.length) break;

    starting_after = page.data[page.data.length - 1]!.id;
  }

  return out;
}

// -----------------------------
// Billing context resolver
// -----------------------------
async function resolveBillingCtx(req: Request): Promise<BillingCtx | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const admin = supabaseAdmin();

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  const user = userRes?.user ?? null;
  if (userErr || !user) return null;

  const userId = String(user.id);
  const livemode = parseLivemode(req);

  const url = new URL(req.url);
  const teamIdFromQuery = String(url.searchParams.get("teamId") ?? "").trim() || null;
  const teamIdFromHeader = String(req.headers.get("x-team-id") ?? "").trim() || null;
  const teamIdHint = teamIdFromQuery || teamIdFromHeader;

  // profiles
  const { data: profile } = await admin
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const profilesTeamId = String((profile as any)?.team_id ?? "").trim() || null;
  const profilesRoleRaw: unknown = (profile as any)?.role;

  // team_members (prefer hinted team)
  let teamId: string | null = null;
  let teamMembersRoleRaw: unknown = null;

  if (teamIdHint) {
    const { data } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .eq("team_id", teamIdHint)
      .maybeSingle();

    if (data?.team_id) {
      teamId = String(data.team_id);
      teamMembersRoleRaw = (data as any).role;
    }
  }

  // fallback earliest membership
  if (!teamId) {
    const { data } = await admin
      .from("team_members")
      .select("team_id, role, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    if (data?.team_id) {
      teamId = String(data.team_id);
      teamMembersRoleRaw = (data as any).role;
    }
  }

  if (!teamId) teamId = profilesTeamId;
  if (!teamId) return null;

  // roles (case-insensitive) -> highest
  const role = mergeHighestRole(teamMembersRoleRaw, profilesRoleRaw);

  // teamId -> orgId
  const { data: teamRow } = await admin
    .from("teams")
    .select("organization_id")
    .eq("id", teamId)
    .maybeSingle();

  const orgId = String((teamRow as any)?.organization_id ?? "").trim();
  if (!orgId) return null;

  // orgId -> stripe account
  const { data: acctRow } = await admin
    .from("organization_stripe_accounts")
    .select("stripe_account_id")
    .eq("org_id", orgId)
    .eq("livemode", livemode)
    .maybeSingle();

  const stripeAccountId = String((acctRow as any)?.stripe_account_id ?? "").trim();
  if (!stripeAccountId) return null;
  if (!isStripeAccountId(stripeAccountId)) return null;

  return { userId, teamId, orgId, role, livemode, stripeAccountId };
}

// -----------------------------
// Route
// -----------------------------
export async function GET(req: NextRequest, ctx: Ctx) {
  const billingCtx = await resolveBillingCtx(req);
  if (!billingCtx) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: "no_billing_ctx",
        hint:
          "Pass Authorization: Bearer <token>. Ensure profiles/team_members exists, teams.organization_id is set, and organization_stripe_accounts row exists for this org + livemode.",
      },
      { status: 401 }
    );
  }

  // ✅ Case-insensitive role logic already handled in resolver
  const allowed: Role[] = ["admin", "manager", "closer"];
  if (!allowed.includes(billingCtx.role)) {
    return NextResponse.json(
      { error: "forbidden", message: "You do not have permission to view billing products." },
      { status: 403 }
    );
  }

  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();

  if (!pid || pid === "undefined") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  try {
    const stripe = stripeClient(billingCtx.livemode);

    const product = await stripe.products.retrieve(
      pid,
      { stripeAccount: billingCtx.stripeAccountId } as any
    );

    if (!product || (product as any).deleted) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Fetch all prices then filter by this product
    const allPrices = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params, opts) as any,
      { stripeAccount: billingCtx.stripeAccountId }
    );

    const prices = allPrices
      .filter((pr) => {
        const prPid =
          typeof pr.product === "string"
            ? pr.product
            : (pr.product as any)?.id ?? null;
        return prPid === pid;
      })
      .sort(
        (a, b) =>
          (typeof b.created === "number" ? b.created : 0) -
          (typeof a.created === "number" ? a.created : 0)
      );

    // Activity timeline from DB (optional)
    const sb = supabaseAdmin();
    const { data: activity } = await sb
      .from("organization_stripe_catalog_activity")
      .select("id, type, payload, actor_user_id, created_at, stripe_product_id, stripe_price_id")
      .eq("org_id", billingCtx.orgId)
      .eq("livemode", billingCtx.livemode)
      .eq("stripe_product_id", pid)
      .order("created_at", { ascending: false })
      .limit(100);

    return NextResponse.json({
      product,
      prices,
      activity: activity ?? [],
      source: "stripe",
      livemode: billingCtx.livemode,
      stripeAccountId: billingCtx.stripeAccountId,
      teamId: billingCtx.teamId,
      orgId: billingCtx.orgId,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (
      msg.toLowerCase().includes("no such product") ||
      msg.toLowerCase().includes("resource_missing")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "stripe_detail_failed", message: msg },
      { status: 500 }
    );
  }
}
