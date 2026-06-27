// src/app/api/billing/products/labels/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripeClient } from "@/app/api/utils/stripeClient";
import { getAuthedBillingContext } from "@/app/api/utils/authedBilling";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { applyBillingProductTranslations } from "@/features/billing/server/translations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
 * Always returns string[]
 * Handles: "Admin", " admin ", ["admin","manager"], null, nested arrays, etc.
 */
function normRoles(v: unknown): string[] {
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) out.push(...normRoles(item));
    return out;
  }
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s ? [s] : [];
}

export async function POST(req: NextRequest) {
  const billingCtx = await getAuthedBillingContext(req);

  // True unauth (token/session/team mapping failed)
  if (!billingCtx) {
    return jsonError("unauthorized", 401, {
      hint: "getAuthedBillingContext returned null. Check Authorization: Bearer token, and that the resolver can find team/org + stripe account mapping.",
    });
  }

  // Role checks (403), case-insensitive
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
        orgId: (billingCtx as any).orgId ?? null,
        livemode: (billingCtx as any).livemode ?? null,
      },
    });
  }

  const stripeAccountId = String(
    (billingCtx as any).stripeAccountId ?? "",
  ).trim();
  if (!stripeAccountId) return jsonError("missing_stripe_account_id", 400);
  if (!isStripeAccountId(stripeAccountId)) {
    return jsonError("invalid_stripe_account_id", 400, { stripeAccountId });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json_body", 400);
  }

  const idsRaw = body?.ids;
  const ids: string[] = Array.from(
    new Set(
      (Array.isArray(idsRaw) ? idsRaw : [])
        .map((x: any) => String(x ?? "").trim())
        .filter((x: string) => x && isStripeProductId(x)),
    ),
  );

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, labels: {} });
  }

  try {
    const stripe = stripeClient(!!(billingCtx as any).livemode);
    const supabase = getSupabaseAdminClient();
    const requestedLocale = await resolveRequestLocale({
      request: req,
      admin: supabase,
      userId: (billingCtx as any).userId ?? null,
    });

    const productRows = ids.map((id) => ({
      productId: id,
      name: null as string | null,
      description: null as string | null,
    }));

    const results = await Promise.allSettled(
      ids.map((id) =>
        stripe.products.retrieve(
          id,
          { expand: [] },
          { stripeAccount: stripeAccountId },
        ),
      ),
    );

    for (let i = 0; i < ids.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") continue;

      const p = r.value as any;
      const name = String(p?.name ?? "").trim();
      if (name) {
        productRows[i]!.name = name;
      }
    }

    await applyBillingProductTranslations({
      admin: supabase,
      orgId: (billingCtx as any).orgId,
      livemode: !!(billingCtx as any).livemode,
      requestedLocale,
      rows: productRows,
    });

    const labels = productRows.reduce<Record<string, string>>((acc, row) => {
      if (row.name) {
        acc[row.productId] = row.name;
      }
      return acc;
    }, {});

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
