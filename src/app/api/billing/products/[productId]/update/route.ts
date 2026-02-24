// src/app/api/billing/products/[productId]/update/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ productId: string }> };

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

type UpdateProductBody = {
  name?: unknown;
  description?: unknown; // allow string | "" | null
};

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  // ✅ Use your shared auth resolver (roles/org/stripeAccount/livemode)
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const { orgId, livemode, stripeAccountId, userId } = auth.ctx;

  // ✅ Next: params is Promise in your build
  const { productId: raw } = await ctx.params;
  const pid = safeDecode(String(raw ?? "")).trim();
  const lower = pid.toLowerCase();

  if (!pid || lower === "undefined" || lower === "null") {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  // Optional but helpful guard
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

  const body = (await req
    .json()
    .catch(() => ({}) as UpdateProductBody)) as UpdateProductBody;

  const name =
    body?.name != null && String(body.name).trim() !== ""
      ? String(body.name).trim()
      : null;

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

  const stripe = stripeClient(livemode);
  const sb = adminClient();

  try {
    // Stripe update (connected account)
    const updated = await stripe.products.update(
      pid,
      {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      { stripeAccount: stripeAccountId },
    );

    // Mirror snapshot in DB (best-effort; but we still await and surface error if it fails)
    const { error: upsertErr } = await sb
      .from("organization_stripe_products")
      .upsert(
        {
          org_id: orgId,
          livemode,
          stripe_product_id: updated.id,
          stripe_name: updated.name ?? null,
          stripe_description: updated.description ?? null,
          stripe_active: !!updated.active,
          stripe_created:
            typeof updated.created === "number" ? updated.created : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,livemode,stripe_product_id" },
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: "db_upsert_failed", detail: upsertErr.message },
        { status: 500 },
      );
    }

    // Activity log: best-effort (never fail the request if this insert fails)
    try {
      await sb.from("organization_stripe_catalog_activity").insert({
        org_id: orgId,
        livemode,
        stripe_product_id: pid,
        stripe_price_id: null,
        actor_user_id: userId ?? null,
        type: "product_updated",
        payload: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "stripe_update_failed", message: String(e?.message ?? e) },
      { status: 500 },
    );
  }
}
