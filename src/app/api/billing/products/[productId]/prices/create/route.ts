// src/app/api/billing/products/[productId]/prices/create/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * If true: request fails when DB persistence fails (current behavior).
 * If false: Stripe price creation succeeds even if DB persistence fails (safer UX).
 */
const STRICT_DB = true;

type Role = "admin" | "manager" | "closer" | "member";

type BillingCtx = {
  userId: string;
  teamId: string;
  orgId: string;
  role: Role;
  livemode: boolean;
  stripeAccountId: string;
};

type RecurringInput =
  | {
      interval?: unknown;
      interval_count?: unknown;
    }
  | null
  | undefined;

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
// Helpers (auth + roles)
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

  return false; // default TEST
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

// -----------------------------
// Helpers (price normalization)
// -----------------------------
function normalizeCurrency(v: unknown) {
  const s = String(v ?? "usd").trim().toLowerCase();
  return s || "usd";
}

function normalizeUnitAmount(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function isStripeInterval(v: string): v is Stripe.PriceCreateParams.Recurring.Interval {
  return v === "day" || v === "week" || v === "month" || v === "year";
}

function normalizeRecurring(raw: RecurringInput): Stripe.PriceCreateParams.Recurring | undefined {
  if (!raw) return undefined;

  const intervalRaw = String(raw.interval ?? "").trim().toLowerCase();
  if (!intervalRaw) return undefined;

  if (!isStripeInterval(intervalRaw)) throw new Error("invalid_interval");

  const countRaw = Number(raw.interval_count ?? 1);
  const interval_count = Number.isFinite(countRaw) && countRaw >= 1 ? Math.floor(countRaw) : 1;

  return { interval: intervalRaw, interval_count };
}

function dbErrShape(e: any) {
  return {
    code: e?.code ?? null,
    message: e?.message ?? null,
    details: e?.details ?? null,
    hint: e?.hint ?? null,
  };
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

  // ✅ case-insensitive + highest
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
// DB persistence (super robust)
// -----------------------------
async function persistPriceSnapshot(sb: ReturnType<typeof supabaseAdmin>, row: Record<string, any>) {
  // IMPORTANT:
  // If your table has extra NOT NULL columns (like created_at),
  // add them once here so all strategies work.
  const normalizedRow = {
    ...row,
    // created_at: row.created_at ?? new Date().toISOString(), // uncomment if needed
  };

  const conflictTargets = [
    "org_id,livemode,stripe_price_id",
    "stripe_price_id",
    "stripe_price_id,livemode",
    "org_id,stripe_price_id",
  ] as const;

  // 1) Try upserts with likely conflict targets
  for (const target of conflictTargets) {
    const r = await sb.from("organization_stripe_prices").upsert(normalizedRow, { onConflict: target });
    if (!r.error) return { ok: true as const, method: `upsert(${target})` };

    // Only continue if it's about ON CONFLICT target mismatch
    const code = (r.error as any).code ?? null;
    const msg = String(r.error.message ?? "").toLowerCase();
    const isConflictMismatch =
      code === "42P10" ||
      msg.includes("on conflict") ||
      msg.includes("no unique") ||
      msg.includes("unique or exclusion constraint");

    if (!isConflictMismatch) {
      return { ok: false as const, method: `upsert(${target})`, error: r.error };
    }
  }

  // 2) If we couldn’t find a usable onConflict, do: select -> update/insert
  // This works even without upsert support IF stripe_price_id exists as a column.
  const sel = await sb
    .from("organization_stripe_prices")
    .select("stripe_price_id")
    .eq("stripe_price_id", normalizedRow.stripe_price_id)
    .limit(1);

  if (sel.error) {
    return { ok: false as const, method: "select(stripe_price_id)", error: sel.error };
  }

  const exists = Array.isArray(sel.data) && sel.data.length > 0;

  if (exists) {
    const upd = await sb
      .from("organization_stripe_prices")
      .update(normalizedRow)
      .eq("stripe_price_id", normalizedRow.stripe_price_id);

    if (upd.error) return { ok: false as const, method: "update(stripe_price_id)", error: upd.error };
    return { ok: true as const, method: "update(stripe_price_id)" };
  }

  const ins = await sb.from("organization_stripe_prices").insert(normalizedRow);
  if (ins.error) return { ok: false as const, method: "insert", error: ins.error };
  return { ok: true as const, method: "insert" };
}

// -----------------------------
// Route
// -----------------------------
export async function POST(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const billingCtx = await resolveBillingCtx(req);
  if (!billingCtx) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: "no_billing_ctx",
        hint:
          "Pass Authorization: Bearer <token>. Ensure teams.organization_id is set and organization_stripe_accounts has a row for (org_id + livemode).",
      },
      { status: 401 }
    );
  }

  // ✅ roles are normalized lower-case in resolver -> not case sensitive
  const allowed: Role[] = ["admin", "manager", "closer"];
  if (!allowed.includes(billingCtx.role)) {
    return NextResponse.json({ error: "forbidden", message: "You do not have permission to create prices." }, { status: 403 });
  }

  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();
  if (!pid || pid === "undefined") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any | null;

  const currency = normalizeCurrency(body?.currency);
  const unit_amount = normalizeUnitAmount(body?.unit_amount);

  if (!currency) return NextResponse.json({ error: "missing_currency" }, { status: 400 });
  if (unit_amount == null) return NextResponse.json({ error: "invalid_unit_amount" }, { status: 400 });

  let recurring: Stripe.PriceCreateParams.Recurring | undefined;
  try {
    recurring = normalizeRecurring(body?.recurring as RecurringInput);
  } catch (e: any) {
    if (String(e?.message) === "invalid_interval") {
      return NextResponse.json({ error: "invalid_interval", allowed: ["day", "week", "month", "year"] }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid_recurring" }, { status: 400 });
  }

  const stripe = stripeClient(billingCtx.livemode);
  const sb = supabaseAdmin();

  try {
    // 1) Create Stripe price
    const createParams: Stripe.PriceCreateParams = {
      product: pid,
      currency,
      unit_amount,
      ...(recurring ? { recurring } : {}),
    };

    const price = await stripe.prices.create(createParams, {
      stripeAccount: billingCtx.stripeAccountId,
    });

    // 2) Persist snapshot to DB
    const row = {
      org_id: billingCtx.orgId,
      livemode: billingCtx.livemode,
      stripe_price_id: price.id,
      stripe_product_id: pid,
      stripe_active: !!price.active,
      stripe_created: typeof price.created === "number" ? price.created : null,
      currency: price.currency ?? null,
      unit_amount: typeof price.unit_amount === "number" ? price.unit_amount : null,
      price_type: price.type ?? null,
      interval: price.recurring?.interval ?? null,
      interval_count: price.recurring?.interval_count ?? null,
      updated_at: new Date().toISOString(),
    };

    const persisted = await persistPriceSnapshot(sb, row);

    if (!persisted.ok) {
      const payload = {
        error: "db_upsert_failed",
        message: "Failed to persist price snapshot in organization_stripe_prices.",
        stripe_price_id: price.id,
        persistedBy: persisted.method,
        db: dbErrShape(persisted.error),
        hint:
          "This is almost always a table schema mismatch or missing UNIQUE constraint for your onConflict targets. " +
          "Check db.code/message above (common: 42P10 missing unique constraint, 23502 NOT NULL violation, 42703 missing column).",
      };

      if (STRICT_DB) return NextResponse.json(payload, { status: 500 });

      // Non-strict mode: return success but include warning
      return NextResponse.json(
        {
          ok: true,
          stripe_price_id: price.id,
          warning: payload,
        },
        { status: 200 }
      );
    }

    // 3) Best-effort activity log (do not fail request)
    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: billingCtx.orgId,
      livemode: billingCtx.livemode,
      stripe_product_id: pid,
      stripe_price_id: price.id,
      actor_user_id: billingCtx.userId ?? null,
      type: "price_created",
      payload: {
        currency,
        unit_amount: price.unit_amount,
        recurring: price.recurring ?? null,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      stripe_price_id: price.id,
      persistedBy: persisted.method,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_price_create_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
