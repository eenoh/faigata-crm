// src/app/api/billing/payments/[id]/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  adminClient,
  getOrgIdForUser,
  getUserFromBearer,
} from "@/app/api/utils/getOrgAndStripeAccount";

export const runtime = "nodejs";

function cleanId(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null") return null;

  // Stripe PaymentIntent IDs look like pi_...
  if (!/^pi_[A-Za-z0-9]+$/.test(s)) return null;

  return s;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const paymentIntentId = cleanId((await ctx.params).id);
  if (!paymentIntentId) {
    return NextResponse.json(
      { error: "invalid_payment_intent_id" },
      { status: 400 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const user = await getUserFromBearer(jwt);
  if (!user) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) {
    return NextResponse.json({ error: "missing_org" }, { status: 400 });
  }

  const sb = adminClient();

  const { data, error } = await sb
    .from("organization_stripe_payments")
    .select("*")
    .eq("org_id", orgId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}
