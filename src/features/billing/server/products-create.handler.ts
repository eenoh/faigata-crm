// src/app/api/billing/products/create/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { adminClient } from "@/app/api/utils/getOrgAndStripeAccount";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { getAuthedBillingContextWithReason } from "@/features/billing/server/auth";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { syncBillingProductTranslationSources } from "@/features/billing/server/translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// âœ… For NON-dynamic routes, Next expects params: Promise<{}>
// -----------------------------
// Helpers
// -----------------------------
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
// Route
// -----------------------------
export async function handleCreateBillingProductMethodNotAllowed() {
  return NextResponse.json(
    {
      error: "method_not_supported",
      message: "Use POST /api/billing/products/create to create a product.",
    },
    { status: 405 },
  );
}

export async function handleCreateBillingProduct(req: Request) {
  const billing = await getAuthedBillingContextWithReason(req);
  if (!billing.ok) {
    switch (billing.reason) {
      case "no_user":
        return NextResponse.json(
          {
            error: "unauthorized",
            reason: "no_billing_ctx",
          },
          { status: 401 },
        );
      case "missing_privilege":
        return NextResponse.json(
          {
            error: "forbidden",
            message: "You do not have permission to create billing products.",
            details: billing.details,
          },
          { status: 403 },
        );
      case "missing_org":
        return NextResponse.json(
          {
            error: "missing_org_id",
            message: "No organization is linked to the resolved team.",
            details: billing.details,
          },
          { status: 400 },
        );
      case "missing_stripe_account":
        return NextResponse.json(
          {
            error: "missing_stripe_account_id",
            message:
              "No connected Stripe account found for this org in the selected mode.",
            details: billing.details,
          },
          { status: 400 },
        );
      default:
        return NextResponse.json(
          {
            error: "billing_context_failed",
            message: "Failed to resolve billing context.",
            details: billing.details,
          },
          { status: 500 },
        );
    }
  }

  const billingCtx = billing.ctx;
  const sb = adminClient();
  const sourceLocale = await resolveRequestLocale({
    request: req,
    admin: sb as any,
    userId: billingCtx.userId,
  });
  const body = (await req.json().catch(() => null)) as any;
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  const description =
    body?.description != null ? String(body.description) : undefined;
  const active = typeof body?.active === "boolean" ? body.active : true;
  const pricePayload = body?.price ?? null;
  const wantsPrice = !!pricePayload && typeof pricePayload === "object";

  try {
    const stripe = getStripeClientForLivemode(billingCtx.livemode);
    const product = await stripe.products.create(
      { name, ...(description !== undefined ? { description } : {}), active },
      { stripeAccount: billingCtx.stripeAccountId } as any,
    );

    let createdPrice: Stripe.Price | null = null;

    if (wantsPrice) {
      const unitAmount = Number(pricePayload?.unit_amount);
      const currency =
        String(pricePayload?.currency ?? "usd")
          .trim()
          .toLowerCase() || "usd";

      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
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
          unit_amount: Math.round(unitAmount),
          currency,
          ...(recurring ? { recurring } : {}),
        },
        { stripeAccount: billingCtx.stripeAccountId } as any,
      );
    }

    const allPrices = await listAll<Stripe.Price>(
      (params, opts) => stripe.prices.list(params, opts) as any,
      { stripeAccount: billingCtx.stripeAccountId },
    );

    const prices = allPrices
      .filter(
        (price) =>
          (typeof price.product === "string"
            ? price.product
            : (price.product as any)?.id) === product.id,
      )
      .sort(
        (left, right) =>
          (typeof right.created === "number" ? right.created : 0) -
          (typeof left.created === "number" ? left.created : 0),
      );

    try {
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

      void activityErr;
    } catch {
      // swallow logging errors intentionally
    }

    try {
      await syncBillingProductTranslationSources({
        admin: sb as any,
        orgId: billingCtx.orgId,
        livemode: billingCtx.livemode,
        sourceLocale,
        rows: [
          {
            productId: product.id,
            name: product.name ?? null,
            description: product.description ?? null,
          },
        ],
      });
    } catch (translationError) {
      console.error(
        "[billing-products-create] translation source sync failed",
        translationError,
      );
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
  } catch (error: any) {
    return NextResponse.json(
      { error: "stripe_create_failed", message: String(error?.message ?? error) },
      { status: 500 },
    );
  }
}
