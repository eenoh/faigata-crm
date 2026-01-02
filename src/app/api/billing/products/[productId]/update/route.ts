// src/app/api/billing/products/[productId]/update/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

type UpdateProductBody = {
  name?: unknown;
  description?: unknown;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ productId: string }> }
) {
  const billingCtx = await getAuthedBillingContext(req);
  if (!billingCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ✅ Next.js: params is Promise in your setup
  const { productId } = await ctx.params;
  const pid = String(productId ?? "").trim();
  if (!pid) {
    return NextResponse.json({ error: "missing_product_id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as UpdateProductBody | null;

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

  // ✅ FIX: stripeClient requires livemode argument
  const stripe = stripeClient(billingCtx.livemode);
  const sb = adminClient();

  try {
    const updated = await stripe.products.update(
      pid,
      {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
      { stripeAccount: billingCtx.stripeAccountId }
    );

    const { error: upsertErr } = await sb.from("organization_stripe_products").upsert(
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

    if (upsertErr) {
      return NextResponse.json(
        { error: "db_upsert_failed", details: upsertErr },
        { status: 500 }
      );
    }

    // Best-effort activity log (don’t fail the request if this insert fails)
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
