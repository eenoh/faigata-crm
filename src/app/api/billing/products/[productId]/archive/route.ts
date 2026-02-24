// src/app/api/billing/products/[productId]/archive/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ productId: string }> };

type Role = "admin" | "manager" | "closer" | "member";

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function isStripeProductId(id: string) {
  return /^prod_[A-Za-z0-9]+$/.test(id);
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
 * Accepts role values like:
 * - "Admin"
 * - "manager"
 * - ["member", "Admin"]
 * - null/undefined
 */
function normalizeRole(v: unknown): Role {
  const set = new Set<Role>();

  if (Array.isArray(v)) {
    for (const x of v) set.add(normalizeRoleOne(x));
  } else if (v != null) {
    set.add(normalizeRoleOne(v));
  }

  if (set.size === 0) return "member";

  // pick highest
  if (set.has("admin")) return "admin";
  if (set.has("manager")) return "manager";
  if (set.has("closer")) return "closer";
  return "member";
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  // ✅ Next.js: params is a Promise
  const { productId: raw } = await ctx.params;
  const pid = safeDecode(String(raw ?? "")).trim();
  const lower = pid.toLowerCase();

  if (!pid || lower === "undefined" || lower === "null") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  // Optional but very helpful guard (avoids calling Stripe with garbage)
  if (!isStripeProductId(pid)) {
    return NextResponse.json(
      {
        error: "invalid_product_id",
        hint: "Expected Stripe Product ID like prod_123...",
        received: pid,
      },
      { status: 400 },
    );
  }

  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ✅ NOT case sensitive role check (supports "Admin", ["member","Admin"], etc.)
  const role = normalizeRole((billingCtx as any).role);
  const allowed: Role[] = ["admin", "manager", "closer"];
  if (!allowed.includes(role)) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "You do not have permission to archive products.",
        role,
      },
      { status: 403 },
    );
  }

  const sb = adminClient();

  // Safety: verify product belongs to org (prevents cross-org updates)
  const { data: productRow, error: prodLookupErr } = await sb
    .from("organization_stripe_products")
    .select("stripe_product_id")
    .eq("org_id", billingCtx.orgId)
    .eq("livemode", billingCtx.livemode)
    .eq("stripe_product_id", pid)
    .maybeSingle();

  if (prodLookupErr) {
    return NextResponse.json(
      { error: "db_error", detail: prodLookupErr.message },
      { status: 500 },
    );
  }

  if (!productRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const stripe = stripeClient(billingCtx.livemode);

    // ✅ Archive in Stripe (connected account)
    const updated = await stripe.products.update(
      pid,
      { active: false },
      { stripeAccount: billingCtx.stripeAccountId },
    );

    // ✅ Mirror to DB
    const { error: updErr } = await sb
      .from("organization_stripe_products")
      .update({
        stripe_active: false,
        is_archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", billingCtx.orgId)
      .eq("livemode", billingCtx.livemode)
      .eq("stripe_product_id", pid);

    if (updErr) {
      return NextResponse.json(
        { error: "db_update_failed", detail: updErr.message },
        { status: 500 },
      );
    }

    // ✅ Activity log (best-effort; don’t fail request if this insert fails)
    try {
      await sb.from("organization_stripe_catalog_activity").insert({
        org_id: billingCtx.orgId,
        livemode: billingCtx.livemode,
        stripe_product_id: pid,
        stripe_price_id: null,
        actor_user_id: billingCtx.userId ?? null,
        type: "product_archived",
        payload: { stripe_active: updated.active },
      });
    } catch {
      // intentionally ignore logging failures
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: "stripe_update_failed",
        message: String(e?.message ?? e),
      },
      { status: 500 },
    );
  }
}
