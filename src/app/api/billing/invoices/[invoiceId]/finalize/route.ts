// src/app/api/billing/invoices/[invoiceId]/finalize/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

function cleanParam(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return null;
  return decodeURIComponent(s);
}

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const invoiceId = cleanParam((await ctx.params).invoiceId);
  if (!invoiceId) {
    return NextResponse.json(
      {
        error: "missing_invoiceId",
        hint: "Route param invoiceId was empty/undefined.",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe(auth.ctx.livemode ? "live" : "test");

  try {
    const inv = await stripe.invoices.finalizeInvoice(
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
