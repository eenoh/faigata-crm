// src/modules/billing/components/BillingProductsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

type ProductRow = {
  stripe_product_id: string;
  stripe_name: string | null;
  stripe_description: string | null;
  stripe_active: boolean;
  stripe_created: number | null;

  local_name: string | null;
  local_description: string | null;

  is_archived: boolean;
  updated_at: string;
  display_name: string;

  current_price: {
    currency: string | null;
    unit_amount: number | null;
    recurring?: {
      interval: "day" | "week" | "month" | "year";
      interval_count?: number;
    } | null;
  } | null;
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

const fmtUnix = (unix: number | null) =>
  unix
    ? new Date(unix * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";

function fmtMoney(currency: string | null, unit_amount: number | null) {
  if (!currency || unit_amount == null) return "—";
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(unit_amount / 100);
  } catch {
    return `${unit_amount / 100} ${cur}`;
  }
}

const pluralizeInterval = (
  interval: "day" | "week" | "month" | "year",
  n: number,
) => (n === 1 ? interval : `${interval}s`);

function fmtPriceForTable(p: ProductRow["current_price"]) {
  if (!p) return { primary: "—", secondary: null as string | null };

  const amount = fmtMoney(p.currency, p.unit_amount);
  const r = p.recurring;

  if (r?.interval) {
    const n = r.interval_count ?? 1;
    const unit = pluralizeInterval(r.interval, n);
    return {
      primary:
        n === 1 ? `${amount} / ${r.interval}` : `${amount} / ${n} ${unit}`,
      secondary: n === 1 ? "Recurring" : "Recurring billing",
    };
  }

  return { primary: amount, secondary: "One-time" };
}

function LoadingState({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const theadBg = isDark ? "bg-slate-900/40" : "bg-slate-100";
  const pulse = isDark ? "bg-slate-800" : "bg-slate-200/80";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
      <div className={`border-b px-4 py-2 ${border} ${theadBg}`}>
        <div className={`h-4 w-40 animate-pulse rounded ${pulse}`} />
      </div>
      <div className={`divide-y ${divider}`}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="grid grid-cols-6 items-center gap-4">
              <div className={`h-4 w-40 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-24 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-28 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-20 animate-pulse rounded ${pulse}`} />
              <div className={`h-4 w-28 animate-pulse rounded ${pulse}`} />
              <div
                className={`ml-auto h-6 w-24 animate-pulse rounded ${pulse}`}
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
          No products match “{query}”.
        </p>
        <p className="mt-1">
          Try searching for a different name, description, or product id.
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
      <p>No products yet.</p>
      <p className="mt-1">
        Click{" "}
        <span
          className={isDark ? "font-semibold text-slate-200" : "font-semibold"}
        >
          New Product
        </span>{" "}
        to create your first one, or{" "}
        <span
          className={isDark ? "font-semibold text-slate-200" : "font-semibold"}
        >
          Refresh
        </span>{" "}
        to sync from Stripe.
      </p>
    </div>
  );
}

export default function BillingProductsClient() {
  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens (same style as invoices/customers)
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

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const ACTION_COL_W = 64;

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

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();

    return rows.filter((r) =>
      [
        r.display_name,
        r.stripe_name,
        r.local_name,
        r.stripe_product_id,
        r.stripe_description,
        r.local_description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  const totalCount = rows.length;
  const visibleCount = filtered.length;

  async function load(refresh = false) {
    setLoading(true);
    setErr(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (refresh) params.set("refresh", "1");

      const res = await authedFetch(
        `/api/billing/products${params.toString() ? `?${params}` : ""}`,
        { cache: "no-store" },
      );

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

      setRows((json.products ?? []) as ProductRow[]);
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
      {/* Header card (same style as invoices) */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${headText}`}>Products</h1>
            <p className={`mt-1 text-sm ${mutedText}`}>
              Manage products and prices synced to your connected Stripe
              account.
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
              href="/billing/products/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700"
            >
              <span className="text-sm leading-none">+</span>
              New Product
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState isDark={isDark} />
      ) : totalCount === 0 ? (
        <EmptyState variant="none" isDark={isDark} />
      ) : visibleCount === 0 ? (
        <EmptyState variant="no_match" query={q} isDark={isDark} />
      ) : (
        <div
          className={`flex-1 overflow-hidden rounded-2xl border shadow-sm ${card}`}
        >
          <div
            className="relative overflow-auto rounded-2xl"
            style={{ maxHeight: 40 + 44 * 16 }}
          >
            <table className="min-w-max w-full border-collapse text-sm">
              <thead className={`sticky top-0 z-20 ${theadBg}`}>
                <tr className="text-left">
                  {["Product", "Status", "Current Price", "Created"].map(
                    (h) => (
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
                    ),
                  )}

                  <th
                    className={`${actionThClass} ${actionDivider} sticky z-30 ${theadBg}`}
                    style={{ right: ACTION_COL_W * 2 }}
                  >
                    View
                  </th>
                  <th
                    className={`${actionThClass} sticky z-30 ${theadBg}`}
                    style={{ right: ACTION_COL_W * 1 }}
                  >
                    Edit
                  </th>
                  <th
                    className={`${actionThClass} sticky right-0 z-30 ${theadBg}`}
                  >
                    Archive
                  </th>
                </tr>
              </thead>

              <tbody className={`divide-y ${divider}`}>
                {filtered.map((p) => {
                  const isArchived = !p.stripe_active || p.is_archived;
                  const priceLabel = fmtPriceForTable(p.current_price);

                  return (
                    <tr
                      key={p.stripe_product_id}
                      className={[
                        rowHover,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-5 py-2.5 align-top">
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${headText}`}>
                            {p.display_name || p.stripe_product_id}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-[11px] ${mutedText2}`}
                          >
                            {p.stripe_description ?? "—"}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-2.5 align-top">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                            isArchived
                              ? isDark
                                ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
                                : "bg-slate-100 text-slate-600"
                              : isDark
                                ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                                : "bg-emerald-50 text-emerald-700",
                          ].join(" ")}
                        >
                          {isArchived ? "Archived" : "Active"}
                        </span>
                      </td>

                      <td className="px-5 py-2.5 align-top">
                        <div className={`text-sm font-semibold ${headText}`}>
                          {priceLabel.primary}
                        </div>
                        {priceLabel.secondary && (
                          <div className={`mt-0.5 text-[11px] ${mutedText2}`}>
                            {priceLabel.secondary}
                          </div>
                        )}
                      </td>

                      <td
                        className={`px-5 py-2.5 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {fmtUnix(p.stripe_created)}
                      </td>

                      <td
                        className={`${actionTdClass} ${actionDivider} sticky ${actionStickyBg}`}
                        style={{ right: ACTION_COL_W * 2 }}
                      >
                        <Link
                          href={`/billing/products/${encodeURIComponent(p.stripe_product_id)}`}
                          className={[
                            "inline-flex p-1 transition-colors",
                            isDark
                              ? "!text-slate-400 hover:!text-slate-200"
                              : "!text-slate-600 hover:!text-slate-900",
                          ].join(" ")}
                          title="View"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                      </td>

                      <td
                        className={`${actionTdClass} sticky ${actionStickyBg}`}
                        style={{ right: ACTION_COL_W * 1 }}
                      >
                        <Link
                          href={`/billing/products/${encodeURIComponent(p.stripe_product_id)}/edit`}
                          className={[
                            "inline-flex p-1 transition-colors",
                            isDark
                              ? "!text-indigo-300 hover:!text-indigo-200"
                              : "!text-indigo-600 hover:!text-indigo-700",
                          ].join(" ")}
                          title="Edit"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </Link>
                      </td>

                      <td
                        className={`${actionTdClass} sticky right-0 ${actionStickyBg}`}
                      >
                        {isArchived ? (
                          <span
                            className={`text-xs ${isDark ? "text-slate-600" : "text-slate-300"}`}
                          >
                            —
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/billing/products/${encodeURIComponent(p.stripe_product_id)}/delete`,
                              )
                            }
                            className={[
                              "inline-flex cursor-pointer p-1 transition-colors",
                              isDark
                                ? "!text-rose-300 hover:!text-rose-200"
                                : "!text-rose-500 hover:!text-rose-600",
                            ].join(" ")}
                            title="Archive"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
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
