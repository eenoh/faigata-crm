import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUserFromAccessToken } from "@/lib/auth/session";
import { getStripeClientForLivemode } from "@/lib/stripe/client";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";

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

async function getStripeAccountIdForUser(userId: string) {
  const supabase = getSupabaseAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  const teamId = String((profile as { team_id?: string | null } | null)?.team_id ?? "").trim();
  if (!teamId) return { ok: false as const, error: "missing_team" };

  const { data: team } = await supabase
    .from("teams")
    .select("stripe_account_id")
    .eq("id", teamId)
    .maybeSingle();

  const stripeAccountId =
    String((team as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? "").trim() || null;
  return { ok: true as const, stripeAccountId };
}

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return jsonError("unauthorized", 401);

  const user = await getUserFromAccessToken(token);
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => null);
  const ids = uniqStripeIds((body as { ids?: unknown } | null)?.ids);

  if (ids.length === 0) return NextResponse.json({ labels: {} });

  const acctRes = await getStripeAccountIdForUser(user.id);
  if (!acctRes.ok) return jsonError(acctRes.error, 400);

  const stripe = getStripeClientForLivemode(serverEnv.stripe.livemode());
  const labels: Record<string, string> = {};

  await Promise.all(
    ids.map(async (id) => {
      try {
        if (id.startsWith("prod_")) {
          const product = await stripe.products.retrieve(
            id,
            {},
            acctRes.stripeAccountId
              ? { stripeAccount: acctRes.stripeAccountId }
              : undefined,
          );

          const name = String(product?.name ?? "").trim();
          if (name) labels[id] = name;
          return;
        }

        const price = await stripe.prices.retrieve(
          id,
          { expand: ["product"] },
          acctRes.stripeAccountId
            ? { stripeAccount: acctRes.stripeAccountId }
            : undefined,
        );

        const product = price.product;
        const name =
          typeof product === "object" &&
          product &&
          "name" in product
            ? String(product.name ?? "").trim()
            : "";

        if (name) labels[id] = name;
      } catch (error) {
        console.error("[api/stripe/products] lookup failed", {
          id,
          stripeAccountId: acctRes.stripeAccountId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return NextResponse.json({ labels });
}
