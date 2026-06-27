"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiErrorMessage,
} from "@/features/billing/components/errorMessages";
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLocale, useTranslations } from "next-intl";
import {
  getInvoiceStatusLabel,
  getInvoiceStatusTone,
} from "@/i18n/domain-values";

type StripeInvoice = {
  id: string;
  number: string | null;
  status: string | null;
  currency: string | null;
  customer:
    | string
    | { id: string; email?: string | null; name?: string | null }
    | null;
  customer_email?: string | null;
  customer_name?: string | null;
  created: number | null;
  due_date: number | null;
  total: number | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
};

type StripeInvoiceItem = {
  id: string;
  description: string | null;
  amount: number | null;
  currency: string | null;
  quantity: number | null;
  price?: {
    id: string;
    unit_amount?: number | null;
    currency?: string | null;
  } | null;
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

const fmtUnix = (unix: number | null, locale: string, emptyLabel: string) =>
  unix ? new Date(unix * 1000).toLocaleString(locale) : emptyLabel;

function currencyDecimals(currency: string) {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).formatToParts(1);
    return (parts.find((p) => p.type === "fraction")?.value ?? "").length;
  } catch {
    return 2;
  }
}

function fmtMoney(
  currency: string | null,
  amountSmallest: number | null,
  emptyLabel: string,
) {
  if (!currency || amountSmallest == null) return emptyLabel;
  const cur = currency.toUpperCase();
  const dec = currencyDecimals(cur);
  const value = amountSmallest / 10 ** dec;

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(value);
  } catch {
    return `${value.toFixed(dec)} ${cur}`;
  }
}

/** Build dropdown list: "EUR — Euro", etc. */
const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "aed", name: "UAE Dirham" },
  { code: "afn", name: "Afghan Afghani" },
  { code: "all", name: "Albanian Lek" },
  { code: "amd", name: "Armenian Dram" },
  { code: "ang", name: "Netherlands Antillean Guilder" },
  { code: "aoa", name: "Angolan Kwanza" },
  { code: "ars", name: "Argentine Peso" },
  { code: "aud", name: "Australian Dollar" },
  { code: "awg", name: "Aruban Florin" },
  { code: "azn", name: "Azerbaijani Manat" },
  { code: "bam", name: "Bosnia-Herzegovina Convertible Mark" },
  { code: "bbd", name: "Barbadian Dollar" },
  { code: "bdt", name: "Bangladeshi Taka" },
  { code: "bgn", name: "Bulgarian Lev" },
  { code: "bhd", name: "Bahraini Dinar" },
  { code: "bif", name: "Burundian Franc" },
  { code: "bmd", name: "Bermudan Dollar" },
  { code: "bnd", name: "Brunei Dollar" },
  { code: "bob", name: "Bolivian Boliviano" },
  { code: "brl", name: "Brazilian Real" },
  { code: "bsd", name: "Bahamian Dollar" },
  { code: "bwp", name: "Botswanan Pula" },
  { code: "byn", name: "Belarusian Ruble" },
  { code: "bzd", name: "Belize Dollar" },
  { code: "cad", name: "Canadian Dollar" },
  { code: "cdf", name: "Congolese Franc" },
  { code: "chf", name: "Swiss Franc" },
  { code: "clp", name: "Chilean Peso" },
  { code: "cny", name: "Chinese Yuan" },
  { code: "cop", name: "Colombian Peso" },
  { code: "crc", name: "Costa Rican Colón" },
  { code: "cve", name: "Cape Verdean Escudo" },
  { code: "czk", name: "Czech Koruna" },
  { code: "djf", name: "Djiboutian Franc" },
  { code: "dkk", name: "Danish Krone" },
  { code: "dop", name: "Dominican Peso" },
  { code: "dzd", name: "Algerian Dinar" },
  { code: "egp", name: "Egyptian Pound" },
  { code: "etb", name: "Ethiopian Birr" },
  { code: "eur", name: "Euro" },
  { code: "fjd", name: "Fijian Dollar" },
  { code: "fkp", name: "Falkland Islands Pound" },
  { code: "gbp", name: "British Pound" },
  { code: "gel", name: "Georgian Lari" },
  { code: "ghs", name: "Ghanaian Cedi" },
  { code: "gip", name: "Gibraltar Pound" },
  { code: "gmd", name: "Gambian Dalasi" },
  { code: "gnf", name: "Guinean Franc" },
  { code: "gtq", name: "Guatemalan Quetzal" },
  { code: "gyd", name: "Guyanaese Dollar" },
  { code: "hkd", name: "Hong Kong Dollar" },
  { code: "hnl", name: "Honduran Lempira" },
  { code: "hrk", name: "Croatian Kuna" },
  { code: "htg", name: "Haitian Gourde" },
  { code: "huf", name: "Hungarian Forint" },
  { code: "idr", name: "Indonesian Rupiah" },
  { code: "ils", name: "Israeli New Shekel" },
  { code: "inr", name: "Indian Rupee" },
  { code: "isk", name: "Icelandic Króna" },
  { code: "jmd", name: "Jamaican Dollar" },
  { code: "jpy", name: "Japanese Yen" },
  { code: "kes", name: "Kenyan Shilling" },
  { code: "kgs", name: "Kyrgystani Som" },
  { code: "khr", name: "Cambodian Riel" },
  { code: "kmf", name: "Comorian Franc" },
  { code: "krw", name: "South Korean Won" },
  { code: "kwd", name: "Kuwaiti Dinar" },
  { code: "kyd", name: "Cayman Islands Dollar" },
  { code: "kzt", name: "Kazakhstani Tenge" },
  { code: "lak", name: "Laotian Kip" },
  { code: "lbp", name: "Lebanese Pound" },
  { code: "lkr", name: "Sri Lankan Rupee" },
  { code: "lrd", name: "Liberian Dollar" },
  { code: "lsl", name: "Lesotho Loti" },
  { code: "mad", name: "Moroccan Dirham" },
  { code: "mdl", name: "Moldovan Leu" },
  { code: "mga", name: "Malagasy Ariary" },
  { code: "mkd", name: "Macedonian Denar" },
  { code: "mmk", name: "Myanmar Kyat" },
  { code: "mnt", name: "Mongolian Tugrik" },
  { code: "mop", name: "Macanese Pataca" },
  { code: "mur", name: "Mauritian Rupee" },
  { code: "mvr", name: "Maldivian Rufiyaa" },
  { code: "mwk", name: "Malawian Kwacha" },
  { code: "mxn", name: "Mexican Peso" },
  { code: "myr", name: "Malaysian Ringgit" },
  { code: "mzn", name: "Mozambican Metical" },
  { code: "nad", name: "Namibian Dollar" },
  { code: "ngn", name: "Nigerian Naira" },
  { code: "nio", name: "Nicaraguan Córdoba" },
  { code: "nok", name: "Norwegian Krone" },
  { code: "npr", name: "Nepalese Rupee" },
  { code: "nzd", name: "New Zealand Dollar" },
  { code: "omr", name: "Omani Rial" },
  { code: "pab", name: "Panamanian Balboa" },
  { code: "pen", name: "Peruvian Sol" },
  { code: "pgk", name: "Papua New Guinean Kina" },
  { code: "php", name: "Philippine Peso" },
  { code: "pkr", name: "Pakistani Rupee" },
  { code: "pln", name: "Polish Złoty" },
  { code: "pyg", name: "Paraguayan Guarani" },
  { code: "qar", name: "Qatari Riyal" },
  { code: "ron", name: "Romanian Leu" },
  { code: "rsd", name: "Serbian Dinar" },
  { code: "rub", name: "Russian Ruble" },
  { code: "rwf", name: "Rwandan Franc" },
  { code: "sar", name: "Saudi Riyal" },
  { code: "sbd", name: "Solomon Islands Dollar" },
  { code: "scr", name: "Seychellois Rupee" },
  { code: "sek", name: "Swedish Krona" },
  { code: "sgd", name: "Singapore Dollar" },
  { code: "shp", name: "Saint Helena Pound" },
  { code: "sle", name: "Sierra Leonean Leone" },
  { code: "sos", name: "Somali Shilling" },
  { code: "srd", name: "Surinamese Dollar" },
  { code: "std", name: "São Tomé and Príncipe Dobra" },
  { code: "thb", name: "Thai Baht" },
  { code: "tjs", name: "Tajikistani Somoni" },
  { code: "tnd", name: "Tunisian Dinar" },
  { code: "top", name: "Tongan Paʻanga" },
  { code: "try", name: "Turkish Lira" },
  { code: "ttd", name: "Trinidad and Tobago Dollar" },
  { code: "twd", name: "New Taiwan Dollar" },
  { code: "tzs", name: "Tanzanian Shilling" },
  { code: "uah", name: "Ukrainian Hryvnia" },
  { code: "ugx", name: "Ugandan Shilling" },
  { code: "usd", name: "US Dollar" },
  { code: "uyu", name: "Uruguayan Peso" },
  { code: "uzs", name: "Uzbekistan Som" },
  { code: "vnd", name: "Vietnamese Đồng" },
  { code: "vuv", name: "Vanuatu Vatu" },
  { code: "wst", name: "Samoan Tala" },
  { code: "xaf", name: "Central African CFA Franc" },
  { code: "xcd", name: "East Caribbean Dollar" },
  { code: "xof", name: "West African CFA Franc" },
  { code: "xpf", name: "CFP Franc" },
  { code: "yer", name: "Yemeni Rial" },
  { code: "zar", name: "South African Rand" },
  { code: "zmw", name: "Zambian Kwacha" },
].sort((a, b) => a.code.localeCompare(b.code));

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

function LoadingState({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const pulse = isDark ? "bg-slate-800" : "bg-slate-200/70";
  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <div className={`h-6 w-64 rounded animate-pulse ${pulse}`} />
        <div
          className={`mt-2 h-4 w-80 rounded animate-pulse ${isDark ? "bg-slate-800/80" : "bg-slate-200/60"}`}
        />
      </div>

      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <div
          className={`h-4 w-40 rounded animate-pulse ${isDark ? "bg-slate-800/80" : "bg-slate-200/60"}`}
        />
        <div
          className={`mt-3 h-10 w-full rounded animate-pulse ${isDark ? "bg-slate-800/60" : "bg-slate-200/50"}`}
        />
        <div
          className={`mt-2 h-10 w-full rounded animate-pulse ${isDark ? "bg-slate-800/60" : "bg-slate-200/50"}`}
        />
      </div>
    </div>
  );
}

function parseAmountToSmallestUnits(cur: string, display: string) {
  const currencyCode = (cur || "usd").toUpperCase();
  const dec = currencyDecimals(currencyCode);

  const normalized = display.replace(",", ".").trim();
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;

  return Math.round(n * 10 ** dec);
}

async function postInvoiceAction(
  invoiceId: string,
  action: string,
  locale: string,
) {
  const res = await billingAuthedFetch(
    `/api/billing/invoices/${encodeURIComponent(invoiceId)}/${action}`,
    locale,
    { method: "POST" },
  );

  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
  }
}

export default function InvoiceDetailClient({
  invoiceId,
}: {
  invoiceId: string;
}) {
  const t = useTranslations("BillingInvoiceDetailPage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
  const emptyLabel = tDomain("fallbacks.empty");

  const decodedInvoiceId = useMemo(
    () => decodeURIComponent(invoiceId),
    [invoiceId],
  );

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
  const subHeadBorder = isDark ? "border-slate-800" : "border-slate-100";

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

  const btnDanger = [
    btnBase,
    "border",
    isDark
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
      : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  ].join(" ");

  const btnSuccess = [
    btnBase,
    "border",
    isDark
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  ].join(" ");

  const [invoice, setInvoice] = useState<StripeInvoice | null>(null);
  const [items, setItems] = useState<StripeInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [mode, setMode] = useState<"custom" | "price">("custom");

  const [currency, setCurrency] = useState("usd");
  const [amountDisplay, setAmountDisplay] = useState("10.00");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [priceId, setPriceId] = useState("");

  const [saving, setSaving] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const status = String(invoice?.status ?? "").toLowerCase();
  const isDraft = status === "draft";
  const isOpen = status === "open";
  const isPaid = status === "paid";
  const isVoid = status === "void";

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}`,
        locale,
        { cache: "no-store" },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      const json: any = await res.json().catch(() => ({}));

      setInvoice((json.invoice ?? null) as StripeInvoice);

      const incoming = (json.items ?? json.lines ?? []) as any[];
      setItems(
        incoming.map((it) => ({
          id: String(it.id ?? ""),
          description: it.description ?? null,
          amount: typeof it.amount === "number" ? it.amount : null,
          currency: it.currency ?? null,
          quantity: typeof it.quantity === "number" ? it.quantity : null,
          price: it.price ?? null,
        })),
      );
    } catch (e: any) {
      setErr(String(e?.message ?? "load_failed"));
      setInvoice(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedInvoiceId, locale]);

  useEffect(() => {
    if (!itemModalOpen) return;
    const invCur = (invoice?.currency ?? "").toLowerCase();
    if (invCur) setCurrency(invCur);
    if (!amountDisplay.trim()) setAmountDisplay("10.00");
    if (!quantity.trim()) setQuantity("1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemModalOpen]);

  async function runAction(action: "finalize" | "send" | "void") {
    setErr(null);
    setSaving(true);
    try {
      await postInvoiceAction(decodedInvoiceId, action, locale);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? `${action}_failed`));
    } finally {
      setSaving(false);
    }
  }

  async function addItem() {
    setErr(null);
    setSavingItem(true);

    try {
      const qty = Math.max(1, Number(quantity) || 1);
      const payload: any = { mode, quantity: qty };

      if (mode === "price") {
        const pid = priceId.trim();
        if (!pid) throw new Error("missing_priceId");
        payload.priceId = pid;
      } else {
        const cur = currency.trim().toLowerCase();
        if (!cur) throw new Error("missing_currency");

        const smallest = parseAmountToSmallestUnits(cur, amountDisplay);
        if (!smallest) throw new Error("invalid_amount");

        payload.currency = cur;
        payload.amount = smallest;
        if (description.trim()) payload.description = description.trim();
      }

      const res = await billingAuthedFetch(
        `/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}/items/create`,
        locale,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      setItemModalOpen(false);
      setDescription("");
      setPriceId("");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "add_item_failed"));
    } finally {
      setSavingItem(false);
    }
  }

  if (loading) return <LoadingState isDark={isDark} />;

  if (!invoice) {
    return (
      <div className={`rounded-2xl border p-6 text-sm shadow-sm ${card}`}>
        <p className={mutedText}>{t("states.notFound")}</p>

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
    );
  }

  const cust =
    typeof invoice.customer === "object" && invoice.customer
      ? invoice.customer
      : null;
  const customerLabel =
    invoice.customer_name ??
    cust?.name ??
    invoice.customer_email ??
    cust?.email ??
    (typeof invoice.customer === "string" ? invoice.customer : null) ??
    emptyLabel;

  const smallId = invoice.id || decodedInvoiceId;
  const numberLabel = invoice.number
    ? t("header.invoiceNumber", { number: invoice.number })
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6">
        <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className={`text-2xl font-semibold ${headText}`}>
                {t("page.title")}
              </h1>

              <div
                className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] ${mutedText2}`}
              >
                {numberLabel && (
                  <span
                    className={
                      isDark
                        ? "font-semibold text-slate-200"
                        : "font-semibold text-slate-700"
                    }
                  >
                    {numberLabel}
                  </span>
                )}
                <span className={isDark ? "text-slate-700" : "text-slate-300"}>
                  •
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {smallId}
                </span>
              </div>

              <div
                className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${mutedText2}`}
              >
                <StatusPill
                  status={invoice.status}
                  isDark={isDark}
                  tDomain={tDomain}
                />
                <span>
                  {t("summary.total")}{" "}
                  <span
                    className={
                      isDark
                        ? "font-semibold text-slate-100"
                        : "font-semibold text-slate-900"
                    }
                  >
                    {fmtMoney(
                      invoice.currency,
                      invoice.total,
                      emptyLabel,
                    )}
                  </span>
                </span>
                <span>
                  {t("summary.created")}{" "}
                  {fmtUnix(invoice.created, locale, emptyLabel)}
                </span>
                <span>
                  {t("summary.due")}{" "}
                  {fmtUnix(invoice.due_date, locale, emptyLabel)}
                </span>
              </div>

              <p className={`mt-3 text-sm ${mutedText}`}>
                {t("summary.customer")}{" "}
                <span
                  className={
                    isDark
                      ? "font-semibold text-slate-100"
                      : "font-semibold text-slate-900"
                  }
                >
                  {customerLabel}
                </span>
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={load}
                disabled={saving}
                className={btnSecondary}
                title={t("actions.refreshTitle")}
              >
                <ArrowPathIcon
                  className={`h-4 w-4 ${saving ? "animate-spin" : ""}`}
                />
                {common("actions.refresh")}
              </button>

              <button
                type="button"
                onClick={() => setItemModalOpen(true)}
                disabled={saving || isPaid || isVoid}
                className={btnPrimary}
                title={
                  isPaid || isVoid
                    ? t("actions.addItemDisabledTitle")
                    : t("actions.addItemTitle")
                }
              >
                <PlusCircleIcon className="h-4 w-4" />
                {t("actions.addItem")}
              </button>

              {isDraft && (
                <button
                  type="button"
                  onClick={() => runAction("finalize")}
                  disabled={saving}
                  className={btnSuccess}
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {t("actions.finalize")}
                </button>
              )}

              {isOpen && (
                <button
                  type="button"
                  onClick={() => runAction("send")}
                  disabled={saving}
                  className={btnSecondary}
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  {t("actions.send")}
                </button>
              )}

              {!isPaid && !isVoid && (
                <button
                  type="button"
                  onClick={() => runAction("void")}
                  disabled={saving}
                  className={btnDanger}
                >
                  <XCircleIcon className="h-4 w-4" />
                  {t("actions.void")}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {invoice.hosted_invoice_url ? (
              <a
                href={invoice.hosted_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className={btnSecondary}
              >
                {t("links.openHostedInvoice")}
              </a>
            ) : (
              <span className={isDark ? "text-slate-500" : "text-slate-400"}>
                {t("links.hostedUnavailable")}
              </span>
            )}

            {invoice.invoice_pdf ? (
              <a
                href={invoice.invoice_pdf}
                target="_blank"
                rel="noopener noreferrer"
                className={btnSecondary}
              >
                {t("links.downloadPdf")}
              </a>
            ) : (
              <span className={isDark ? "text-slate-500" : "text-slate-400"}>
                {t("links.pdfUnavailable")}
              </span>
            )}

            <Link
              href="/billing/invoices"
              className={`${btnSecondary} ml-auto`}
            >
              {t("actions.backToInvoices")}
            </Link>
          </div>
        </div>

        <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
          <div className={`border-b px-5 py-3 ${subHeadBorder}`}>
            <h2 className={`text-sm font-semibold ${headText}`}>
              {t("items.title")}
            </h2>
            <p className={`mt-0.5 text-xs ${mutedText2}`}>
              {t("items.description")}
            </p>
          </div>

          {items.length === 0 ? (
            <div className={`p-5 text-sm ${mutedText}`}>
              {t.rich("items.empty", {
                strong: (chunks) => (
                  <span
                    className={
                      isDark ? "font-semibold text-slate-200" : "font-semibold"
                    }
                  >
                    {chunks}
                  </span>
                ),
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className={theadBg}>
                  <tr>
                    <th className="px-5 py-3 text-xs font-semibold">
                      {billing("fields.description")}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold">
                      {t("items.table.quantity")}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold">
                      {billing("fields.amount")}
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${divider}`}>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className={[
                        rowHover,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3">
                        <div className={`text-sm font-semibold ${headText}`}>
                          {it.description?.trim() || t("items.fallbackItem")}
                        </div>
                        <div
                          className={
                            isDark
                              ? "mt-0.5 font-mono text-[11px] text-slate-500"
                              : "mt-0.5 font-mono text-[11px] text-slate-400"
                          }
                        >
                          {it.id}
                        </div>
                      </td>
                      <td
                        className={`px-5 py-3 ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {it.quantity ?? 1}
                      </td>
                      <td
                        className={`px-5 py-3 ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        <span className={`font-semibold ${headText}`}>
                          {fmtMoney(
                            it.currency ?? invoice.currency,
                            it.amount,
                            emptyLabel,
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {itemModalOpen && (
        <div
          className={[
            "fixed inset-0 z-50 flex items-center justify-center p-4",
            isDark ? "bg-black/60" : "bg-slate-900/40",
          ].join(" ")}
        >
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-xl ${card}`}
          >
            <div className={`border-b px-5 py-4 ${subHeadBorder}`}>
              <h3 className={`text-base font-semibold ${headText}`}>
                {t("modal.title")}
              </h3>
              <p className={`mt-1 text-xs ${mutedText2}`}>
                {t("modal.description")}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  {t("modal.fields.mode")}
                </label>
                <select
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as "custom" | "price")
                  }
                  className={[inputBase, "cursor-pointer"].join(" ")}
                  disabled={savingItem}
                >
                  <option value="custom">{t("modal.modes.custom")}</option>
                  <option value="price">{t("modal.modes.price")}</option>
                </select>
              </div>

              {mode === "price" ? (
                <div className="space-y-3">
                  <div>
                    <label
                      className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                    >
                      {t("modal.fields.priceId")}
                    </label>
                    <input
                      value={priceId}
                      onChange={(e) => setPriceId(e.target.value)}
                      placeholder={t("modal.placeholders.priceId")}
                      className={inputBase}
                      disabled={savingItem}
                    />
                    <p
                      className={
                        isDark
                          ? "mt-1 text-[11px] text-slate-500"
                          : "mt-1 text-[11px] text-slate-400"
                      }
                    >
                      {t("modal.help.priceId")}
                    </p>
                  </div>

                  <div>
                    <label
                      className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                    >
                      {t("modal.fields.quantity")}
                    </label>
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      inputMode="numeric"
                      className={inputBase}
                      disabled={savingItem}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {billing("fields.currency")}
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className={[inputBase, "cursor-pointer"].join(" ")}
                        disabled={savingItem}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code.toUpperCase()} — {c.name}
                          </option>
                        ))}
                      </select>
                      <p
                        className={
                          isDark
                            ? "mt-1 text-[11px] text-slate-500"
                            : "mt-1 text-[11px] text-slate-400"
                        }
                      >
                        {t("modal.help.currency")}
                      </p>
                    </div>

                    <div>
                      <label
                        className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {billing("fields.amount")}
                      </label>
                      <input
                        value={amountDisplay}
                        onChange={(e) => setAmountDisplay(e.target.value)}
                        inputMode="decimal"
                        placeholder={t("modal.placeholders.amount")}
                        className={inputBase}
                        disabled={savingItem}
                      />
                      <p
                        className={
                          isDark
                            ? "mt-1 text-[11px] text-slate-500"
                            : "mt-1 text-[11px] text-slate-400"
                        }
                      >
                        {t("modal.help.amount")}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {t("modal.fields.quantity")}
                      </label>
                      <input
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        inputMode="numeric"
                        className={inputBase}
                        disabled={savingItem}
                      />
                    </div>

                    <div>
                      <label
                        className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {billing("fields.description")}
                      </label>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={inputBase}
                        disabled={savingItem}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`flex items-center justify-end gap-2 border-t px-5 py-4 ${border}`}
            >
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className={btnSecondary}
                disabled={savingItem}
              >
                {common("actions.cancel")}
              </button>

              <button
                type="button"
                onClick={addItem}
                disabled={savingItem || isPaid || isVoid}
                className={btnPrimary}
              >
                {savingItem ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : null}
                {savingItem
                  ? t("actions.addingItem")
                  : t("actions.addItemModal")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
