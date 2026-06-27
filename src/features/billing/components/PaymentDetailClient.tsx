"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiErrorMessage,
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
  raw: any;
};

const money = (amount: number, currency: string, emptyLabel: string) => {
  if (!currency) return emptyLabel;

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

async function readApiErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  return readBillingApiErrorMessage(res, fallback);
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
  const label = getPaymentStatusLabel(tDomain, status);

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        getPaymentStatusTone(status, isDark),
      ].join(" ")}
    >
      {label}
    </span>
  );
}

export default function PaymentDetailClient({
  paymentIntentId,
}: {
  paymentIntentId: string;
}) {
  const t = useTranslations("BillingPaymentDetailPage");
  const billing = useTranslations("BillingCommon");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
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

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/payments/${encodeURIComponent(paymentIntentId)}`,
        locale,
        { cache: "no-store" },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      const json: any = await res.json().catch(() => ({}));
      setItem((json.item ?? null) as PaymentRow | null);
    } catch (e: any) {
      setItem(null);
      setErr(String(e?.message ?? "load_failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const res = await billingAuthedFetch(
          `/api/billing/payments/${encodeURIComponent(paymentIntentId)}`,
          locale,
          { cache: "no-store" },
        );

        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(res, `failed_${res.status}`),
          );
        }

        const json: any = await res.json().catch(() => ({}));

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
  }, [paymentIntentId, locale]);

  async function refundFull() {
    const pid = item?.stripe_payment_intent_id;
    if (!pid) return;

    setRefundLoading(true);
    setErr(null);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/payments/${encodeURIComponent(pid)}/refund`,
        locale,
        {
          method: "POST",
          body: "{}",
        },
      );

      if (!res.ok) {
        setErr(await readApiErrorMessage(res, `refund_failed_${res.status}`));
        return;
      }

      await load();
    } finally {
      setRefundLoading(false);
    }
  }

  const amountLabel = item
    ? money(
        item.amount_received || item.amount,
        item.currency,
        emptyLabel,
      )
    : emptyLabel;

  const customerLabel = item?.customer_email ?? item?.customer_name ?? unknownLabel;

  return (
    <div className="max-w-4xl space-y-6">
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className={`text-2xl font-semibold ${headText}`}>
              {t("page.title")}
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
                  {billing("errors.prefix")}: {err}
                </div>
              </div>
            )}
          </div>

          <Link href="/billing/payments" className={btnSecondary}>
            {t("actions.back")}
          </Link>
        </div>
      </div>

      <div className={`rounded-2xl border p-6 shadow-sm ${card}`}>
        {loading ? (
          <div className={`text-sm ${mutedText}`}>{billing("states.loading")}</div>
        ) : !item ? (
          <div className={`text-sm ${mutedText}`}>{t("states.notFound")}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-lg font-semibold ${headText}`}>
                {amountLabel}
              </span>
              <StatusPill
                status={item.status}
                isDark={isDark}
                tDomain={tDomain}
              />
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className={`text-xs font-semibold ${mutedText2}`}>
                  {billing("fields.customer")}
                </div>
                <div className={headText}>{customerLabel}</div>
              </div>

              <div>
                <div className={`text-xs font-semibold ${mutedText2}`}>
                  {billing("fields.chargeId")}
                </div>
                <div className={headText}>
                  {item.stripe_charge_id ?? emptyLabel}
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className={`text-xs font-semibold ${mutedText2}`}>
                  {billing("fields.description")}
                </div>
                <div className={headText}>
                  {item.description ?? emptyLabel}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                disabled={refundLoading || item.status !== "succeeded"}
                onClick={refundFull}
                className={btnDanger}
              >
                {refundLoading
                  ? t("actions.refunding")
                  : t("actions.refundPayment")}
              </button>

              <div className={`text-xs ${mutedText}`}>{t("help.refund")}</div>
            </div>
          </div>
        )}
      </div>

      {item?.raw && (
        <details className={`rounded-2xl border p-5 shadow-sm ${card}`}>
          <summary
            className={[
              "cursor-pointer text-sm font-semibold",
              isDark ? "text-slate-200" : "text-slate-800",
            ].join(" ")}
          >
            {t("raw.title")}
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
