// src/app/api/billing/invoices/[invoiceId]/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import {
  applyBillingCustomerNameTranslations,
  applyBillingInvoiceLineTranslations,
} from "@/features/billing/server/translations";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { getStripe } from "@/lib/stripeServer";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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

  // Stripe invoice ids: in_...
  if (!/^in_[A-Za-z0-9]+$/.test(decoded)) return null;

  return decoded;
}

export async function GET(req: Request, ctx: RouteContext) {
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
        hint: "Expected a Stripe invoice id like in_123...",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe(auth.ctx.livemode ? "live" : "test");
  const supabase = getSupabaseAdminClient();
  const requestedLocale = await resolveRequestLocale({
    request: req,
    admin: supabase,
    userId: auth.ctx.userId,
  });

  try {
    const inv = await stripe.invoices.retrieve(
      invoiceId,
      { expand: ["customer", "lines.data.price.product"] },
      { stripeAccount: auth.ctx.stripeAccountId },
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

    const lines = (inv.lines?.data ?? []).map((l: any) => ({
      id: l.id,
      description: l.description ?? null,
      quantity: l.quantity ?? null,
      amount: l.amount ?? null,
      currency: l.currency ?? inv.currency ?? null,
      price_id: l.price?.id ?? null,
      product_name: (l.price?.product as any)?.name ?? null,
    }));

    if (customer?.id) {
      const customerRows = [
        {
          customerId: customer.id,
          name: customer.name ?? null,
        },
      ];

      await applyBillingCustomerNameTranslations({
        admin: supabase,
        orgId: auth.ctx.orgId,
        livemode: auth.ctx.livemode,
        requestedLocale,
        rows: customerRows,
      });

      customer.name = customerRows[0]?.name ?? customer.name;
    }

    const lineTranslationRows = lines.map((line) => ({
      lineId: line.id,
      description: line.description,
    }));

    await applyBillingInvoiceLineTranslations({
      admin: supabase,
      orgId: auth.ctx.orgId,
      livemode: auth.ctx.livemode,
      requestedLocale,
      rows: lineTranslationRows,
    });

    for (const [index, line] of lines.entries()) {
      const translated = lineTranslationRows[index];
      if (translated) {
        line.description = translated.description;
      }
    }

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
    return NextResponse.json(
      { error: e?.message ?? "stripe_error" },
      { status: 400 },
    );
  }
}
