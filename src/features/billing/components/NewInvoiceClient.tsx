"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiErrorMessage,
} from "@/features/billing/components/errorMessages";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLocale, useTranslations } from "next-intl";

type CustomerOption = { id: string; name: string | null; email: string | null };

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

export default function NewInvoiceClient() {
  const t = useTranslations("BillingNewInvoicePage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const locale = useLocale();

  const router = useRouter();
  const presetCustomer = (useSearchParams().get("customer") ?? "").trim();

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

  const inputBase = [
    "mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400/40"
      : "border-slate-200 bg-white text-slate-700 focus:ring-indigo-500",
  ].join(" ");

  const btnBase =
    "inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  const btnSecondary = [
    btnBase,
    "border",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");

  const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700`;

  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState(presetCustomer);

  const [collectionMethod, setCollectionMethod] = useState<
    "send_invoice" | "charge_automatically"
  >("send_invoice");
  const [daysUntilDue, setDaysUntilDue] = useState("7");
  const [memo, setMemo] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => !!customerId && !saving,
    [customerId, saving],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingCustomers(true);
      setErr(null);

      try {
        const res = await billingAuthedFetch(
          "/api/billing/customers?limit=50",
          locale,
          { cache: "no-store" },
        );

        if (!res.ok) {
          const message = await readApiErrorMessage(
            res,
            `failed_${res.status}`,
          );

          if (!cancelled) {
            setErr(message);
            setCustomers([]);
          }
          return;
        }

        const json: any = await res.json().catch(() => ({}));
        const rows = (json.customers ?? []) as any[];

        if (!cancelled) {
          setCustomers(
            rows.map((c) => ({
              id: String(c.id ?? c.stripe_customer_id ?? ""),
              name: c.name ?? null,
              email: c.email ?? null,
            })),
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(String(e?.message ?? "customers_load_failed"));
          setCustomers([]);
        }
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  async function createInvoice() {
    setErr(null);
    setSaving(true);

    try {
      const payload: any = {
        customerId,
        collection_method: collectionMethod,
        memo: memo.trim() || undefined,
      };

      if (collectionMethod === "send_invoice") {
        const n = Number(daysUntilDue);
        payload.days_until_due = Number.isFinite(n) ? Math.max(0, n) : 7;
      }

      const res = await billingAuthedFetch(
        "/api/billing/invoices/create",
        locale,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      const json: any = await res.json().catch(() => ({}));
      const invoiceId = String(json?.invoice?.id ?? "");

      if (!invoiceId) throw new Error("missing_invoice_id");

      router.push(`/billing/invoices/${encodeURIComponent(invoiceId)}`);
    } catch (e: any) {
      setErr(String(e?.message ?? "create_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold ${headText}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${mutedText}`}>{t("page.description")}</p>

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

      <div
        className={`space-y-4 rounded-2xl border px-6 py-5 shadow-sm ${card}`}
      >
        <div>
          <label
            className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
          >
            {billing("fields.customer")}
          </label>

          <div className="mt-1 flex items-center gap-2">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={[inputBase, "cursor-pointer"].join(" ")}
              disabled={loadingCustomers || saving}
            >
              <option value="">
                {loadingCustomers
                  ? t("states.loadingCustomers")
                  : t("fields.selectCustomer")}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.name || c.email || c.id).slice(0, 80)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => router.push("/billing/customers")}
              className={btnSecondary}
              disabled={saving}
              title={t("actions.manageCustomersTitle")}
            >
              {t("actions.manage")}
            </button>
          </div>

          <p className={`mt-1 text-[11px] ${mutedText2}`}>
            {t("help.customer")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
            >
              {t("fields.collectionMethod")}
            </label>
            <select
              value={collectionMethod}
              onChange={(e) =>
                setCollectionMethod(
                  e.target.value as "send_invoice" | "charge_automatically",
                )
              }
              className={[inputBase, "cursor-pointer"].join(" ")}
              disabled={saving}
            >
              <option value="send_invoice">
                {t("collectionMethod.sendInvoice")}
              </option>
              <option value="charge_automatically">
                {t("collectionMethod.chargeAutomatically")}
              </option>
            </select>
            <p className={`mt-1 text-[11px] ${mutedText2}`}>
              {t("help.collectionMethod")}
            </p>
          </div>

          <div>
            <label
              className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
            >
              {t("fields.daysUntilDue")}
            </label>
            <input
              value={daysUntilDue}
              onChange={(e) => setDaysUntilDue(e.target.value)}
              className={inputBase}
              inputMode="numeric"
              disabled={saving || collectionMethod !== "send_invoice"}
            />
            <p className={`mt-1 text-[11px] ${mutedText2}`}>
              {t("help.daysUntilDue")}
            </p>
          </div>
        </div>

        <div>
          <label
            className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
          >
            {t("fields.memo")}
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className={inputBase}
            placeholder={t("placeholders.memo")}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className={btnSecondary}
            disabled={saving}
          >
            {common("actions.cancel")}
          </button>

          <button
            type="button"
            onClick={createInvoice}
            disabled={!canSubmit}
            className={btnPrimary}
          >
            {saving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
            {saving ? billing("actions.creating") : t("actions.createInvoice")}
          </button>
        </div>

        {!customerId && (
          <p className={`text-[11px] ${mutedText2}`}>
            {t("help.submitDisabled")}
          </p>
        )}
      </div>
    </div>
  );
}
