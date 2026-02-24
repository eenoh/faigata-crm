// src/app/api/stripe/products/route.ts

/**
 * Simplifications made:
 * • Removed unused Stripe ID logic (price_ branch was unreachable + regex only allowed prod_)
 * • Added a single ID normalizer that supports BOTH prod_ and price_ (matching your later code)
 * • Centralized env + bearer-token parsing helpers and removed duplicated Supabase URL/key reads
 * • Reduced branching in the Stripe fetch loop while keeping the same output shape
 * • Kept behavior: requires auth, uses admin to read team + stripe_account_id, returns { labels }
 */

import Stripe from "stripe";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

const getBearerToken = (req: NextRequest) => {
  const auth = req.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
};

const isStripeId = (id: string) =>
  /^prod_[a-zA-Z0-9]+$/.test(id) || /^price_[a-zA-Z0-9]+$/.test(id);

const uniqStripeIds = (raw: unknown): string[] => {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from(
    new Set(
      arr
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .filter(isStripeId),
    ),
  );
};

const admin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
};

const authedUserId = async (req: NextRequest) => {
  const token = getBearerToken(req);
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data } = await client.auth.getUser(token);
  return data.user?.id ?? null;
};

async function getStripeAccountIdForUser(
  sb: ReturnType<typeof admin>,
  userId: string,
) {
  const { data: profile } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  const teamId = String((profile as any)?.team_id ?? "").trim();
  if (!teamId) return { ok: false as const, error: "missing_team" };

  const { data: team } = await sb
    .from("teams")
    .select("stripe_account_id")
    .eq("id", teamId)
    .maybeSingle();

  const stripeAccountId =
    String((team as any)?.stripe_account_id ?? "").trim() || null;
  return { ok: true as const, stripeAccountId };
}

export async function POST(req: NextRequest) {
  if (!stripeSecretKey)
    return jsonError("Missing STRIPE_SECRET_KEY env var", 500);

  const userId = await authedUserId(req);
  if (!userId) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => null);
  const ids = uniqStripeIds((body as any)?.ids);

  if (ids.length === 0) return NextResponse.json({ labels: {} });

  const sb = admin();

  const acctRes = await getStripeAccountIdForUser(sb, userId);
  if (!acctRes.ok) return jsonError(acctRes.error, 400);

  const stripeAccountId = acctRes.stripeAccountId;

  const stripe = new Stripe(stripeSecretKey);

  const labels: Record<string, string> = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        if (id.startsWith("prod_")) {
          const product = await stripe.products.retrieve(
            id,
            {},
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
          );

          const name = String(product?.name ?? "").trim();
          if (name) labels[id] = name;
          return;
        }

        // price_
        const price = await stripe.prices.retrieve(
          id,
          { expand: ["product"] },
          stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
        );

        const prodObj = price.product;
        const name =
          typeof prodObj === "object" && prodObj
            ? String((prodObj as any).name ?? "").trim()
            : "";

        if (name) labels[id] = name;
      } catch (e: any) {
        console.error("[api/stripe/products] lookup failed", {
          id,
          stripeAccountId,
          error: e?.message,
        });
      }
    }),
  );

  return NextResponse.json({ labels });
}
