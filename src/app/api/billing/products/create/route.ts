// src/app/api/billing/products/create/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ For NON-dynamic routes, Next expects params: Promise<{}>
type RouteContext = { params: Promise<{}> };

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
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function parseLivemode(req: Request): boolean {
  const url = new URL(req.url);
  const sp = url.searchParams;

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

  // Default: TEST
  return false;
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

function isStripeInterval(
  v: string,
): v is Stripe.PriceCreateParams.Recurring.Interval {
  return v === "day" || v === "week" || v === "month" || v === "year";
}

// Stripe paginator (used to return product prices right away)
async function listAll<T extends { id: string }>(
  listFn: (
    params: { limit: number; starting_after?: string },
    opts: any,
  ) => Promise<{ data: T[]; has_more: boolean }>,
  opts: any,
): Promise<T[]> {
  const out: T[] = [];
  let starting_after: string | undefined;

  while (true) {
    const page = await listFn(
      { limit: 100, ...(starting_after ? { starting_after } : {}) },
      opts,
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
  const teamIdFromQuery =
    String(url.searchParams.get("teamId") ?? "").trim() || null;
  const teamIdFromHeader =
    String(req.headers.get("x-team-id") ?? "").trim() || null;
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

  const stripeAccountId = String(
    (acctRow as any)?.stripe_account_id ?? "",
  ).trim();
  if (!stripeAccountId || !isStripeAccountId(stripeAccountId)) return null;

  return { userId, teamId, orgId, role, livemode, stripeAccountId };
}

// -----------------------------
// Route
// -----------------------------
export async function GET(_req: NextRequest, _ctx: RouteContext) {
  return NextResponse.json(
    {
      error: "method_not_supported",
      message: "Use POST /api/billing/products/create to create a product.",
    },
    { status: 405 },
  );
}

export async function POST(req: NextRequest, _ctx: RouteContext) {
  const billingCtx = await resolveBillingCtx(req);
  if (!billingCtx) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: "no_billing_ctx",
        hint: "Pass Authorization: Bearer <token>. Ensure profiles/team_members exists, teams.organization_id is set, and organization_stripe_accounts row exists for this org + livemode.",
      },
      { status: 401 },
    );
  }

  const allowed: Role[] = ["admin", "manager", "closer"];
  if (!allowed.includes(billingCtx.role)) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "You do not have permission to create billing products.",
      },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as any;
  const name = String(body?.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "missing_name" }, { status: 400 });

  const description =
    body?.description != null ? String(body.description) : undefined;
  const active = typeof body?.active === "boolean" ? body.active : true;

  const pricePayload = body?.price ?? null;
  const wantsPrice = !!pricePayload && typeof pricePayload === "object";

  try {
    const stripe = stripeClient(billingCtx.livemode);

    // 1) Create product
    const product = await stripe.products.create(
      { name, ...(description !== undefined ? { description } : {}), active },
      { stripeAccount: billingCtx.stripeAccountId } as any,
    );

    // 2) Optional initial price
    let createdPrice: Stripe.Price | null = null;

    if (wantsPrice) {
      const unit_amount = Number(pricePayload?.unit_amount);
      const currency =
        String(pricePayload?.currency ?? "usd")
          .trim()
          .toLowerCase() || "usd";

      if (!Number.isFinite(unit_amount) || unit_amount <= 0) {
        return NextResponse.json(
          { error: "invalid_price_unit_amount" },
          { status: 400 },
        );
      }

      const recurringRaw = pricePayload?.recurring ?? null;
      let recurring: Stripe.PriceCreateParams.Recurring | undefined;

      if (recurringRaw && typeof recurringRaw === "object") {
        const intervalRaw = String(recurringRaw.interval ?? "")
          .trim()
          .toLowerCase();
        const countRaw = Number(recurringRaw.interval_count ?? 1);

        if (intervalRaw) {
          if (!isStripeInterval(intervalRaw)) {
            return NextResponse.json(
              {
                error: "invalid_interval",
                allowed: ["day", "week", "month", "year"],
              },
              { status: 400 },
            );
          }

          recurring = {
            interval: intervalRaw,
            interval_count:
              Number.isFinite(countRaw) && countRaw >= 1
                ? Math.floor(countRaw)
                : 1,
          };
        }
      }

      createdPrice = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: Math.round(unit_amount),
          currency,
          ...(recurring ? { recurring } : {}),
        },
        { stripeAccount: billingCtx.stripeAccountId } as any,
      );
    }

    // 3) Return prices for this product (handy for UI)
    const allPrices = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params, opts) as any,
      { stripeAccount: billingCtx.stripeAccountId },
    );

    const prices = allPrices
      .filter(
        (pr) =>
          (typeof pr.product === "string"
            ? pr.product
            : (pr.product as any)?.id) === product.id,
      )
      .sort(
        (a, b) =>
          (typeof b.created === "number" ? b.created : 0) -
          (typeof a.created === "number" ? a.created : 0),
      );

    // 4) Best-effort activity log
    try {
      const sb = supabaseAdmin();
      const { error: activityErr } = await sb
        .from("organization_stripe_catalog_activity")
        .insert({
          org_id: billingCtx.orgId,
          livemode: billingCtx.livemode,
          type: "product_created",
          stripe_product_id: product.id,
          stripe_price_id: createdPrice?.id ?? null,
          actor_user_id: billingCtx.userId,
          payload: {
            name,
            description: description ?? null,
            active,
            createdPrice: createdPrice?.id ?? null,
          },
          created_at: new Date().toISOString(),
        } as any);

      // swallow logging errors intentionally
      void activityErr;
    } catch {
      // swallow logging errors intentionally
    }

    return NextResponse.json({
      product,
      prices,
      source: "stripe",
      livemode: billingCtx.livemode,
      stripeAccountId: billingCtx.stripeAccountId,
      teamId: billingCtx.teamId,
      orgId: billingCtx.orgId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_create_failed", message: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
