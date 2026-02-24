// src/app/api/billing/invoices/route.ts
import { NextResponse } from "next/server";
import { getAuthedBillingContextWithReason } from "@/app/api/utils/authedBilling";
import { getStripe } from "@/lib/stripeServer";

export const runtime = "nodejs";

function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function clampInt(
  v: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export async function GET(req: Request) {
  const auth = await getAuthedBillingContextWithReason(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, details: auth.details },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const refresh = url.searchParams.get("refresh") === "1"; // optional, for parity with clients
  const limit = clampInt(url.searchParams.get("limit") ?? "100", {
    min: 1,
    max: 200,
    fallback: 100,
  });

  const stripe = getStripe(auth.ctx.livemode ? "live" : "test");

  try {
    const list = await stripe.invoices.list(
      {
        limit,
        expand: ["data.customer"],
      },
      { stripeAccount: auth.ctx.stripeAccountId },
    );

    const rows = list.data.map((inv) => {
      const cust =
        typeof inv.customer === "object" && inv.customer
          ? (inv.customer as any)
          : null;

      return {
        id: inv.id,
        number: inv.number ?? null,
        status: inv.status ?? null,
        currency: inv.currency ?? null,

        created: typeof inv.created === "number" ? inv.created : null,
        due_date: typeof inv.due_date === "number" ? inv.due_date : null,

        total: typeof inv.total === "number" ? inv.total : null,

        customer_id:
          typeof inv.customer === "string" ? inv.customer : (cust?.id ?? null),
        customer_email: cust?.email ?? inv.customer_email ?? null,
        customer_name: cust?.name ?? null,
      };
    });

    const filtered =
      q.length > 0
        ? rows.filter((r) =>
            norm(
              [
                r.id,
                r.number,
                r.status,
                r.customer_id,
                r.customer_email,
                r.customer_name,
              ]
                .filter(Boolean)
                .join(" "),
            ).includes(norm(q)),
          )
        : rows;

    return NextResponse.json({
      invoices: filtered,
      q,
      limit,
      refresh,
      stripeAccountId: auth.ctx.stripeAccountId,
      livemode: auth.ctx.livemode,
    });
  } catch (e: any) {
    const message = e?.message ?? "stripe_error";
    const status =
      typeof e?.statusCode === "number" &&
      e.statusCode >= 400 &&
      e.statusCode <= 599
        ? e.statusCode
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
