// src/app/api/billing/products/[productId]/update/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripeClient } from "@/app/api/utils/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "admin" | "manager" | "closer" | "member";

type BillingCtx = {
  userId: string;
  teamId: string;
  orgId: string;
  role: Role;
  livemode: boolean;
  stripeAccountId: string;
};

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("missing_supabase_url");
  if (!serviceKey) throw new Error("missing_service_role_key");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  if (Array.isArray(v)) for (const x of v) out.add(normalizeRoleOne(x));
  else if (v != null) out.add(normalizeRoleOne(v));
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

  const { data: profile } = await admin
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const profilesTeamId = String((profile as any)?.team_id ?? "").trim() || null;
  const profilesRoleRaw: unknown = (profile as any)?.role;

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

  const { data: teamRow } = await admin
    .from("teams")
    .select("organization_id")
    .eq("id", teamId)
    .maybeSingle();

  const orgId = String((teamRow as any)?.organization_id ?? "").trim();
  if (!orgId) return null;

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

type UpdateProductBody = {
  name?: unknown;
  description?: unknown;
};

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ productId: string }> }) {
  const billingCtx = await resolveBillingCtx(req);
  if (!billingCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed: Role[] = ["admin", "manager", "closer"];
  if (!allowed.includes(billingCtx.role)) {
    return NextResponse.json(
      { error: "forbidden", message: "Missing privilege to update products.", details: { role: billingCtx.role } },
      { status: 403 }
    );
  }

  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();
  if (!pid) return NextResponse.json({ error: "missing_product_id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as UpdateProductBody | null;

  const name = body?.name != null && String(body.name).trim() !== "" ? String(body.name).trim() : null;

  // allow explicit clearing description by sending "" or null
  const description =
    body?.description === null
      ? null
      : body?.description != null
      ? String(body.description).trim()
      : undefined;

  if (!name && description === undefined) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const stripe = stripeClient(billingCtx.livemode);
  const sb = supabaseAdmin();

  try {
    const updated = await stripe.products.update(
      pid,
      {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      { stripeAccount: billingCtx.stripeAccountId }
    );

    await sb.from("organization_stripe_products").upsert(
      {
        org_id: billingCtx.orgId,
        livemode: billingCtx.livemode,
        stripe_product_id: updated.id,
        stripe_name: updated.name ?? null,
        stripe_description: updated.description ?? null,
        stripe_active: !!updated.active,
        stripe_created: typeof updated.created === "number" ? updated.created : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,livemode,stripe_product_id" }
    );

    // Best-effort activity log
    await sb.from("organization_stripe_catalog_activity").insert({
      org_id: billingCtx.orgId,
      livemode: billingCtx.livemode,
      stripe_product_id: pid,
      actor_user_id: billingCtx.userId ?? null,
      type: "product_updated",
      payload: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_update_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
