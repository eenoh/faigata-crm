"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type PaymentRow = {
  stripe_payment_intent_id: string;
  stripe_charge_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  amount: number;
  amount_received: number;
  currency: string;
  status: string;
  created_at_stripe: string | null;
  raw: any;
};

function money(amount: number, currency: string) {
  const v = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function PaymentDetailClient({ paymentIntentId }: { paymentIntentId: string }) {
  const [item, setItem] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundLoading, setRefundLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setItem(null);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/billing/payments/${encodeURIComponent(paymentIntentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (!cancelled) {
        setItem((json?.item ?? null) as PaymentRow | null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentIntentId]);

  async function refundFull() {
    if (!item?.stripe_payment_intent_id) return;

    setRefundLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch(
        `/api/billing/payments/${encodeURIComponent(item.stripe_payment_intent_id)}/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(`Refund failed: ${j?.error ?? res.status}`);
        return;
      }

      alert("Refund created. Webhooks will update status shortly.");
    } finally {
      setRefundLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Payment Details</h1>
            <p className="mt-1 text-sm text-slate-600">
              {paymentIntentId}
            </p>
          </div>

          <Link
            href="/billing/payments"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back →
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : !item ? (
          <div className="text-sm text-slate-500">Not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-900">
                {money(item.amount_received || item.amount, item.currency)}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {item.status}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500">Customer</div>
                <div className="text-slate-900">
                  {item.customer_email ?? item.customer_name ?? "Unknown"}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500">Charge ID</div>
                <div className="text-slate-900">{item.stripe_charge_id ?? "—"}</div>
              </div>

              <div className="sm:col-span-2">
                <div className="text-xs font-semibold text-slate-500">Description</div>
                <div className="text-slate-900">{item.description ?? "—"}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={refundLoading || item.status !== "succeeded"}
                onClick={refundFull}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                {refundLoading ? "Refunding…" : "Refund payment"}
              </button>

              <div className="text-xs text-slate-500">
                Refunds require a succeeded payment (test mode ok).
              </div>
            </div>
          </div>
        )}
      </div>

      {/* raw debug */}
      {item?.raw && (
        <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Raw Stripe payload
          </summary>
          <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
{JSON.stringify(item.raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
