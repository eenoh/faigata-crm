"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

type PaymentRow = {
  stripe_payment_intent_id: string;
  customer_email: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
};

const formatMoney = (amount: number, currency: string) => {
  const value = amount / 100;
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${cur}`;
  }
};

/** Empty-state card (theme-aware, matches billing clients) */
function EmptyState({
  variant,
  query,
  isDark,
}: {
  variant: "none" | "no_match";
  query?: string;
  isDark: boolean;
}) {
  if (variant === "no_match") {
    return (
      <div
        className={[
          "rounded-xl border p-6 text-sm",
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-400"
            : "border-slate-200 bg-white text-slate-500",
        ].join(" ")}
      >
        <p
          className={
            isDark
              ? "font-semibold text-slate-200"
              : "font-semibold text-slate-700"
          }
        >
          No failed payments match “{query}”.
        </p>
        <p className="mt-1">
          Try a different email, status, or payment intent id.
        </p>
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-xl border border-dashed p-6 text-sm",
        isDark
          ? "border-slate-700 bg-slate-950 text-slate-400"
          : "border-slate-300 bg-slate-50 text-slate-500",
      ].join(" ")}
    >
      <p
        className={
          isDark
            ? "font-semibold text-slate-200"
            : "font-semibold text-slate-700"
        }
      >
        No failed payments 🎉
      </p>
      <p className="mt-1">
        When a payment fails (e.g. card declined / missing payment method),
        it’ll show up here.
      </p>
    </div>
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function FailedPaymentsClient() {
  const q = (useSearchParams().get("q") ?? "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens (match invoices/customers/payments)
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const subHeadBorder = isDark ? "border-slate-800" : "border-slate-100";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50";

  const backBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const token = await getToken();
    if (!token) {
      setItems([]);
      return;
    }

    const params = new URLSearchParams({ status: "requires_payment_method" });
    if (q) params.set("q", q);

    const res = await fetch(`/api/billing/payments/list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const json: any = await res.json().catch(() => ({}));
    setItems(res.ok ? ((json.items ?? []) as PaymentRow[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      await load().catch(() => {});
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const totalCount = items.length;
  const visibleCount = totalCount; // API already filters by q/status

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header card */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${headText}`}>
              Failed Payments
            </h1>
            <p className={`mt-1 text-sm ${mutedText}`}>
              Payments that need action (e.g. card declined / missing payment
              method).
            </p>
          </div>

          <Link
            href="/billing/payments"
            className={[
              "rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm",
              backBtn,
            ].join(" ")}
          >
            Back to all →
          </Link>
        </div>
      </div>

      {/* List card */}
      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div
          className={`border-b px-5 py-3 text-xs ${subHeadBorder} ${mutedText2}`}
        >
          {loading
            ? "Loading…"
            : q
              ? `Showing ${visibleCount} result(s) for “${q}”`
              : `${totalCount} failed payment(s)`}
        </div>

        {loading ? (
          <div className={`p-6 text-sm ${mutedText}`}>Loading…</div>
        ) : totalCount === 0 && !q ? (
          <div className="p-5">
            <EmptyState variant="none" isDark={isDark} />
          </div>
        ) : visibleCount === 0 && !!q ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} isDark={isDark} />
          </div>
        ) : (
          <div className={`divide-y ${divider}`}>
            {items.map((p) => (
              <Link
                key={p.stripe_payment_intent_id}
                href={`/billing/payments/${encodeURIComponent(p.stripe_payment_intent_id)}`}
                className={[
                  "flex items-center justify-between gap-4 px-5 py-4",
                  rowHover,
                  isDark ? "bg-slate-950" : "bg-white",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${headText}`}>
                      {p.customer_email ?? "Unknown customer"}
                    </span>

                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        isDark
                          ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
                          : "bg-rose-50 text-rose-700",
                      ].join(" ")}
                    >
                      {p.status}
                    </span>
                  </div>

                  <p className={`mt-1 truncate text-xs ${mutedText}`}>
                    {p.description ?? p.stripe_payment_intent_id}
                    {" • "}
                    {formatMoney(p.amount, p.currency)}
                  </p>
                </div>

                <div
                  className={[
                    "text-xs font-semibold",
                    isDark ? "text-indigo-300" : "text-indigo-600",
                  ].join(" ")}
                >
                  Open →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
