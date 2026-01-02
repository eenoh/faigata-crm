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
  PlusCircleIcon,
} from "@heroicons/react/24/outline";

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

  // ✅ current price
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

function fmtUnix(unix: number | null) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtMoney(currency: string | null, unit_amount: number | null) {
  if (!currency || unit_amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(unit_amount / 100);
  } catch {
    return `${unit_amount / 100} ${currency.toUpperCase()}`;
  }
}

/**
 * ✅ Better UX label:
 * - One-time: "$199"
 * - Recurring: "$29 / month"
 * - Recurring (interval_count > 1): "$58 / 2 months"
 */
function pluralizeInterval(interval: "day" | "week" | "month" | "year", n: number) {
  if (n === 1) return interval;
  return `${interval}s`;
}

function fmtPriceForTable(p: ProductRow["current_price"]) {
  if (!p) return { primary: "—", secondary: null as string | null };

  const amount = fmtMoney(p.currency, p.unit_amount);

  const r = p.recurring;
  if (r?.interval) {
    const n = r.interval_count ?? 1;
    const unit = pluralizeInterval(r.interval, n);
    const primary = n === 1 ? `${amount} / ${r.interval}` : `${amount} / ${n} ${unit}`;
    const secondary = n === 1 ? "Recurring" : "Recurring billing";
    return { primary, secondary };
  }

  return { primary: amount, secondary: "One-time" };
}

async function authedFetch(input: RequestInfo, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

function LoadingState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-100 px-4 py-2">
        <div className="h-4 w-40 rounded bg-slate-200/80 animate-pulse" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="grid grid-cols-6 gap-4 items-center">
              <div className="h-4 w-40 rounded bg-slate-200/70 animate-pulse" />
              <div className="h-4 w-24 rounded bg-slate-200/70 animate-pulse" />
              <div className="h-4 w-28 rounded bg-slate-200/70 animate-pulse" />
              <div className="h-4 w-20 rounded bg-slate-200/70 animate-pulse" />
              <div className="h-4 w-28 rounded bg-slate-200/70 animate-pulse" />
              <div className="ml-auto h-6 w-24 rounded bg-slate-200/70 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ variant, query }: { variant: "none" | "no_match"; query?: string }) {
  if (variant === "no_match") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        <p className="font-semibold text-slate-700">No products match “{query}”.</p>
        <p className="mt-1">Try searching for a different name, description, or product id.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
      <p>No products yet.</p>
      <p className="mt-1">
        Click <span className="font-semibold">New Product</span> to create your first one, or{" "}
        <span className="font-semibold">Refresh</span> to sync from Stripe.
      </p>
    </div>
  );
}

export default function BillingProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const ACTION_COL_W = 64;
  const actionThClass =
    "border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 text-center w-16 whitespace-nowrap";
  const actionTdClass = "border-b border-slate-100 px-2 py-2 align-top text-center w-16";
  const actionDividerThClass = "border-l-2 border-slate-200";
  const actionDividerTdClass = "border-l-2 border-slate-200";

  const filtered = useMemo(() => {
    if (!q) return rows;

    const needle = q.toLowerCase();
    return rows.filter((r) => {
      const hay = [
        r.display_name,
        r.stripe_name,
        r.local_name,
        r.stripe_product_id,
        r.stripe_description,
        r.local_description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [rows, q]);

  const totalCount = rows.length;
  const visibleCount = filtered.length;

  async function load(refresh = false) {
    setLoading(true);
    setErr(null);

    try {
      const url = `/api/billing/products${q ? `?q=${encodeURIComponent(q)}` : ""}${
        refresh ? `${q ? "&" : "?"}refresh=1` : ""
      }`;

      const res = await authedFetch(url, { cache: "no-store" });
      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        setErr({
          error: json?.error ?? `failed_${res.status}`,
          reason: json?.reason,
          hint: json?.hint,
          details: json?.details,
          message: json?.message,
        });
        setRows([]);
        return;
      }

      setRows((json?.products ?? []) as ProductRow[]);
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
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#F1F5F9] pb-2 pt-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            Manage products and prices synced to your connected Stripe account.
          </p>

          {!!err && (
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
              <div className="font-semibold text-rose-700">
                Error: {err.error}
                {err.reason ? ` (${err.reason})` : ""}
              </div>
              {err.hint && <div className="mt-1 text-rose-700/90">{err.hint}</div>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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

      {loading ? (
        <LoadingState />
      ) : totalCount === 0 ? (
        <EmptyState variant="none" />
      ) : visibleCount === 0 ? (
        <EmptyState variant="no_match" query={q} />
      ) : (
        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="relative overflow-auto rounded-xl" style={{ maxHeight: 40 + 44 * 16 }}>
            <table className="min-w-max w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100">
                <tr className="text-left">
                  <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                    Product
                  </th>
                  <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                    Status
                  </th>
                  <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                    Current Price
                  </th>
                  <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                    Created
                  </th>

                  <th
                    className={`${actionThClass} ${actionDividerThClass} sticky z-30 bg-slate-100`}
                    style={{ right: ACTION_COL_W * 2 }}
                  >
                    View
                  </th>
                  <th className={`${actionThClass} sticky z-30 bg-slate-100`} style={{ right: ACTION_COL_W * 1 }}>
                    Edit
                  </th>
                  <th className={`${actionThClass} sticky right-0 z-30 bg-slate-100`}>Archive</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((p) => {
                  const isArchived = !p.stripe_active || p.is_archived; // ✅ treat Stripe inactive as archived too
                  const priceLabel = fmtPriceForTable(p.current_price);

                  return (
                    <tr key={p.stripe_product_id} className="hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-5 py-2.5 align-top">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">
                            {p.display_name || p.stripe_product_id}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">
                            {p.stripe_description ?? "—"}
                          </div>
                        </div>
                      </td>

                      <td className="border-b border-slate-100 px-5 py-2.5 align-top">
                        {isArchived ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            Archived
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="border-b border-slate-100 px-5 py-2.5 align-top">
                        <div className="text-sm font-semibold text-slate-900">{priceLabel.primary}</div>
                        {priceLabel.secondary && (
                          <div className="mt-0.5 text-[11px] text-slate-500">{priceLabel.secondary}</div>
                        )}
                      </td>

                      <td className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-700">
                        {fmtUnix(p.stripe_created)}
                      </td>

                      <td
                        className={`${actionTdClass} ${actionDividerTdClass} sticky bg-white`}
                        style={{ right: ACTION_COL_W * 2 }}
                      >
                        <Link
                          href={`/billing/products/${encodeURIComponent(p.stripe_product_id)}`}
                          className="inline-flex p-1 !text-slate-600 hover:!text-slate-900 transition-colors"
                          title="View"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                      </td>

                      <td className={`${actionTdClass} sticky bg-white`} style={{ right: ACTION_COL_W * 1 }}>
                        <Link
                          href={`/billing/products/${encodeURIComponent(p.stripe_product_id)}/edit`}
                          className="inline-flex p-1 !text-indigo-600 hover:!text-indigo-700 transition-colors"
                          title="Edit"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </Link>
                      </td>

                      {/* ✅ CHANGE: Hide trash icon if archived (show "—" like Leads) */}
                      <td className={`${actionTdClass} sticky right-0 bg-white`}>
                        {isArchived ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/billing/products/${encodeURIComponent(p.stripe_product_id)}/delete`
                              )
                            }
                            className="inline-flex p-1 !text-rose-500 hover:!text-rose-600 transition-colors cursor-pointer"
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
