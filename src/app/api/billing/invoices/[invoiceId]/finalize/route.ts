// src/app/api/billing/invoices/[invoiceId]/finalize/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ invoiceId: string }> | { invoiceId: string };
  }
) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const stripe = getStripe("test");
  const { stripeAccountId } = auth.ctx;

  // ✅ Unwrap params (Next can pass Promise-like params)
  const resolved = await Promise.resolve(params);
  const rawInvoiceId = String(resolved?.invoiceId ?? "").trim();

  if (!rawInvoiceId || rawInvoiceId === "undefined" || rawInvoiceId === "null") {
    return NextResponse.json(
      {
        error: "missing_invoiceId",
        hint: "Route param invoiceId was empty/undefined.",
      },
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
      invoice: {
        id: inv.id,
        status: inv.status ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 }
    );
  }
}
