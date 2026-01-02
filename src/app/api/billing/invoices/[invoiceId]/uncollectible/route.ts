// src/app/api/billing/invoices/[invoiceId]/uncollectible/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason, details: auth.details }, { status: 401 });

  const stripe = getStripe("test");
  const { stripeAccountId } = auth.ctx;
  const invoiceId = decodeURIComponent(params.invoiceId);

  try {
    const inv = await stripe.invoices.markUncollectible(invoiceId, {}, { stripeAccount: stripeAccountId });
    return NextResponse.json({ invoice: { id: inv.id, status: inv.status ?? null } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "stripe_error" }, { status: 400 });
  }
}
