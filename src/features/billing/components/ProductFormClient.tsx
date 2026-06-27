"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiErrorMessage,
} from "@/features/billing/components/errorMessages";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLocale, useTranslations } from "next-intl";

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

type Mode = "create" | "edit";

type BillingType = "one_time" | "recurring";
type Interval = "day" | "week" | "month" | "year";

const CURRENCIES = [
  "aed",
  "afn",
  "all",
  "amd",
  "ang",
  "aoa",
  "ars",
  "aud",
  "awg",
  "azn",
  "bam",
  "bbd",
  "bdt",
  "bgn",
  "bhd",
  "bif",
  "bmd",
  "bnd",
  "bob",
  "brl",
  "bsd",
  "btn",
  "bwp",
  "byn",
  "bzd",
  "cad",
  "cdf",
  "chf",
  "clf",
  "clp",
  "cny",
  "cop",
  "crc",
  "cuc",
  "cup",
  "cve",
  "czk",
  "djf",
  "dkk",
  "dop",
  "dzd",
  "egp",
  "ern",
  "etb",
  "eur",
  "fjd",
  "fkp",
  "gbp",
  "gel",
  "ghs",
  "gip",
  "gmd",
  "gnf",
  "gtq",
  "gyd",
  "hkd",
  "hnl",
  "hrk",
  "htg",
  "huf",
  "idr",
  "ils",
  "inr",
  "iqd",
  "irr",
  "isk",
  "jmd",
  "jod",
  "jpy",
  "kes",
  "kgs",
  "khr",
  "kmf",
  "kpw",
  "krw",
  "kwd",
  "kyd",
  "kzt",
  "lak",
  "lbp",
  "lkr",
  "lrd",
  "lsl",
  "lyd",
  "mad",
  "mdl",
  "mga",
  "mkd",
  "mmk",
  "mnt",
  "mop",
  "mru",
  "mur",
  "mvr",
  "mwk",
  "mxn",
  "myr",
  "mzn",
  "nad",
  "ngn",
  "nio",
  "nok",
  "npr",
  "nzd",
  "omr",
  "pab",
  "pen",
  "pgk",
  "php",
  "pkr",
  "pln",
  "pyg",
  "qar",
  "ron",
  "rsd",
  "rub",
  "rwf",
  "sar",
  "sbd",
  "scr",
  "sdg",
  "sek",
  "sgd",
  "shp",
  "sll",
  "sos",
  "srd",
  "ssp",
  "stn",
  "svc",
  "syp",
  "szl",
  "thb",
  "tjs",
  "tmt",
  "tnd",
  "top",
  "try",
  "ttd",
  "twd",
  "tzs",
  "uah",
  "ugx",
  "usd",
  "uyu",
  "uzs",
  "ves",
  "vnd",
  "vuv",
  "wst",
  "xaf",
  "xcd",
  "xof",
  "xpf",
  "yer",
  "zar",
  "zmw",
  "zwl",
] as const;

type CurrencyCode = (typeof CURRENCIES)[number];

function toCents(amountStr: string): number | null {
  const raw = amountStr.trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const n = Number(normalized);

  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export default function ProductFormClient({
  mode,
  productId,
}: {
  mode: Mode;
  productId?: string;
}) {
  const t = useTranslations("BillingProductFormPage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const safeProductId = useMemo(() => (productId ?? "").trim(), [productId]);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";

  const inputBase = [
    "mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400/40"
      : "border-slate-200 bg-white text-slate-700 focus:ring-indigo-500",
  ].join(" ");

  const clsBtn =
    "inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  const clsBtnSecondary = [
    clsBtn,
    isDark
      ? "border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");

  const clsBtnPrimary = `${clsBtn} bg-indigo-600 text-white hover:bg-indigo-700`;

  const selectedToggle = isDark
    ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200"
    : "border-indigo-600 bg-indigo-50 text-indigo-700";

  const unselectedToggle = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const priceCard = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-200 bg-slate-50";

  const labelCls = isDark
    ? "text-xs font-semibold text-slate-300"
    : "text-xs font-semibold text-slate-700";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [currency, setCurrency] = useState<CurrencyCode>("usd");
  const [amount, setAmount] = useState("");
  const [billingType, setBillingType] = useState<BillingType>("one_time");
  const [interval, setInterval] = useState<Interval>("month");
  const [intervalCount, setIntervalCount] = useState<number>(1);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit") return;

    if (!safeProductId) {
      setErr("missing_product_id");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const res = await billingAuthedFetch(
          `/api/billing/products/${encodeURIComponent(safeProductId)}`,
          locale,
          { cache: "no-store" },
        );

        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(res, `failed_${res.status}`),
          );
        }

        const json = await res.json().catch(() => null);
        const p = json?.product;

        if (!cancelled) {
          setName(String(p?.name ?? "").trim());
          setDescription(String(p?.description ?? "").trim());
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? "load_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, safeProductId, locale]);

  async function submit() {
    setErr(null);
    setSaving(true);

    try {
      if (!name.trim()) throw new Error(t("errors.nameRequired"));

      if (mode === "create") {
        const cents = toCents(amount);
        if (cents == null) throw new Error(t("errors.priceAmountRequired"));

        const cur = String(currency ?? "usd")
          .trim()
          .toLowerCase();
        if (!cur) throw new Error(t("errors.currencyRequired"));

        const recurring =
          billingType === "recurring"
            ? {
                interval,
                interval_count:
                  Number.isFinite(intervalCount) && intervalCount >= 1
                    ? Math.floor(intervalCount)
                    : 1,
              }
            : undefined;

        const res = await billingAuthedFetch(
          "/api/billing/products/create",
          locale,
          {
            method: "POST",
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
              active: true,
              price: {
                unit_amount: cents,
                currency: cur,
                ...(recurring ? { recurring } : {}),
              },
            }),
          },
        );

        if (!res.ok) {
          throw new Error(
            await readApiErrorMessage(res, `failed_${res.status}`),
          );
        }

        const json = await res.json().catch(() => null);

        const newId =
          json?.stripe_product_id ??
          json?.product?.id ??
          json?.productId ??
          json?.id;

        if (!newId || typeof newId !== "string") {
          throw new Error(t("errors.createResponseMissingProductId"));
        }

        router.push(`/billing/products/${encodeURIComponent(newId)}`);
        return;
      }

      if (!safeProductId) throw new Error(t("errors.missingProductId"));

      const res = await billingAuthedFetch(
        `/api/billing/products/${encodeURIComponent(safeProductId)}/update`,
        locale,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() === "" ? null : description.trim(),
          }),
        },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      router.push(`/billing/products/${encodeURIComponent(safeProductId)}`);
    } catch (e: any) {
      setErr(String(e?.message ?? "save_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold ${headText}`}>
          {mode === "create" ? t("page.createTitle") : t("page.editTitle")}
        </h1>
        <p className={`mt-1 text-sm ${mutedText}`}>
          {mode === "create"
            ? t("page.createDescription")
            : t("page.editDescription")}
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

      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        {loading ? (
          <p className={`text-sm ${mutedText}`}>{billing("states.loading")}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>{billing("fields.name")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputBase}
                placeholder={t("placeholders.name")}
                disabled={saving}
              />
            </div>

            <div>
              <label className={labelCls}>{billing("fields.description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className={inputBase}
                placeholder={t("placeholders.description")}
                disabled={saving}
              />
            </div>

            {mode === "create" && (
              <div className={`rounded-xl border p-4 ${priceCard}`}>
                <div className={`text-sm font-semibold ${headText}`}>
                  {t("price.title")}
                </div>
                <p className={`mt-0.5 text-xs ${mutedText2}`}>
                  {t("price.description")}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{billing("fields.amount")}</label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={inputBase}
                      placeholder={t("placeholders.amount")}
                      inputMode="decimal"
                      disabled={saving}
                    />
                    <p className={`mt-1 text-[11px] ${mutedText2}`}>
                      {t("help.amount")}
                    </p>
                  </div>

                  <div>
                    <label className={labelCls}>{billing("fields.currency")}</label>
                    <select
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value as CurrencyCode)
                      }
                      className={inputBase}
                      disabled={saving}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <p className={`mt-1 text-[11px] ${mutedText2}`}>
                      {t("help.currency")}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className={labelCls}>{t("fields.billingType")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setBillingType("one_time")}
                      className={[
                        "rounded-lg border px-3 py-2 text-xs font-semibold",
                        billingType === "one_time"
                          ? selectedToggle
                          : unselectedToggle,
                      ].join(" ")}
                      disabled={saving}
                    >
                      {billing("price.oneTime")}
                    </button>

                    <button
                      type="button"
                      onClick={() => setBillingType("recurring")}
                      className={[
                        "rounded-lg border px-3 py-2 text-xs font-semibold",
                        billingType === "recurring"
                          ? selectedToggle
                          : unselectedToggle,
                      ].join(" ")}
                      disabled={saving}
                    >
                      {billing("price.recurring")}
                    </button>
                  </div>
                </div>

                {billingType === "recurring" && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{t("fields.interval")}</label>
                      <select
                        value={interval}
                        onChange={(e) =>
                          setInterval(e.target.value as Interval)
                        }
                        className={inputBase}
                        disabled={saving}
                      >
                        <option value="day">{t("intervals.day")}</option>
                        <option value="week">{t("intervals.week")}</option>
                        <option value="month">{t("intervals.month")}</option>
                        <option value="year">{t("intervals.year")}</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>
                        {t("fields.intervalCount")}
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={intervalCount}
                        onChange={(e) =>
                          setIntervalCount(Number(e.target.value))
                        }
                        className={inputBase}
                        disabled={saving}
                      />
                      <p className={`mt-1 text-[11px] ${mutedText2}`}>
                        {t("help.intervalCount")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className={clsBtnSecondary}
                disabled={saving}
              >
                {common("actions.cancel")}
              </button>

              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className={clsBtnPrimary}
              >
                {saving
                  ? common("actions.saving")
                  : mode === "create"
                    ? t("actions.createProduct")
                    : t("actions.saveChanges")}
              </button>
            </div>

            {mode === "edit" && !safeProductId && (
              <div className={`text-xs ${mutedText2}`}>
                {t("help.missingRouteParam")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
