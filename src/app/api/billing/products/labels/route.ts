// src/app/api/billing/products/labels/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";

export const runtime = "nodejs";

function jsonError(error: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

function isStripeProductId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id);
}

function isStripeAccountId(v: unknown) {
  return /^acct_[a-zA-Z0-9]+$/.test(String(v ?? "").trim());
}

/**
 * ✅ Option A: Always return string[]
 * Handles: "Admin", " admin ", ["admin","manager"], null, nested arrays, etc.
 */
function normRoles(v: unknown): string[] {
  if (Array.isArray(v)) {
    // recursively flatten
    const out: string[] = [];
    for (const item of v) out.push(...normRoles(item));
    return out;
  }

  const s = String(v ?? "").trim().toLowerCase();
  return s ? [s] : [];
}

export async function POST(req: NextRequest) {
  const billingCtx = await getAuthedBillingContext(req);

  // ✅ If ctx is null, that's true unauth (token/session/team mapping failed)
  if (!billingCtx) {
    return jsonError("unauthorized", 401, {
      hint:
        "getAuthedBillingContext returned null. Check Authorization: Bearer token, and that ctx resolver can find team/org + stripe account mapping.",
    });
  }

  // ✅ Role checks should be 403, and case-insensitive
  // billingCtx.role may be string | string[] | null depending on your resolver
  const roles = normRoles((billingCtx as any).role);

  const allowed = new Set(["admin", "manager", "closer"]);
  const hasAllowedRole = roles.some((r) => allowed.has(r));

  if (!hasAllowedRole) {
    return jsonError("forbidden", 403, {
      message: "You do not have permission to resolve Stripe product labels.",
      details: {
        roleRaw: (billingCtx as any).role ?? null,
        rolesNormalized: roles,
        teamId: (billingCtx as any).teamId ?? null,
        organizationId: (billingCtx as any).organizationId ?? null,
        livemode: (billingCtx as any).livemode ?? null,
      },
    });
  }

  const stripeAccountId = String((billingCtx as any).stripeAccountId ?? "").trim();
  if (!stripeAccountId) return jsonError("missing_stripe_account_id", 400);
  if (!isStripeAccountId(stripeAccountId)) {
    return jsonError("invalid_stripe_account_id", 400, { stripeAccountId });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json_body", 400);
  }

  const idsRaw = (body as any)?.ids;
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(idsRaw) ? idsRaw : [])
        .map((x) => String(x ?? "").trim())
        .filter((x): x is string => Boolean(x) && isStripeProductId(x))
    )
  );

  if (ids.length === 0) return NextResponse.json({ ok: true, labels: {} });

  try {
    const stripe = stripeClient((billingCtx as any).livemode);

    const labels: Record<string, string> = {};

    await Promise.all(
      ids.map(async (id: string) => {
        try {
          const p = await stripe.products.retrieve(id, { expand: [] }, { stripeAccount: stripeAccountId });
          const name = String(p?.name ?? "").trim();
          if (name) labels[id] = name;
        } catch {
          // ignore missing/forbidden product ids
        }
      })
    );

    return NextResponse.json({ ok: true, labels });
  } catch (e: any) {
    return jsonError("stripe_products_labels_failed", 500, {
      message: String(e?.message ?? e),
      stripe: {
        type: e?.type ?? null,
        code: e?.code ?? null,
        statusCode: e?.statusCode ?? null,
        requestId: e?.requestId ?? null,
      },
    });
  }
}
