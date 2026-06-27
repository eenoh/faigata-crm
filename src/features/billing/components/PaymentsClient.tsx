"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiError,
} from "@/features/billing/components/errorMessages";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLocale, useTranslations } from "next-intl";
import {
  getPaymentStatusLabel,
  getPaymentStatusTone,
} from "@/i18n/domain-values";

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
  details?: unknown;
  hint?: string;
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
    "We couldn't load your payments right now. Please try again.",
  );
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

function EmptyState({
  variant,
  query,
  isDark,
  t,
}: {
  variant: "none" | "no_match";
  query?: string;
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"BillingPaymentsPage">>;
}) {
  if (variant === "no_match") {
    return (
      <div
        className={`rounded-xl border p-6 text-sm ${
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-400"
            : "border-slate-200 bg-white text-slate-500"
        }`}
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
      className={`rounded-xl border border-dashed p-6 text-sm ${
        isDark
          ? "border-slate-700 bg-slate-950 text-slate-400"
          : "border-slate-300 bg-slate-50 text-slate-500"
      }`}
    >
      <p>{t("empty.none.title")}</p>
      <p className="mt-1">{t("empty.none.description")}</p>
    </div>
  );
}

function StatusPill({
  status,
  isDark,
  tDomain,
}: {
  status: string;
  isDark: boolean;
  tDomain: (key: string) => string;
}) {
  return (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusTone(
        status,
        isDark,
      )}`}
    >
      {getPaymentStatusLabel(tDomain, status)}
    </span>
  );
}

export default function PaymentsClient() {
  const t = useTranslations("BillingPaymentsPage");
  const billing = useTranslations("BillingCommon");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
  const unknownLabel = tDomain("fallbacks.unknown");

  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();

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
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50";

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const totalCount = items.length;

  async function load(_refresh = false) {
    setLoading(true);
    setErr(null);

    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);

      const url = `/api/billing/payments/list${
        params.toString() ? `?${params}` : ""
      }`;

      const res = await billingAuthedFetch(url, locale, { cache: "no-store" });

      if (!res.ok) {
        setErr(await readApiError(res));
        setItems([]);
        return;
      }

      const json: any = await res.json().catch(() => ({}));
      setItems((json.items ?? []) as PaymentRow[]);
    } catch (e: any) {
      setErr({ error: e?.message ?? "load_failed" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, locale]);

  const visibleCount = totalCount;

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <h1 className={`text-2xl font-semibold ${headText}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${mutedText}`}>{t("page.description")}</p>

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
          <p className={`mt-2 text-xs ${mutedText2}`}>{t("page.noFilter")}</p>
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

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div className={`border-b px-5 py-3 ${border}`}>
          <h2 className={`text-sm font-semibold ${headText}`}>
            {t("table.title")}
          </h2>
          <p className={`text-xs ${mutedText2}`}>
            {loading
              ? t("table.loading")
              : q
                ? t("table.filteredCount", { count: visibleCount })
                : t("table.totalCount", { count: totalCount })}
          </p>
        </div>

        {loading ? (
          <div className={`p-5 text-sm ${mutedText}`}>{t("table.loading")}</div>
        ) : totalCount === 0 && !q ? (
          <div className="p-5">
            <EmptyState variant="none" isDark={isDark} t={t} />
          </div>
        ) : visibleCount === 0 && !!q ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} isDark={isDark} t={t} />
          </div>
        ) : (
          <div className={`divide-y ${divider}`}>
            {items.map((p) => (
              <div
                key={p.stripe_payment_intent_id}
                className={`px-5 py-4 ${rowHover}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusPill
                        status={p.status}
                        isDark={isDark}
                        tDomain={tDomain}
                      />
                    </div>

                    <div className={`mt-2 text-sm font-semibold ${headText}`}>
                      {fmtMoney(p.currency, p.amount)}
                    </div>

                    <div className={`mt-1 text-xs ${mutedText}`}>
                      {p.customer_email ?? p.customer_name ?? unknownLabel}
                    </div>

                    {(p.description || p.stripe_charge_id) && (
                      <div className={`mt-1 text-xs ${mutedText2}`}>
                        {p.description ?? p.stripe_charge_id}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/billing/payments/${encodeURIComponent(
                          p.stripe_payment_intent_id,
                        )}`,
                      )
                    }
                    className={`text-xs font-semibold ${
                      isDark ? "text-indigo-300" : "text-indigo-600"
                    }`}
                  >
                    {t("actions.open")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
