// src/app/api/billing/invoices/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export const runtime = "nodejs";

function normalize(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 }
    );
  }

  const { stripeAccountId, livemode } = auth.ctx;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const limitParam = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), 200)
    : 100;

  const stripe = getStripe(livemode ? "live" : "test");

  try {
    const list = await stripe.invoices.list(
      {
        limit,
        expand: ["data.customer"],
      },
      { stripeAccount: stripeAccountId }
    );

    let invoices = list.data.map((inv) => {
      const cust =
        typeof inv.customer === "object" && inv.customer
          ? (inv.customer as any)
          : null;

      return {
        id: inv.id,
        number: inv.number ?? null,
        status: inv.status ?? null,
        currency: inv.currency ?? null,

        total: typeof inv.total === "number" ? inv.total : null,
        amount_due: typeof inv.amount_due === "number" ? inv.amount_due : null,
        amount_paid: typeof inv.amount_paid === "number" ? inv.amount_paid : null,

        created: typeof inv.created === "number" ? inv.created : null,
        due_date: typeof inv.due_date === "number" ? inv.due_date : null,

        customer_id:
          typeof inv.customer === "string" ? inv.customer : cust?.id ?? null,

        customer_email: cust?.email ?? (inv.customer_email ?? null),
        customer_name: cust?.name ?? null,

        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
      };
    });

    if (q) {
      const needle = normalize(q);
      invoices = invoices.filter((inv) => {
        const hay = [
          inv.id,
          inv.number,
          inv.status,
          inv.customer_id,
          inv.customer_email,
          inv.customer_name,
        ]
          .filter(Boolean)
          .join(" ");

        return normalize(hay).includes(needle);
      });
    }

    return NextResponse.json({
      invoices,
      q,
      stripeAccountId,
      livemode,
    });
  } catch (e: any) {
    // Stripe errors can be validation/auth (400) OR server/runtime issues (500).
    const message = e?.message ?? "stripe_error";
    const status = typeof e?.statusCode === "number" ? e.statusCode : 500;

    return NextResponse.json(
      { error: message, details: e },
      { status: status >= 400 && status <= 599 ? status : 500 }
    );
  }
}
