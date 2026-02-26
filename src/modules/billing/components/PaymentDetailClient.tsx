"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

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

const money = (amount: number, currency: string) => {
  const v = amount / 100;
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${cur}`;
  }
};

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function StatusPill({ status, isDark }: { status: string; isDark: boolean }) {
  const s = String(status ?? "").toLowerCase();

  const cls =
    s === "succeeded"
      ? isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
        : "bg-emerald-50 text-emerald-700"
      : s === "processing"
        ? isDark
          ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30"
          : "bg-indigo-50 text-indigo-700"
        : s === "requires_payment_method" || s === "failed"
          ? isDark
            ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
            : "bg-rose-50 text-rose-700"
          : isDark
            ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
            : "bg-slate-100 text-slate-600";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        cls,
      ].join(" ")}
    >
      {status}
    </span>
  );
}

export default function PaymentDetailClient({
  paymentIntentId,
}: {
  paymentIntentId: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens (same style system as invoices/customers)
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";

  const btnBase =
    "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  const btnSecondary = [
    btnBase,
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");

  const btnDanger = [
    btnBase,
    isDark
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
      : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  ].join(" ");

  const [item, setItem] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundLoading, setRefundLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const token = await getToken();

      if (!token) {
        if (!cancelled) {
          setItem(null);
          setErr("no_session");
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(
          `/api/billing/payments/${encodeURIComponent(paymentIntentId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );

        const json: any = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!cancelled) {
            setItem(null);
            setErr(json?.error ?? `failed_${res.status}`);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setItem((json.item ?? null) as PaymentRow | null);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setItem(null);
          setErr(String(e?.message ?? "load_failed"));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentIntentId]);

  async function refundFull() {
    const pid = item?.stripe_payment_intent_id;
    if (!pid) return;

    setRefundLoading(true);
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setErr("no_session");
        return;
      }

      const res = await fetch(
        `/api/billing/payments/${encodeURIComponent(pid)}/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );

      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.error ?? `refund_failed_${res.status}`);
        return;
      }

      // You can optionally reload here if your endpoint returns updated data
      // await reloadPayment();
    } finally {
      setRefundLoading(false);
    }
  }

  const amountLabel = item
    ? money(item.amount_received || item.amount, item.currency)
    : "—";

  const customerLabel =
    item?.customer_email ?? item?.customer_name ?? "Unknown";

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header card */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className={`text-2xl font-semibold ${headText}`}>
              Payment Details
            </h1>
            <p className={`mt-1 truncate text-sm ${mutedText}`}>
              {paymentIntentId}
            </p>

            {!!err && (
              <div
                className={[
                  "mt-3 rounded-xl border px-3 py-2 text-xs",
                  isDark
                    ? "border-rose-500/30 bg-rose-500/10"
                    : "border-rose-200 bg-rose-50",
                ].join(" ")}
              >
                <div
                  className={
                    isDark
                      ? "font-semibold text-rose-200"
                      : "font-semibold text-rose-700"
                  }
                >
                  Error: {err}
                </div>
              </div>
            )}
          </div>

          <Link href="/billing/payments" className={btnSecondary}>
            Back →
          </Link>
        </div>
      </div>

      {/* Details card */}
      <div className={`rounded-2xl border p-6 shadow-sm ${card}`}>
        {loading ? (
          <div className={`text-sm ${mutedText}`}>Loading…</div>
        ) : !item ? (
          <div className={`text-sm ${mutedText}`}>Not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-lg font-semibold ${headText}`}>
                {amountLabel}
              </span>
              <StatusPill status={item.status} isDark={isDark} />
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className={`text-xs font-semibold ${mutedText2}`}>
                  Customer
                </div>
                <div className={headText}>{customerLabel}</div>
              </div>

              <div>
                <div className={`text-xs font-semibold ${mutedText2}`}>
                  Charge ID
                </div>
                <div className={headText}>{item.stripe_charge_id ?? "—"}</div>
              </div>

              <div className="sm:col-span-2">
                <div className={`text-xs font-semibold ${mutedText2}`}>
                  Description
                </div>
                <div className={headText}>{item.description ?? "—"}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                disabled={refundLoading || item.status !== "succeeded"}
                onClick={refundFull}
                className={btnDanger}
              >
                {refundLoading ? "Refunding…" : "Refund payment"}
              </button>

              <div className={`text-xs ${mutedText}`}>
                Refunds require a succeeded payment (test mode ok).
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Raw payload */}
      {item?.raw && (
        <details className={`rounded-2xl border p-5 shadow-sm ${card}`}>
          <summary
            className={[
              "cursor-pointer text-sm font-semibold",
              isDark ? "text-slate-200" : "text-slate-800",
            ].join(" ")}
          >
            Raw Stripe payload
          </summary>

          <pre
            className={[
              "mt-3 overflow-auto rounded-lg p-3 text-xs",
              isDark
                ? "bg-slate-900/40 text-slate-200"
                : "bg-slate-50 text-slate-700",
            ].join(" ")}
          >
            {JSON.stringify(item.raw, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
