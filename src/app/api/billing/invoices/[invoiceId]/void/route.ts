// src/app/api/billing/invoices/[invoiceId]/void/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

type RouteContext = { params: Promise<{ invoiceId: string }> };

function cleanInvoiceId(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const lowered = raw.toLowerCase();
  if (lowered === "undefined" || lowered === "null") return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {}

  decoded = decoded.trim();
  const dLower = decoded.toLowerCase();
  if (!decoded || dLower === "undefined" || dLower === "null") return null;

  // Stripe invoice ids look like: in_...
  if (!/^in_[A-Za-z0-9]+$/.test(decoded)) return null;

  return decoded;
}

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const invoiceId = cleanInvoiceId((await ctx.params).invoiceId);
  if (!invoiceId) {
    return NextResponse.json(
      {
        error: "invalid_invoiceId",
        hint: "Route param invoiceId was missing/invalid (expected Stripe invoice id like in_123...).",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe(auth.ctx.livemode ? "live" : "test");

  try {
    const inv = await stripe.invoices.voidInvoice(
      invoiceId,
      {},
      { stripeAccount: auth.ctx.stripeAccountId },
    );

    return NextResponse.json({
      invoice: { id: inv.id, status: inv.status ?? null },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 },
    );
  }
}
