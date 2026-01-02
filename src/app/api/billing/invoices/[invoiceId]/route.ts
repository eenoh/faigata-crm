// src/app/api/billing/invoices/[invoiceId]/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export async function GET(
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

  const { stripeAccountId } = auth.ctx;
  const stripe = getStripe("test");

  // ✅ Unwrap params
  const resolved = await Promise.resolve(params);
  const rawInvoiceId = String(resolved?.invoiceId ?? "").trim();

  if (!rawInvoiceId || rawInvoiceId === "undefined" || rawInvoiceId === "null") {
    return NextResponse.json(
      { error: "missing_invoiceId", hint: "Route param invoiceId was empty/undefined." },
      { status: 400 }
    );
  }

  const invoiceId = decodeURIComponent(rawInvoiceId);

  try {
    const inv = await stripe.invoices.retrieve(
      invoiceId,
      { expand: ["customer", "lines.data.price.product"] },
      { stripeAccount: stripeAccountId }
    );

    const customer =
      typeof inv.customer === "object" && inv.customer
        ? {
            id: (inv.customer as any).id ?? null,
            name: (inv.customer as any).name ?? null,
            email: (inv.customer as any).email ?? null,
          }
        : inv.customer
        ? { id: String(inv.customer), name: null, email: null }
        : null;

    const lines = (inv.lines?.data ?? []).map((l: any) => {
      const price = l.price;
      const product = price?.product;
      return {
        id: l.id,
        description: l.description ?? null,
        quantity: l.quantity ?? null,
        amount: l.amount ?? null,
        currency: l.currency ?? inv.currency ?? null,
        price_id: price?.id ?? null,
        product_name: product?.name ?? null,
      };
    });

    return NextResponse.json({
      invoice: {
        id: inv.id,
        number: inv.number ?? null,
        status: inv.status ?? null,
        currency: inv.currency ?? null,
        total: inv.total ?? null,
        amount_due: inv.amount_due ?? null,
        amount_paid: inv.amount_paid ?? null,
        created: inv.created ?? null,
        due_date: inv.due_date ?? null,
        collection_method: inv.collection_method ?? null,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
        customer,
      },
      lines,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "stripe_error" }, { status: 400 });
  }
}
