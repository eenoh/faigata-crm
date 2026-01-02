"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PaymentRow = {
  stripe_payment_intent_id: string;
  customer_email: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
};

function formatMoney(amount: number, currency: string) {
  const value = amount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Empty-state card (matches LeadsClient vibe) */
function EmptyState({
  variant,
  query,
}: {
  variant: "none" | "no_match";
  query?: string;
}) {
  if (variant === "no_match") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-semibold text-slate-700">No failed payments match “{query}”.</p>
        <p className="mt-1">Try a different email, status, or payment intent id.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
      <p>No failed payments 🎉</p>
      <p className="mt-1">
        When a payment fails (e.g. card declined / missing payment method), it’ll show up here.
      </p>
    </div>
  );
}

export default function FailedPaymentsClient() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFailed = useMemo(() => {
    return async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setItems([]);
        return;
      }

      const url = new URL("/api/billing/payments/list", window.location.origin);
      url.searchParams.set("status", "requires_payment_method");
      if (q) url.searchParams.set("q", q);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setItems([]);
        return;
      }

      setItems((json?.items ?? []) as PaymentRow[]);
    };
  }, [q]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      await fetchFailed().catch(() => {});
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchFailed]);

  // Like LeadsClient: distinguish "none yet" vs "no match"
  const totalCount = useMemo(() => items.length, [items]);
  const visibleCount = totalCount; // API already filters by q/status

  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Failed Payments</h1>
            <p className="mt-1 text-sm text-slate-600">
              Payments that need action (e.g. card declined / missing payment method).
            </p>
          </div>

          <Link
            href="/billing/payments"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to all →
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
          {loading
            ? "Loading…"
            : q
            ? `Showing ${visibleCount} result(s) for “${q}”`
            : `${totalCount} failed payment(s)`}
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : totalCount === 0 && !q ? (
          <div className="p-5">
            <EmptyState variant="none" />
          </div>
        ) : visibleCount === 0 && !!q ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((p) => (
              <Link
                key={p.stripe_payment_intent_id}
                href={`/billing/payments/${encodeURIComponent(p.stripe_payment_intent_id)}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {p.customer_email ?? "Unknown customer"}
                    </span>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                      {p.status}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-xs text-slate-500">
                    {p.description ?? p.stripe_payment_intent_id}
                    {" • "}
                    {formatMoney(p.amount, p.currency)}
                  </p>
                </div>

                <div className="text-xs font-semibold text-indigo-600">Open →</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
