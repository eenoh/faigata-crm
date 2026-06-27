"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiError,
} from "@/features/billing/components/errorMessages";
import { ArrowPathIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  getInvoiceStatusLabel,
  getInvoiceStatusTone,
} from "@/i18n/domain-values";

type InvoiceRow = {
  id: string;
  number: string | null;
  status: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  created: number | null;
  due_date: number | null;
  total: number | null;
  currency: string | null;
};

type ApiError = {
  error?: string;
  reason?: string;
  hint?: string;
  details?: any;
  message?: string;
};

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (error || !token) {
    throw new Error(BILLING_SESSION_EXPIRED_MESSAGE);
  }

  return token;
}

async function billingAuthedFetch(
  input: RequestInfo | URL,
  locale: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  const method = (init.method ?? "GET").toUpperCase();
  const headers = withLocaleHeader(init.headers, locale);

  headers.set("Authorization", `Bearer ${token}`);

  if (method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}

async function readApiError(res: Response): Promise<ApiError> {
  return readBillingApiError(
    res,
    "We couldn't load your invoices right now. Please try again.",
  );
}

function fmtUnixDate(unix: number | null, locale: string, emptyLabel: string) {
  return unix
    ? new Date(unix * 1000).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : emptyLabel;
}

function fmtMoney(
  currency: string | null,
  cents: number | null,
  emptyLabel: string,
) {
  if (!currency || cents == null) return emptyLabel;
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
  tDomain,
}: {
  status: string | null;
  isDark: boolean;
  tDomain: (key: string) => string;
}) {
  const label = getInvoiceStatusLabel(tDomain, status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getInvoiceStatusTone(status, isDark)}`}
    >
      {label}
    </span>
  );
}

function LoadingState({
  isDark,
  t,
}: {
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"BillingInvoicesPage">>;
}) {
  const pulse = isDark ? "bg-slate-800" : "bg-slate-200";

  return (
    <div className="p-5">
      <div className="space-y-3">
        <div className={`h-4 w-1/3 animate-pulse rounded ${pulse}`} />
        <div className={`h-4 w-2/3 animate-pulse rounded ${pulse}`} />
        <div className={`h-4 w-1/2 animate-pulse rounded ${pulse}`} />
      </div>
      <p className="sr-only">{t("table.loading")}</p>
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
  const t = useTranslations("BillingInvoicesPage.empty");

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
          {t("noMatch.title", { query: query ?? "" })}
        </p>
        <p className="mt-1">{t("noMatch.description")}</p>
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
      <p>{t("none.title")}</p>
      <p className="mt-1">
        {t.rich("none.description", {
          newInvoice: (chunks) => (
            <span
              className={isDark ? "font-semibold text-white" : "font-semibold"}
            >
              {chunks}
            </span>
          ),
          refresh: (chunks) => (
            <span
              className={isDark ? "font-semibold text-white" : "font-semibold"}
            >
              {chunks}
            </span>
          ),
        })}
      </p>
    </div>
  );
}

export default function BillingInvoicesClient() {
  const t = useTranslations("BillingInvoicesPage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();
  const emptyLabel = tDomain("fallbacks.empty");

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50/50";
  const theadBg = isDark
    ? "bg-slate-900/40 text-slate-400"
    : "bg-slate-50 text-slate-500";

  const refreshBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const totalCount = rows.length;
  const visibleCount = rows.length;

  async function load(refresh = false) {
    setLoading(true);
    setErr(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (refresh) params.set("refresh", "1");

      const url = `/api/billing/invoices${
        params.toString() ? `?${params}` : ""
      }`;

      const res = await billingAuthedFetch(url, locale, { cache: "no-store" });

      if (!res.ok) {
        setErr(await readApiError(res));
        setRows([]);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as {
        invoices?: InvoiceRow[];
      };

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
  }, [q, locale]);

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${headText}`}>
              {t("page.title")}
            </h1>
            <p className={`mt-1 max-w-2xl text-sm ${mutedText}`}>
              {t("page.description")}
            </p>

            {q ? (
              <p className={`mt-2 text-xs ${mutedText2}`}>
                {t.rich("page.filterApplied", {
                  query: q,
                  strong: (chunks) => (
                    <span
                      className={
                        isDark
                          ? "font-semibold text-slate-200"
                          : "font-semibold text-slate-700"
                      }
                    >
                      {chunks}
                    </span>
                  ),
                })}
              </p>
            ) : (
              <p className={`mt-2 text-xs ${mutedText2}`}>
                {t("page.noFilter")}
              </p>
            )}

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
                  {billing("errors.prefix")}: {err.error}
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
              {common("actions.refresh")}
            </button>

            <Link
              href="/billing/invoices/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700"
            >
              <span className="text-sm leading-none">+</span>
              {t("actions.newInvoice")}
            </Link>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div className={`border-b px-5 py-3 ${border}`}>
          <h2 className={`text-sm font-semibold ${headText}`}>
            {t("table.title")}
          </h2>
          <p className={`mt-0.5 text-xs ${mutedText2}`}>
            {loading
              ? t("table.loading")
              : q
                ? t("table.filteredCount", { count: visibleCount })
                : t("table.totalCount", { count: totalCount })}
          </p>
        </div>

        {loading ? (
          <LoadingState isDark={isDark} t={t} />
        ) : totalCount === 0 && !q ? (
          <div className="p-5">
            <EmptyState variant="none" isDark={isDark} />
          </div>
        ) : totalCount === 0 && !!q ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} isDark={isDark} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={theadBg}>
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.invoice")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.customer")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.status")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.total")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.created")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.due")}
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold">
                    {t("table.columns.view")}
                  </th>
                </tr>
              </thead>

              <tbody className={`divide-y ${divider}`}>
                {rows.map((inv) => {
                  const customerLabel =
                    inv.customer_name?.trim() ||
                    inv.customer_email?.trim() ||
                    inv.customer_id ||
                    emptyLabel;

                  return (
                    <tr
                      key={inv.id}
                      className={[
                        rowHover,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${headText}`}>
                            {inv.number
                              ? t("invoice.number", { number: inv.number })
                              : inv.id}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-[11px] ${mutedText2}`}
                          >
                            {t("invoice.stripeId")}{" "}
                            <span className="font-mono">{inv.id}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 align-top">
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${headText}`}>
                            {customerLabel}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-[11px] ${mutedText2}`}
                          >
                            {inv.customer_email ?? emptyLabel}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 align-top">
                        <StatusPill
                          status={inv.status}
                          isDark={isDark}
                          tDomain={tDomain}
                        />
                      </td>

                      <td
                        className={`px-5 py-4 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        <span className={`font-semibold ${headText}`}>
                          {fmtMoney(inv.currency, inv.total, emptyLabel)}
                        </span>
                      </td>

                      <td
                        className={`px-5 py-4 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {fmtUnixDate(inv.created, locale, emptyLabel)}
                      </td>

                      <td
                        className={`px-5 py-4 align-top ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {fmtUnixDate(inv.due_date, locale, emptyLabel)}
                      </td>

                      <td className="px-5 py-4 text-right align-top">
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
                              ? "text-slate-400 hover:text-slate-200"
                              : "text-slate-600 hover:text-slate-900",
                          ].join(" ")}
                          title={common("actions.view")}
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
        )}
      </div>
    </div>
  );
}
