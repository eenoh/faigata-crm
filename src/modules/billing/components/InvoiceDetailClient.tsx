// src/modules/billing/components/InvoiceDetailClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";

type StripeInvoice = {
  id: string;
  number: string | null;
  status: string | null; // draft | open | paid | void | uncollectible
  currency: string | null;
  customer: string | { id: string; email?: string | null; name?: string | null } | null;
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
  amount: number | null; // smallest unit (usually cents)
  currency: string | null;
  quantity: number | null;
  price?: { id: string; unit_amount?: number | null; currency?: string | null } | null;
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

function fmtUnix(unix: number | null) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString();
}

/**
 * Stripe amounts are in the "smallest currency unit":
 * - USD/EUR/etc: cents (2 decimals)
 * - JPY/KRW/etc: no decimals
 * We'll format correctly based on currency.
 */
function currencyDecimals(currency: string) {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).formatToParts(1);
    const frac = parts.find((p) => p.type === "fraction")?.value ?? "";
    return frac.length; // 0, 2, 3...
  } catch {
    return 2;
  }
}

function fmtMoney(currency: string | null, amountSmallest: number | null) {
  if (!currency || amountSmallest == null) return "—";
  const cur = currency.toUpperCase();
  const dec = currencyDecimals(cur);
  const value = amountSmallest / Math.pow(10, dec);

  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(value);
  } catch {
    return `${value.toFixed(dec)} ${cur}`;
  }
}

/** Build a nice dropdown list: "EUR — Euro", etc. */
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
    <div className="max-w-6xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="h-6 w-64 rounded bg-slate-200/70 animate-pulse" />
        <div className="mt-2 h-4 w-80 rounded bg-slate-200/60 animate-pulse" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="h-4 w-40 rounded bg-slate-200/60 animate-pulse" />
        <div className="mt-3 h-10 w-full rounded bg-slate-200/50 animate-pulse" />
        <div className="mt-2 h-10 w-full rounded bg-slate-200/50 animate-pulse" />
      </div>
    </div>
  );
}

export default function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<StripeInvoice | null>(null);
  const [items, setItems] = useState<StripeInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // add-item modal
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [mode, setMode] = useState<"custom" | "price">("custom");

  // custom item fields (NEW)
  const [currency, setCurrency] = useState("usd");
  const [amountDisplay, setAmountDisplay] = useState("10.00"); // user-friendly amount
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");

  // price item fields
  const [priceId, setPriceId] = useState("");

  const [saving, setSaving] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const decodedInvoiceId = useMemo(() => decodeURIComponent(invoiceId), [invoiceId]);

  const status = String(invoice?.status ?? "").toLowerCase();
  const isDraft = status === "draft";
  const isOpen = status === "open";
  const isPaid = status === "paid";
  const isVoid = status === "void";

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await authedFetch(`/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

      setInvoice((json?.invoice ?? null) as StripeInvoice);

      // API returns `lines` (or sometimes `items`)
      const incoming = (json?.items ?? json?.lines ?? []) as any[];

      setItems(
        incoming.map((it) => ({
          id: String(it.id ?? ""),
          description: it.description ?? null,
          amount: typeof it.amount === "number" ? it.amount : null,
          currency: it.currency ?? null,
          quantity: typeof it.quantity === "number" ? it.quantity : null,
          price: it.price ?? null,
        }))
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
  }, [decodedInvoiceId]);

  // Nice defaults when opening modal: use invoice currency if available
  useEffect(() => {
    if (!itemModalOpen) return;
    const invCur = (invoice?.currency ?? "").toLowerCase();
    if (invCur) setCurrency(invCur);
    // sensible default if user re-opens
    if (!amountDisplay.trim()) setAmountDisplay("10.00");
    if (!quantity.trim()) setQuantity("1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemModalOpen]);

  async function finalizeInvoice() {
    setErr(null);
    setSaving(true);
    try {
      const res = await authedFetch(`/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}/finalize`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "finalize_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function sendInvoice() {
    setErr(null);
    setSaving(true);
    try {
      const res = await authedFetch(`/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}/send`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "send_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function voidInvoice() {
    setErr(null);
    setSaving(true);
    try {
      const res = await authedFetch(`/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}/void`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "void_failed"));
    } finally {
      setSaving(false);
    }
  }

  function parseAmountToSmallestUnits(cur: string, display: string) {
    const currencyCode = (cur || "usd").toUpperCase();
    const dec = currencyDecimals(currencyCode);

    // Allow "10", "10.5", "10,50" (EU)
    const normalized = display.replace(",", ".").trim();
    const n = Number(normalized);

    if (!Number.isFinite(n) || n <= 0) return null;

    const factor = Math.pow(10, dec);
    return Math.round(n * factor);
  }

  async function addItem() {
    setErr(null);
    setSavingItem(true);

    try {
      const payload: any = { mode };

      if (mode === "price") {
        const pid = priceId.trim();
        const qty = Math.max(1, Number(quantity) || 1);
        if (!pid) throw new Error("missing_priceId");
        payload.priceId = pid;
        payload.quantity = qty;
      } else {
        const cur = currency.trim().toLowerCase();
        const qty = Math.max(1, Number(quantity) || 1);

        if (!cur) throw new Error("missing_currency");

        const smallest = parseAmountToSmallestUnits(cur, amountDisplay);
        if (smallest == null || smallest <= 0) throw new Error("invalid_amount");

        payload.currency = cur;
        payload.amount = smallest; // server expects smallest unit (Stripe expects)
        payload.quantity = qty;
        if (description.trim()) payload.description = description.trim();
      }

      const res = await authedFetch(
        `/api/billing/invoices/${encodeURIComponent(decodedInvoiceId)}/items/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

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

  if (loading) return <LoadingState />;

  if (!invoice) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Invoice not found.
        {!!err && <div className="mt-2 text-xs font-semibold text-rose-600">Error: {err}</div>}
      </div>
    );
  }

  const cust = typeof invoice.customer === "object" && invoice.customer ? invoice.customer : null;

  const customerLabel =
    invoice.customer_name ??
    cust?.name ??
    invoice.customer_email ??
    cust?.email ??
    (typeof invoice.customer === "string" ? invoice.customer : null) ??
    "—";

  const smallId = invoice.id || decodedInvoiceId;
  const numberLabel = invoice.number ? `Invoice #${invoice.number}` : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6">
        {/* Header card */}
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900">Invoice Details</h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
                {numberLabel && <span className="font-semibold text-slate-700">{numberLabel}</span>}
                <span className="text-slate-300">•</span>
                <span className="font-mono text-[11px] text-slate-500">{smallId}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <StatusPill status={invoice.status} />
                <span>
                  Total:{" "}
                  <span className="font-semibold text-slate-900">
                    {fmtMoney(invoice.currency, invoice.total)}
                  </span>
                </span>
                <span>Created: {fmtUnix(invoice.created)}</span>
                <span>Due: {fmtUnix(invoice.due_date)}</span>
              </div>

              <p className="mt-3 text-sm text-slate-600">
                Customer: <span className="font-semibold text-slate-900">{customerLabel}</span>
              </p>

              {!!err && <p className="mt-3 text-xs font-semibold text-rose-600">Error: {err}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={load}
                disabled={saving}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                title="Refresh invoice"
              >
                <ArrowPathIcon className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
                Refresh
              </button>

              <button
                type="button"
                onClick={() => setItemModalOpen(true)}
                disabled={saving || isPaid || isVoid}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                title={isPaid || isVoid ? "Can't add items to a closed invoice" : "Add line item"}
              >
                <PlusCircleIcon className="h-4 w-4" />
                Add item
              </button>

              {isDraft && (
                <button
                  type="button"
                  onClick={finalizeInvoice}
                  disabled={saving}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Finalize invoice"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  Finalize
                </button>
              )}

              {isOpen && (
                <button
                  type="button"
                  onClick={sendInvoice}
                  disabled={saving}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Send invoice"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  Send
                </button>
              )}

              {!isPaid && !isVoid && (
                <button
                  type="button"
                  onClick={voidInvoice}
                  disabled={saving}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Void invoice"
                >
                  <XCircleIcon className="h-4 w-4" />
                  Void
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {invoice.hosted_invoice_url ? (
              <a
                href={invoice.hosted_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open Hosted Invoice →
              </a>
            ) : (
              <span className="text-slate-400">Hosted invoice not available yet.</span>
            )}

            {invoice.invoice_pdf ? (
              <a
                href={invoice.invoice_pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Download PDF →
              </a>
            ) : (
              <span className="text-slate-400">PDF not available yet.</span>
            )}

            <Link
              href="/billing/invoices"
              className="ml-auto cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Invoices
            </Link>
          </div>
        </div>

        {/* Items */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Add items, then finalize and send. Items are locked after payment or voiding.
            </p>
          </div>

          {items.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">
              No line items yet. Click <span className="font-semibold">Add item</span> to create the first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-5 py-3 font-semibold">Qty</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <div className="text-sm font-semibold text-slate-900">
                          {it.description?.trim() || "Invoice item"}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-slate-400">{it.id}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{it.quantity ?? 1}</td>
                      <td className="px-5 py-3 text-slate-700">
                        <span className="font-semibold text-slate-900">
                          {fmtMoney(it.currency ?? invoice.currency, it.amount)}
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

      {/* Add item modal */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Add line item</h3>
              <p className="mt-1 text-xs text-slate-500">
                Use a Stripe Price (recurring/one-time), or add a custom amount without thinking in cents.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  disabled={savingItem}
                >
                  <option value="custom">Custom amount</option>
                  <option value="price">Stripe Price</option>
                </select>
              </div>

              {mode === "price" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Price ID</label>
                    <input
                      value={priceId}
                      onChange={(e) => setPriceId(e.target.value)}
                      placeholder="price_..."
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      disabled={savingItem}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Paste a Stripe Price ID. (Later you can build a “pick product/price” UI.)
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Quantity</label>
                    <input
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      disabled={savingItem}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Currency</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        disabled={savingItem}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code.toUpperCase()} — {c.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Tip: Stripe will store the amount in the smallest unit automatically.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Amount</label>
                      <input
                        value={amountDisplay}
                        onChange={(e) => setAmountDisplay(e.target.value)}
                        inputMode="decimal"
                        placeholder="e.g. 99.00"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        disabled={savingItem}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Enter the normal amount (e.g. 10.50). No cents-math needed.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Quantity</label>
                      <input
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        inputMode="numeric"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        disabled={savingItem}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Description (optional)</label>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        disabled={savingItem}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={savingItem}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={addItem}
                disabled={savingItem || isPaid || isVoid}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingItem ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
                {savingItem ? "Adding…" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
