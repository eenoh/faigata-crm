  // src/modules/billing/components/BillingInvoicesClient.tsx
  "use client";

  import { useEffect, useMemo, useState } from "react";
  import Link from "next/link";
  import { useSearchParams, useRouter } from "next/navigation";
  import { supabase } from "@/lib/supabaseClient";
  import {
    ArrowPathIcon,
    EyeIcon,
    PlusCircleIcon,
  } from "@heroicons/react/24/outline";

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

  async function authedFetch(input: RequestInfo, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("no_session");
    return fetch(input, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }

  function fmtUnixDate(unix: number | null) {
    if (!unix) return "—";
    return new Date(unix * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  function fmtMoney(currency: string | null, cents: number | null) {
    if (!currency || cents == null) return "—";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  }

  function StatusPill({ status }: { status: string | null }) {
    const s = String(status ?? "").toLowerCase();

    const cls =
      s === "paid"
        ? "bg-emerald-50 text-emerald-700"
        : s === "open"
        ? "bg-indigo-50 text-indigo-700"
        : s === "draft"
        ? "bg-slate-100 text-slate-600"
        : s === "void"
        ? "bg-rose-50 text-rose-700"
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
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
        {label}
      </span>
    );
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
              <div className="grid grid-cols-5 gap-4 items-center">
                <div className="h-4 w-48 rounded bg-slate-200/70 animate-pulse" />
                <div className="h-4 w-24 rounded bg-slate-200/70 animate-pulse" />
                <div className="h-4 w-28 rounded bg-slate-200/70 animate-pulse" />
                <div className="h-4 w-24 rounded bg-slate-200/70 animate-pulse" />
                <div className="ml-auto h-6 w-16 rounded bg-slate-200/70 animate-pulse" />
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
          <p className="font-semibold text-slate-700">No invoices match “{query}”.</p>
          <p className="mt-1">Try a customer name, email, invoice number, or Stripe invoice id.</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        <p>No invoices yet.</p>
        <p className="mt-1">
          When invoices are created in Stripe, they’ll appear here automatically. Use{" "}
          <span className="font-semibold">New Invoice</span> to create one now, or{" "}
          <span className="font-semibold">Refresh</span> to sync the latest data.
        </p>
      </div>
    );
  }

  export default function BillingInvoicesClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const q = (searchParams.get("q") ?? "").trim();

    const [rows, setRows] = useState<InvoiceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<ApiError | null>(null);

    const ACTION_COL_W = 64;
    const actionThClass =
      "border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 text-center w-16 whitespace-nowrap";
    const actionTdClass = "border-b border-slate-100 px-2 py-2 align-top text-center w-16";
    const actionDividerThClass = "border-l-2 border-slate-200";
    const actionDividerTdClass = "border-l-2 border-slate-200";

    const totalCount = rows.length;
    const visibleCount = totalCount; // server filters by q

    async function load(refresh = false) {
      setLoading(true);
      setErr(null);

      try {
        const url = `/api/billing/invoices${q ? `?q=${encodeURIComponent(q)}` : ""}${
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

        setRows((json?.invoices ?? []) as InvoiceRow[]);
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
            <h1 className="text-2xl font-semibold text-slate-900">Invoices</h1>
            <p className="text-sm text-slate-500">
              Create, review, and send invoices synced with your connected Stripe account.
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
              href="/billing/invoices/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700"
            >
              <span className="text-sm leading-none">+</span>
              New Invoice
            </Link>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : totalCount === 0 && !q ? (
          <EmptyState variant="none" />
        ) : visibleCount === 0 && !!q ? (
          <EmptyState variant="no_match" query={q} />
        ) : (
          <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="relative overflow-auto rounded-xl" style={{ maxHeight: 40 + 44 * 16 }}>
              <table className="min-w-max w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-slate-100">
                  <tr className="text-left">
                    <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      Invoice
                    </th>
                    <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      Customer
                    </th>
                    <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      Status
                    </th>
                    <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      Total
                    </th>
                    <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      Created
                    </th>
                    <th className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      Due
                    </th>

                    <th
                      className={`${actionThClass} ${actionDividerThClass} sticky z-30 bg-slate-100`}
                      style={{ right: ACTION_COL_W * 0 }}
                    >
                      View
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((inv) => {
                    const customerLabel =
                      inv.customer_name?.trim() ||
                      inv.customer_email?.trim() ||
                      inv.customer_id ||
                      "—";

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="border-b border-slate-100 px-5 py-2.5 align-top">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">
                              {inv.number ? `#${inv.number}` : inv.id}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              Stripe: <span className="font-mono">{inv.id}</span>
                            </div>
                          </div>
                        </td>

                        <td className="border-b border-slate-100 px-5 py-2.5 align-top">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{customerLabel}</div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              {inv.customer_email ?? "—"}
                            </div>
                          </div>
                        </td>

                        <td className="border-b border-slate-100 px-5 py-2.5 align-top">
                          <StatusPill status={inv.status} />
                        </td>

                        <td className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-700">
                          <span className="font-semibold text-slate-900">
                            {fmtMoney(inv.currency, inv.total)}
                          </span>
                        </td>

                        <td className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-700">
                          {fmtUnixDate(inv.created)}
                        </td>

                        <td className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-700">
                          {fmtUnixDate(inv.due_date)}
                        </td>

                        <td
                          className={`${actionTdClass} ${actionDividerTdClass} sticky right-0 bg-white`}
                          style={{ right: ACTION_COL_W * 0 }}
                        >
                          <button
                            type="button"
                            onClick={() => router.push(`/billing/invoices/${encodeURIComponent(inv.id)}`)}
                            className="inline-flex p-1 !text-slate-600 hover:!text-slate-900 transition-colors cursor-pointer"
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
