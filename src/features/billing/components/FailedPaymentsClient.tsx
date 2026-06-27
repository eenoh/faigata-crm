"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiError,
} from "@/features/billing/components/errorMessages";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  getPaymentStatusLabel,
  getPaymentStatusTone,
} from "@/i18n/domain-values";

type PaymentRow = {
  stripe_payment_intent_id: string;
  customer_email: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
};

type ApiError = {
  error?: string;
  reason?: string;
  hint?: string;
  details?: any;
  message?: string;
};

const formatMoney = (amount: number, currency: string, emptyLabel: string) => {
  if (!currency) return emptyLabel;

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
    "We couldn't load failed payments right now. Please try again.",
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
  const t = useTranslations("BillingFailedPaymentsPage.empty");

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
      <p className="mt-1">{t("none.description")}</p>
    </div>
  );
}

export default function FailedPaymentsClient() {
  const t = useTranslations("BillingFailedPaymentsPage");
  const billing = useTranslations("BillingCommon");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
  const q = (useSearchParams().get("q") ?? "").trim();
  const emptyLabel = tDomain("fallbacks.empty");
  const unknownLabel = tDomain("fallbacks.unknown");

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
  const subHeadBorder = isDark ? "border-slate-800" : "border-slate-100";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50/50";

  const backBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  async function load() {
    setErr(null);

    try {
      const params = new URLSearchParams({ status: "requires_payment_method" });
      if (q) params.set("q", q);

      const res = await billingAuthedFetch(
        `/api/billing/payments/list?${params.toString()}`,
        locale,
        { cache: "no-store" },
      );

      if (!res.ok) {
        setErr(await readApiError(res));
        setItems([]);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as {
        items?: PaymentRow[];
      };

      setItems((json.items ?? []) as PaymentRow[]);
    } catch (e: any) {
      setErr({ error: e?.message ?? "load_failed" });
      setItems([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locale]);

  const totalCount = items.length;
  const visibleCount = totalCount;

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-center justify-between gap-4">
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

          <Link
            href="/billing/payments"
            className={[
              "rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm",
              backBtn,
            ].join(" ")}
          >
            {t("actions.backToAll")}
          </Link>
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
          <div className={`p-6 text-sm ${mutedText}`}>{t("table.loading")}</div>
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
                href={`/billing/payments/${encodeURIComponent(
                  p.stripe_payment_intent_id,
                )}`}
                className={[
                  "flex items-center justify-between gap-4 px-5 py-4",
                  rowHover,
                  isDark ? "bg-slate-950" : "bg-white",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${headText}`}>
                      {p.customer_email ?? unknownLabel}
                    </span>

                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        getPaymentStatusTone(p.status, isDark),
                      ].join(" ")}
                    >
                      {getPaymentStatusLabel(tDomain, p.status)}
                    </span>
                  </div>

                  <p className={`mt-1 truncate text-xs ${mutedText}`}>
                    {p.description ?? p.stripe_payment_intent_id}
                    {" • "}
                    {formatMoney(p.amount, p.currency, emptyLabel)}
                  </p>
                </div>

                <div
                  className={[
                    "text-xs font-semibold",
                    isDark ? "text-indigo-300" : "text-indigo-600",
                  ].join(" ")}
                >
                  {t("actions.open")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
