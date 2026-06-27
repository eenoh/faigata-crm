"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiError,
} from "@/features/billing/components/errorMessages";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";

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
    "We couldn't load your products right now. Please try again.",
  );
}

function fmtUnix(unix: number | null, locale: string, emptyLabel: string) {
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
  unitAmount: number | null,
  emptyLabel: string,
) {
  if (!currency || unitAmount == null) return emptyLabel;
  const cur = currency.toUpperCase();

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(unitAmount / 100);
  } catch {
    return `${unitAmount / 100} ${cur}`;
  }
}

function pluralizeInterval(
  interval: "day" | "week" | "month" | "year",
  n: number,
) {
  return n === 1 ? interval : `${interval}s`;
}

function fmtPriceForTable(
  p: ProductRow["current_price"],
  emptyLabel: string,
  recurringLabel: string,
  recurringBillingLabel: string,
  oneTimeLabel: string,
) {
  if (!p) return { primary: emptyLabel, secondary: null as string | null };

  const amount = fmtMoney(p.currency, p.unit_amount, emptyLabel);
  const r = p.recurring;

  if (r?.interval) {
    const n = r.interval_count ?? 1;
    const unit = pluralizeInterval(r.interval, n);

    return {
      primary:
        n === 1 ? `${amount} / ${r.interval}` : `${amount} / ${n} ${unit}`,
      secondary: n === 1 ? recurringLabel : recurringBillingLabel,
    };
  }

  return { primary: amount, secondary: oneTimeLabel };
}

function LoadingState({
  isDark,
  t,
}: {
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"BillingProductsPage">>;
}) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const pulse = isDark ? "bg-slate-800" : "bg-slate-200/80";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
      <div className={`border-b px-5 py-3 ${border}`}>
        <div className={`h-4 w-40 animate-pulse rounded ${pulse}`} />
      </div>

      <div className={`divide-y ${divider}`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-5 py-4">
            <div className="space-y-3">
              <div className={`h-4 w-56 animate-pulse rounded ${pulse}`} />
              <div className={`h-3 w-80 animate-pulse rounded ${pulse}`} />
            </div>
          </div>
        ))}
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
  const t = useTranslations("BillingProductsPage.empty");

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
          newProduct: (chunks) => (
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

export default function BillingProductsClient() {
  const t = useTranslations("BillingProductsPage");
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

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

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
  const subHeadBorder = isDark ? "border-slate-800" : "border-slate-100";

  const refreshBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  async function load(refresh = false) {
    setLoading(true);
    setErr(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (refresh) params.set("refresh", "1");

      const url = `/api/billing/products${
        params.toString() ? `?${params}` : ""
      }`;

      const res = await billingAuthedFetch(url, locale, {
        cache: "no-store",
      });

      if (!res.ok) {
        setErr(await readApiError(res));
        setRows([]);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as {
        products?: ProductRow[];
      };

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
              href="/billing/products/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700"
            >
              <span className="text-sm leading-none">+</span>
              {t("actions.newProduct")}
            </Link>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div className={`border-b px-5 py-3 ${subHeadBorder}`}>
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
          <div className="p-5">
            <LoadingState isDark={isDark} t={t} />
          </div>
        ) : totalCount === 0 ? (
          <div className="p-5">
            <EmptyState variant="none" isDark={isDark} />
          </div>
        ) : visibleCount === 0 ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} isDark={isDark} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={theadBg}>
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.product")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.status")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.currentPrice")}
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    {t("table.columns.created")}
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold">
                    {t("table.columns.actions")}
                  </th>
                </tr>
              </thead>

              <tbody className={`divide-y ${divider}`}>
                {filtered.map((p) => {
                  const isArchived = !p.stripe_active || p.is_archived;
                  const priceLabel = fmtPriceForTable(
                    p.current_price,
                    emptyLabel,
                    billing("price.recurring"),
                    t("price.recurringBilling"),
                    billing("price.oneTime"),
                  );

                  return (
                    <tr
                      key={p.stripe_product_id}
                      className={[
                        rowHover,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-5 py-4">
                        <div className="min-w-0">
                          <p className={`truncate font-semibold ${headText}`}>
                            {p.display_name || p.stripe_product_id}
                          </p>
                          <p
                            className={`mt-0.5 truncate text-xs ${mutedText2}`}
                          >
                            {p.stripe_description ?? emptyLabel}
                          </p>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                            isArchived
                              ? isDark
                                ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
                                : "bg-slate-100 text-slate-600"
                              : isDark
                                ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                                : "bg-emerald-50 text-emerald-700",
                          ].join(" ")}
                        >
                          {isArchived
                            ? billing("status.archived")
                            : billing("status.active")}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <p className={`font-semibold ${headText}`}>
                          {priceLabel.primary}
                        </p>
                        {priceLabel.secondary && (
                          <p className={`mt-0.5 text-xs ${mutedText2}`}>
                            {priceLabel.secondary}
                          </p>
                        )}
                      </td>

                      <td
                        className={`px-5 py-4 ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {fmtUnix(p.stripe_created, locale, emptyLabel)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/billing/products/${encodeURIComponent(p.stripe_product_id)}`}
                            className={[
                              "inline-flex p-1 transition-colors",
                              isDark
                                ? "!text-slate-400 hover:!text-slate-200"
                                : "!text-slate-600 hover:!text-slate-900",
                            ].join(" ")}
                            title={common("actions.view")}
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>

                          <Link
                            href={`/billing/products/${encodeURIComponent(p.stripe_product_id)}/edit`}
                            className={[
                              "inline-flex p-1 transition-colors",
                              isDark
                                ? "!text-indigo-300 hover:!text-indigo-200"
                                : "!text-indigo-600 hover:!text-indigo-700",
                            ].join(" ")}
                            title={common("actions.edit")}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </Link>

                          {isArchived ? (
                            <span
                              className={`px-1 text-xs ${isDark ? "text-slate-600" : "text-slate-300"}`}
                            >
                              {emptyLabel}
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
                              title={common("actions.archive")}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
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
