// src/app/api/billing/invoices/[invoiceId]/void/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function isValidStripeInvoiceId(id: string) {
  return /^in_[A-Za-z0-9]+$/.test(id);
}

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const { stripeAccountId, livemode } = auth.ctx;

  // ✅ Use correct Stripe environment
  const stripe = getStripe(livemode ? "live" : "test");

  // ✅ Next's type system expects params to be a Promise → await it
  const { invoiceId: raw } = await ctx.params;

  const rawStr = String(raw ?? "").trim();
  const decoded = safeDecode(rawStr).trim();
  const lower = decoded.toLowerCase();

  // ✅ Strong guard against undefined/null/weird values
  if (
    !decoded ||
    lower === "undefined" ||
    lower === "null" ||
    lower === "'undefined'" ||
    lower === '"undefined"' ||
    lower.includes("undefined")
  ) {
    return NextResponse.json(
      {
        error: "missing_invoiceId",
        hint:
          "Route param invoiceId was empty/undefined. Check client router.push() and API calls.",
        received: decoded,
      },
      { status: 400 }
    );
  }

  // ✅ Validate Stripe invoice id format before calling Stripe
  if (!isValidStripeInvoiceId(decoded)) {
    return NextResponse.json(
      {
        error: "invalid_invoiceId",
        hint: "invoiceId must look like in_123... (Stripe invoice id).",
        received: decoded,
      },
      { status: 400 }
    );
  }

  const invoiceId = decoded;

  try {
    const inv = await stripe.invoices.voidInvoice(
      invoiceId,
      {},
      { stripeAccount: stripeAccountId }
    );

    return NextResponse.json({
      invoice: { id: inv.id, status: inv.status ?? null },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message ?? "stripe_error",
        invoiceId,
        stripeAccountId,
        livemode,
      },
      { status: 400 }
    );
  }
}
