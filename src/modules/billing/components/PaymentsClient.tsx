"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

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
};

type ApiError = {
  error?: string;
  detail?: string;
  details?: any;
  hint?: string;
};

async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers, cache: "no-store" });
}

const fmtMoney = (currency: string, amountSmallest: number) => {
  const cur = (currency || "usd").toUpperCase();
  const v = amountSmallest / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${cur}`;
  }
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

/* -------------------- Empty state -------------------- */

function EmptyState({
  variant,
  query,
}: {
  variant: "none" | "no_match";
  query?: string;
}) {
  return variant === "no_match" ? (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
      <p className="font-semibold text-slate-700">
        No payments match “{query}”.
      </p>
      <p className="mt-1">
        Try searching by customer email, name, status, or payment intent ID.
      </p>
    </div>
  ) : (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
      <p className="font-semibold text-slate-700">No payments yet.</p>
      <p className="mt-1">
        Once payments are registered in Stripe, they will automatically appear
        here for tracking and review.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = String(status ?? "").toLowerCase();
  const cls =
    s === "succeeded"
      ? "bg-emerald-50 text-emerald-700"
      : s === "requires_payment_method" || s === "failed"
        ? "bg-rose-50 text-rose-700"
        : s === "processing"
          ? "bg-indigo-50 text-indigo-700"
          : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {status}
    </span>
  );
}

/* -------------------- Component -------------------- */

export default function PaymentsClient() {
  const q = (useSearchParams().get("q") ?? "").trim();

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const fetchPayments = useMemo(
    () =>
      async (refresh = false) => {
        setErr(null);

        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (refresh) params.set("refresh", "1");

        const res = await authedFetch(
          `/api/billing/payments/list${params.toString() ? `?${params}` : ""}`,
        );
        const json: any = await res.json().catch(() => ({}));

        if (!res.ok) {
          setItems([]);
          setErr({
            error: json.error ?? `failed_${res.status}`,
            detail: json.detail,
            details: json.details,
            hint: json.hint,
          });
          return;
        }

        setItems((json.items ?? []) as PaymentRow[]);
      },
    [q],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      await fetchPayments(false).catch((e: any) => {
        setErr({ error: e?.message ?? "load_failed" });
        setItems([]);
      });
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPayments]);

  const totalCount = items.length;
  const visibleCount = totalCount;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Payments</h1>
            <p className="mt-1 text-sm text-slate-600">
              View payments synced from your connected Stripe account. Click a
              payment to see details.
            </p>

            {!!err && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
                <div className="font-semibold text-rose-700">
                  Error: {err.error}
                </div>
                {err.detail && (
                  <div className="mt-1 text-rose-700/90">{err.detail}</div>
                )}
                {err.hint && (
                  <div className="mt-1 text-rose-700/90">{err.hint}</div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await fetchPayments(true).catch(() => {});
                setLoading(false);
              }}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <Link
              href="/billing/payments/failed"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View failed →
            </Link>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
          {loading
            ? "Loading…"
            : q
              ? `Showing ${visibleCount} result(s) for “${q}”`
              : `${totalCount} payments`}
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading payments…</div>
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
            {items.map((p) => {
              const customerLabel =
                p.customer_email?.trim() ||
                p.customer_name?.trim() ||
                "Unknown customer";
              const amount = fmtMoney(
                p.currency,
                p.amount_received || p.amount,
              );
              const when = fmtDate(p.created_at_stripe);

              return (
                <Link
                  key={p.stripe_payment_intent_id}
                  href={`/billing/payments/${encodeURIComponent(p.stripe_payment_intent_id)}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={p.status} />
                      <span className="text-xs font-semibold text-slate-900">
                        {amount}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-600">{when}</span>
                    </div>

                    <p className="mt-1 truncate text-xs text-slate-600">
                      {customerLabel} •{" "}
                      {p.description ?? p.stripe_payment_intent_id}
                    </p>

                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                      PI: {p.stripe_payment_intent_id}
                      {p.stripe_charge_id ? ` • CH: ${p.stripe_charge_id}` : ""}
                    </p>
                  </div>

                  <div className="text-xs font-semibold text-indigo-600">
                    Open →
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
