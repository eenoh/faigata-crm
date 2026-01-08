// src/app/api/stripe/products/route.ts
import Stripe from "stripe";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isStripeProductId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id);
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authedUserId(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });

  const { data } = await client.auth.getUser(token);
  return data.user?.id ?? null;
}

export async function POST(req: NextRequest) {
  if (!stripeSecretKey) return jsonError("Missing STRIPE_SECRET_KEY env var", 500);

  const userId = await authedUserId(req);
  if (!userId) return jsonError("unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const idsRaw = Array.isArray((body as any)?.ids) ? ((body as any).ids as unknown[]) : [];
  const ids: string[] = Array.from(
    new Set(
      idsRaw
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .filter(isStripeProductId)
    )
  );

  if (ids.length === 0) return NextResponse.json({ labels: {} });

  // --- Load user's team + connected stripe account id ---
  // Adjust these queries to match YOUR schema:
  // Option A: profiles has team_id, and teams has stripe_account_id
  const sb = admin();

  const { data: profile } = await sb.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  const teamId = String((profile as any)?.team_id ?? "").trim();
  if (!teamId) return jsonError("missing_team", 400);

  const { data: team } = await sb
    .from("teams")
    .select("stripe_account_id")
    .eq("id", teamId)
    .maybeSingle();

  const stripeAccountId = String((team as any)?.stripe_account_id ?? "").trim() || null;

  // --- Stripe client ---
  const stripe = new Stripe(stripeSecretKey);

  const labels: Record<string, string> = {};

  await Promise.all(
    ids.map(async (id: string) => {
      try {
        if (id.startsWith("prod_")) {
          const product = await stripe.products.retrieve(
            id,
            {},
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
          );
          const name = String(product?.name ?? "").trim();
          if (name) labels[id] = name;
          return;
        }

        if (id.startsWith("price_")) {
          const price = await stripe.prices.retrieve(
            id,
            { expand: ["product"] },
            stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
          );

          const prodObj = price.product;
          const name =
            typeof prodObj === "object" && prodObj
              ? String((prodObj as any).name ?? "").trim()
              : "";

          if (name) labels[id] = name;
          return;
        }
      } catch (e) {
        // IMPORTANT: log in dev so you can see why it failed
        console.error("[api/stripe/products] lookup failed", { id, stripeAccountId, error: (e as any)?.message });
      }
    })
  );


  return NextResponse.json({ labels });
}
