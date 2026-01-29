// src/app/api/billing/invoices/[invoiceId]/uncollectible/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ IMPORTANT: Next's generated types in your build expect params to be a Promise.
type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const { stripeAccountId, livemode } = auth.ctx;

  // ✅ use the correct Stripe key based on env
  const stripe = getStripe(livemode ? "live" : "test");

  // ✅ unwrap params
  const { invoiceId: rawInvoiceId } = await ctx.params;
  const invoiceId = decodeURIComponent(String(rawInvoiceId ?? "")).trim();

  if (!invoiceId || invoiceId === "undefined" || invoiceId === "null") {
    return NextResponse.json({ error: "missing_invoiceId" }, { status: 400 });
  }

  try {
    const inv = await stripe.invoices.markUncollectible(
      invoiceId,
      {},
      { stripeAccount: stripeAccountId }
    );

    return NextResponse.json({
      invoice: { id: inv.id, status: inv.status ?? null },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 }
    );
  }
}
