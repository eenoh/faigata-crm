// src/app/api/billing/invoices/[invoiceId]/finalize/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

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
  const stripe = getStripe(livemode ? "live" : "test");

  // ✅ Next expects params as Promise in this build; unwrap directly
  const { invoiceId: raw } = await ctx.params;
  const rawInvoiceId = String(raw ?? "").trim();

  if (!rawInvoiceId || rawInvoiceId === "undefined" || rawInvoiceId === "null") {
    return NextResponse.json(
      { error: "missing_invoiceId", hint: "Route param invoiceId was empty/undefined." },
      { status: 400 }
    );
  }

  const invoiceId = decodeURIComponent(rawInvoiceId);

  try {
    const inv = await stripe.invoices.finalizeInvoice(
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
