// src/app/api/billing/invoices/create/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export async function POST(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const stripe = getStripe("test");
  const { stripeAccountId } = auth.ctx;

  const body = await req.json().catch(() => ({}));
  const customerId = String(body.customerId ?? "").trim();
  if (!customerId) {
    return NextResponse.json({ error: "missing_customerId" }, { status: 400 });
  }

  const collection_method = (body.collection_method ?? "send_invoice") as
    | "send_invoice"
    | "charge_automatically";

  const days_until_due =
    collection_method === "send_invoice"
      ? Math.max(0, Number(body.days_until_due) || 7)
      : undefined;

  const memo = String(body.memo ?? "").trim();

  try {
    const inv = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method,
        days_until_due,
        // ✅ use memo as description (so it shows in Stripe and on invoice)
        description: memo || body.description || undefined,
        metadata: body.metadata ?? undefined,
      },
      { stripeAccount: stripeAccountId }
    );

    return NextResponse.json({
      invoice: {
        id: inv.id,
        status: inv.status ?? null,
        currency: inv.currency ?? null,
        total: inv.total ?? null,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 }
    );
  }
}
