// src/modules/billing/components/BillingInvoicesClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowPathIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

type InvoiceRow = {
  id: string; // Stripe invoice id (in_...)
  number: string | null;
  status: string | null; // draft | open | paid | void | uncollectible
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  created: number | null; // unix seconds
  due_date: number | null; // unix seconds
  total: number | null; // cents
  currency: string | null;
};

type ApiError = {
  error?: string;
  reason?: string;
  hint?: string;
  details?: any;
  message?: string;
};

async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

const fmtUnixDate = (unix: number | null) =>
  unix
    ? new Date(unix * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";

function fmtMoney(currency: string | null, cents: number | null) {
  if (!currency || cents == null) return "—";
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

function StatusPill({
  status,
  isDark,
}: {
  status: string | null;
  isDark: boolean;
}) {
  const s = String(status ?? "").toLowerCase();

  const cls =
    s === "paid"
      ? isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
        : "bg-emerald-50 text-emerald-700"
      : s === "open"
        ? isDark
          ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30"
          : "bg-indigo-50 text-indigo-700"
        : s === "void"
          ? isDark
            ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
            : "bg-rose-50 text-rose-700"
          : isDark
            ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
            : "bg-slate-100 text-slate-600";

  const label =
    s === "paid"
      ? "Paid"
      : s === "open"
        ? "Open"
        : s === "draft"
          ? "Draft"
          : s === "void"
            ? "Void"
            : s
              ? s.replace(/\b\w/g, (m) => m.toUpperCase())
              : "—";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function LoadingState({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const theadBg = isDark ? "bg-slate-900/40" : "bg-slate-100";
  const pulse = isDark ? "bg-slate-800" : "bg-slate-200/80";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const headerBg = isDark ? "bg-slate-950" : "bg-white";

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
      <div className={`border-b px-4 py-2 ${border} ${theadBg}`}>
        <div className={`h-4 w-40 animate-pulse rounded ${pulse}`} />
      </div>
      <div className={`divide-y ${divider}`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="grid grid-cols-5 items-center gap-4">
              <div className={`h-4 w-48 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-24 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-28 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-24 animate-pulse rounded ${pulse}`} />
              <div
                className={`ml-auto h-6 w-16 animate-pulse rounded ${pulse}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
          "rounded-xl border p-6 text-sm shadow-sm",
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
          No invoices match “{query}”.
        </p>
        <p className="mt-1">
          Try a customer name, email, invoice number, or Stripe invoice id.
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
      <p>No invoices yet.</p>
      <p className="mt-1">
        When invoices are created in Stripe, they’ll appear here automatically.
        Use{" "}
        <span
          className={isDark ? "font-semibold text-slate-200" : "font-semibold"}
        >
          New Invoice
        </span>{" "}
        to create one now, or{" "}
        <span
          className={isDark ? "font-semibold text-slate-200" : "font-semibold"}
        >
          Refresh
        </span>{" "}
        to sync the latest data.
      </p>
    </div>
  );
}

export default function BillingInvoicesClient() {
  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50";
  const theadBg = isDark ? "bg-slate-900/40" : "bg-slate-100";
  const actionStickyBg = isDark ? "bg-slate-950" : "bg-white";

  const refreshBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const ACTION_COL_W = 64;

  // action header/cell styles (theme aware)
  const actionThClass = [
    "px-2 py-2 font-semibold text-center w-16 whitespace-nowrap border-b",
    isDark
      ? "text-slate-300 border-slate-800"
      : "text-slate-700 border-slate-200",
  ].join(" ");

  const actionTdClass = [
    "px-2 py-2 align-top text-center w-16 border-b",
    isDark ? "border-slate-800" : "border-slate-100",
  ].join(" ");

  const actionDivider = isDark
    ? "border-l-2 border-slate-800"
    : "border-l-2 border-slate-200";

  const totalCount = rows.length;

  async function load(refresh = false) {
    setLoading(true);
    setErr(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (refresh) params.set("refresh", "1");

      const url = `${"/api/billing/invoices"}${params.toString() ? `?${params}` : ""}`;

      const res = await authedFetch(url, { cache: "no-store" });
      const json: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr({
          error: json.error ?? `failed_${res.status}`,
          reason: json.reason,
          hint: json.hint,
          details: json.details,
          message: json.message,
        });
        setRows([]);
        return;
      }

      setRows((json.invoices ?? []) as InvoiceRow[]);
    } catch (e: any) {
      setErr({ error: e?.message ?? "load_failed" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${headText}`}>Invoices</h1>
            <p className={`text-sm ${mutedText}`}>
              Create, review, and send invoices synced with your connected
              Stripe account.
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
                  Error: {err.error}
                  {err.reason ? ` (${err.reason})` : ""}
                </div>
                {err.hint && (
                  <div
                    className={
                      isDark ? "mt-1 text-rose-200/90" : "mt-1 text-rose-700/90"
                    }
                  >
                    {err.hint}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading}
              className={[
                "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
                refreshBtn,
              ].join(" ")}
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <Link
              href="/billing/invoices/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700"
            >
              <span className="text-sm leading-none">+</span>
              New Invoice
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState isDark={isDark} />
      ) : totalCount === 0 && !q ? (
        <EmptyState variant="none" isDark={isDark} />
      ) : totalCount === 0 && !!q ? (
        <EmptyState variant="no_match" query={q} isDark={isDark} />
      ) : (
        <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
          <div
            className="relative overflow-auto rounded-2xl"
            style={{ maxHeight: 40 + 44 * 16 }}
          >
            <table className="min-w-max w-full border-collapse text-sm">
              <thead className={`sticky top-0 z-20 ${theadBg}`}>
                <tr className="text-left">
                  {[
                    "Invoice",
                    "Customer",
                    "Status",
                    "Total",
                    "Created",
                    "Due",
                  ].map((h) => (
                    <th
                      key={h}
                      className={[
                        "px-5 py-2 font-semibold whitespace-nowrap border-b",
                        isDark
                          ? "text-slate-300 border-slate-800"
                          : "text-slate-700 border-slate-200",
                      ].join(" ")}
                    >
                      {h}
                    </th>
                  ))}

                  <th
                    className={`${actionThClass} ${actionDivider} sticky z-30 ${theadBg}`}
                    style={{ right: ACTION_COL_W * 0 }}
                  >
                    View
                  </th>
                </tr>
              </thead>

              <tbody className={`divide-y ${divider}`}>
                {rows.map((inv) => {
                  const customerLabel =
                    inv.customer_name?.trim() ||
                    inv.customer_email?.trim() ||
                    inv.customer_id ||
                    "—";

                  return (
                    <tr
                      key={inv.id}
                      className={[
                        rowHover,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-5 py-2.5 align-top">
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${headText}`}>
                            {inv.number ? `#${inv.number}` : inv.id}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-[11px] ${mutedText2}`}
                          >
                            Stripe: <span className="font-mono">{inv.id}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-2.5 align-top">
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${headText}`}>
                            {customerLabel}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-[11px] ${mutedText2}`}
                          >
                            {inv.customer_email ?? "—"}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-2.5 align-top">
                        <StatusPill status={inv.status} isDark={isDark} />
                      </td>

                      <td
                        className={`px-5 py-2.5 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        <span className={`font-semibold ${headText}`}>
                          {fmtMoney(inv.currency, inv.total)}
                        </span>
                      </td>

                      <td
                        className={`px-5 py-2.5 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {fmtUnixDate(inv.created)}
                      </td>

                      <td
                        className={`px-5 py-2.5 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {fmtUnixDate(inv.due_date)}
                      </td>

                      <td
                        className={`${actionTdClass} ${actionDivider} sticky right-0 ${actionStickyBg}`}
                        style={{ right: ACTION_COL_W * 0 }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/billing/invoices/${encodeURIComponent(inv.id)}`,
                            )
                          }
                          className={[
                            "inline-flex cursor-pointer p-1 transition-colors",
                            isDark
                              ? "!text-slate-400 hover:!text-slate-200"
                              : "!text-slate-600 hover:!text-slate-900",
                          ].join(" ")}
                          title="View"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
