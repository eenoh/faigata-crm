"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiErrorMessage,
} from "@/features/billing/components/errorMessages";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
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

type StripeProduct = {
  id: string;
  name: string | null;
  description: string | null;
  active: boolean;
  created: number | null;
};

type StripePrice = {
  id: string;
  active: boolean;
  created: number | null;
  currency: string | null;
  unit_amount: number | null;
  recurring?: {
    interval: "day" | "week" | "month" | "year";
    interval_count?: number;
  } | null;
};

type Activity = {
  id: string;
  type: string;
  payload: any;
  actor_user_id: string | null;
  created_at: string;
  stripe_price_id: string | null;
  stripe_product_id?: string | null;
};

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
  "clp",
  "cny",
  "cop",
  "crc",
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
  "sek",
  "sgd",
  "shp",
  "sle",
  "sll",
  "sos",
  "srd",
  "ssp",
  "stn",
  "svc",
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
] as const;

const fmtMoney = (
  currency: string | null,
  unit_amount: number | null,
  emptyLabel: string,
) => {
  if (!currency || unit_amount == null) return emptyLabel;
  const cur = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(unit_amount / 100);
  } catch {
    return `${unit_amount / 100} ${currency}`;
  }
};

const fmtIso = (iso: string, locale: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale);
};

const fmtUnix = (unix: number | null, locale: string, emptyLabel: string) =>
  unix ? new Date(unix * 1000).toLocaleString(locale) : emptyLabel;

const prettyEvent = (type: string) =>
  String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const isRecurringPayload = (a: Activity) => !!a.payload?.recurring?.interval;

function activityIcon(a: Activity) {
  const t = String(a.type || "").toLowerCase();
  if (t === "product_created") return "/icons/new-product.svg";
  if (t === "product_updated") return "/icons/product-updated.svg";
  if (t === "product_archived") return "/icons/product-archived.svg";
  if (t === "price_created")
    return isRecurringPayload(a)
      ? "/icons/price-recurring.svg"
      : "/icons/price-one-time.svg";
  if (t === "price_archived") return "/icons/price-archived.svg";
  return "/icons/stage-change.svg";
}

function activityLabel(a: Activity, t: ReturnType<typeof useTranslations>) {
  const type = String(a.type || "").toLowerCase();
  if (type === "product_created") return t("activity.types.productCreated");
  if (type === "product_updated") return t("activity.types.productUpdated");
  if (type === "product_archived") return t("activity.types.productArchived");
  if (type === "price_created") {
    return isRecurringPayload(a)
      ? t("activity.types.recurringPriceCreated")
      : t("activity.types.oneTimePriceCreated");
  }
  if (type === "price_archived") return t("activity.types.priceArchived");
  return prettyEvent(a.type);
}

function activityText(
  a: Activity,
  productName: string,
  t: ReturnType<typeof useTranslations>,
  emptyLabel: string,
) {
  const type = String(a.type || "").toLowerCase();

  if (type === "product_created") {
    const name =
      String(a.payload?.name ?? "").trim() ||
      productName ||
      t("activity.fallbacks.product");
    return t("activity.text.productCreated", { name });
  }

  if (type === "product_updated") {
    const name = a.payload?.name
      ? t("activity.text.nameChanged", { name: String(a.payload.name) })
      : null;
    const desc =
      a.payload?.description !== undefined
        ? t("activity.text.descriptionUpdated")
        : null;
    return (
      [name, desc].filter(Boolean).join(" · ") ||
      t("activity.text.productDetailsChanged")
    );
  }

  if (type === "product_archived") {
    return t("activity.text.productArchived");
  }

  if (type === "price_created") {
    const cur = String(a.payload?.currency ?? "").toUpperCase();
    const amt =
      typeof a.payload?.unit_amount === "number" ? a.payload.unit_amount : null;
    const amountLabel =
      amt != null && cur
        ? fmtMoney(cur.toLowerCase(), amt, emptyLabel)
        : t("activity.text.newPriceCreated");

    if (isRecurringPayload(a)) {
      const n = a.payload.recurring.interval_count ?? 1;
      const interval = a.payload.recurring.interval;
      return t("activity.text.recurringPriceCreated", {
        amount: amountLabel,
        count: n,
        interval,
      });
    }

    return t("activity.text.oneTimePriceCreated", { amount: amountLabel });
  }

  if (type === "price_archived") {
    return t("activity.text.priceArchived", {
      id: a.stripe_price_id ?? "",
    }).trim();
  }

  if (type === "catalog_synced") {
    const p = a.payload?.products;
    const pr = a.payload?.prices;
    const parts = [
      typeof p === "number"
        ? t("activity.text.productsCount", { count: p })
        : null,
      typeof pr === "number"
        ? t("activity.text.pricesCount", { count: pr })
        : null,
    ].filter(Boolean);
    return parts.length
      ? t("activity.text.catalogSyncedWithCounts", { parts: parts.join(" · ") })
      : t("activity.text.catalogSynced");
  }

  return prettyEvent(a.type);
}

function mapProduct(pRaw: any, fallbackId: string): StripeProduct | null {
  if (!pRaw) return null;
  return {
    id: String(pRaw.id ?? fallbackId),
    name: pRaw.name ?? null,
    description: pRaw.description ?? null,
    active: !!pRaw.active,
    created: typeof pRaw.created === "number" ? pRaw.created : null,
  };
}

function mapPrices(pricesRaw: any[]): StripePrice[] {
  return (pricesRaw ?? []).map((pr) => ({
    id: String(pr.id ?? ""),
    active: !!pr.active,
    created: typeof pr.created === "number" ? pr.created : null,
    currency: pr.currency ?? null,
    unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
    recurring: pr.recurring ?? null,
  }));
}

function mapActivity(actRaw: any[]): Activity[] {
  return (actRaw ?? []).map((a) => ({
    id: String(a.id ?? ""),
    type: String(a.type ?? ""),
    payload: a.payload ?? {},
    actor_user_id: a.actor_user_id ?? null,
    created_at: String(a.created_at ?? new Date().toISOString()),
    stripe_price_id: a.stripe_price_id ?? null,
    stripe_product_id: a.stripe_product_id ?? null,
  }));
}

function LoadingState({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const pulse = isDark ? "bg-slate-800" : "bg-slate-200/70";
  const subBorder = isDark ? "border-slate-800" : "border-slate-100";
  const soft = isDark ? "bg-slate-900/30" : "bg-slate-50";

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <div className={`h-6 w-64 rounded animate-pulse ${pulse}`} />
        <div className={`mt-2 h-4 w-80 rounded animate-pulse ${pulse}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-2xl border px-4 py-4 shadow-sm ${card} ${subBorder}`}
            >
              <div className={`h-4 w-28 rounded animate-pulse ${pulse}`} />
              <div className={`mt-3 h-4 w-64 rounded animate-pulse ${pulse}`} />
              <div className={`mt-2 h-4 w-48 rounded animate-pulse ${pulse}`} />
            </div>
          ))}

          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${card} ${subBorder}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className={`h-4 w-24 rounded animate-pulse ${pulse}`} />
                <div
                  className={`mt-2 h-3 w-80 rounded animate-pulse ${pulse}`}
                />
              </div>
              <div className={`h-8 w-28 rounded animate-pulse ${pulse}`} />
            </div>

            <div
              className={`mt-4 overflow-hidden rounded-xl border ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div className={`h-10 ${soft}`} />
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-12 border-t ${
                    isDark ? "border-slate-800" : "border-slate-100"
                  } ${card}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div
          className={`overflow-hidden rounded-2xl border shadow-sm ${card} ${subBorder}`}
        >
          <div
            className={`border-b px-4 py-3 ${
              isDark ? "border-slate-800" : "border-slate-100"
            }`}
          >
            <div className={`h-4 w-40 rounded animate-pulse ${pulse}`} />
            <div className={`mt-2 h-3 w-56 rounded animate-pulse ${pulse}`} />
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={[
                  "rounded-xl border px-3 py-2",
                  isDark
                    ? "border-slate-800 bg-slate-900/30"
                    : "border-slate-100 bg-slate-50",
                ].join(" ")}
              >
                <div className={`h-3 w-48 rounded animate-pulse ${pulse}`} />
                <div
                  className={`mt-2 h-3 w-64 rounded animate-pulse ${pulse}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailClient({
  productId,
}: {
  productId: string;
}) {
  const t = useTranslations("BillingProductDetailPage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
  const router = useRouter();
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
  const theadBg = isDark ? "bg-slate-900/40" : "bg-slate-50";
  const modalOverlay = isDark ? "bg-black/60" : "bg-slate-900/40";

  const clsBtn =
    "inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";
  const clsBtnSecondary = [
    clsBtn,
    isDark
      ? "border border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");
  const clsBtnPrimary = `${clsBtn} bg-indigo-600 text-white hover:bg-indigo-700`;
  const clsBtnDangerSoft = [
    clsBtn,
    isDark
      ? "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
      : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  ].join(" ");

  const inputBase = [
    "mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400/40"
      : "border-slate-200 bg-white text-slate-700 focus:ring-indigo-500",
  ].join(" ");

  const [product, setProduct] = useState<StripeProduct | null>(null);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [currency, setCurrency] = useState("usd");
  const [amountCents, setAmountCents] = useState("1000");
  const [isRecurring, setIsRecurring] = useState(false);
  const [interval, setInterval] = useState<"day" | "week" | "month" | "year">(
    "month",
  );
  const [intervalCount, setIntervalCount] = useState("1");
  const [savingPrice, setSavingPrice] = useState(false);

  const displayName = useMemo(
    () => product?.name ?? product?.id ?? productId,
    [product, productId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/products/${encodeURIComponent(productId)}`,
        locale,
        { cache: "no-store" },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      const json: any = await res.json().catch(() => ({}));

      setProduct(mapProduct(json.product, productId));
      setPrices(mapPrices(json.prices));
      setActivity(mapActivity(json.activity));
    } catch (e: any) {
      setErr(String(e?.message ?? "load_failed"));
      setProduct(null);
      setPrices([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [productId, locale]);

  useEffect(() => {
    load();
  }, [load]);

  async function syncAll() {
    setErr(null);
    try {
      const res = await billingAuthedFetch(
        "/api/billing/products/sync",
        locale,
        {
          method: "POST",
        },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "sync_failed"));
    }
  }

  async function createPrice() {
    setSavingPrice(true);
    setErr(null);

    try {
      const unit_amount = Number(amountCents);
      if (!Number.isFinite(unit_amount) || unit_amount <= 0) {
        throw new Error("Enter a valid amount in cents greater than 0.");
      }

      const cur = String(currency || "usd")
        .trim()
        .toLowerCase();
      if (!cur) throw new Error("Please choose a currency.");

      const payload: any = { currency: cur, unit_amount };

      if (isRecurring) {
        payload.recurring = {
          interval,
          interval_count: Number(intervalCount) || 1,
        };
      }

      const res = await billingAuthedFetch(
        `/api/billing/products/${encodeURIComponent(productId)}/prices/create`,
        locale,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      setPriceModalOpen(false);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "price_create_failed"));
    } finally {
      setSavingPrice(false);
    }
  }

  async function archivePrice(priceId: string) {
    setErr(null);
    try {
      const res = await billingAuthedFetch(
        `/api/billing/prices/${encodeURIComponent(priceId)}/archive`,
        locale,
        { method: "POST" },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "price_archive_failed"));
    }
  }

  if (loading) return <LoadingState isDark={isDark} />;

  if (!product) {
    return (
      <div className={`rounded-2xl border p-6 text-sm shadow-sm ${card}`}>
        <div className={mutedText}>{t("states.notFound")}</div>
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        <div className="space-y-6 pb-6">
          <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className={`truncate text-2xl font-semibold ${headText}`}>
                  {displayName}
                </h1>
                <p className={`mt-1 text-sm ${mutedText}`}>
                  {t("header.stripeId")}{" "}
                  <span className="font-mono text-xs">{product.id}</span>
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
                  onClick={syncAll}
                  className={clsBtnSecondary}
                  title={t("actions.syncTitle")}
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  {t("actions.sync")}
                </button>

                <Link
                  href={`/billing/products/${encodeURIComponent(productId)}/edit`}
                  className={clsBtnPrimary}
                >
                  {common("actions.edit")}
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/billing/products/${encodeURIComponent(productId)}/delete`,
                    )
                  }
                  className={clsBtnDangerSoft}
                >
                  {common("actions.archive")}
                </button>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
            <h2 className={`mb-2 text-sm font-semibold ${headText}`}>
              {t("statusCard.title")}
            </h2>

            {product.active ? (
              <span
                className={[
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                  isDark
                    ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                    : "bg-emerald-50 text-emerald-700",
                ].join(" ")}
              >
                {billing("status.active")}
              </span>
            ) : (
              <span
                className={[
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                  isDark
                    ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
                    : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {billing("status.archived")}
              </span>
            )}

            <p className={`mt-2 text-xs ${mutedText2}`}>
              {t("statusCard.created")}{" "}
              {fmtUnix(product.created, locale, emptyLabel)}
            </p>
          </div>

          <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
            <h2 className={`mb-3 text-sm font-semibold ${headText}`}>
              {t("details.title")}
            </h2>

            <div className="space-y-2">
              <div>
                <div
                  className={`text-xs font-semibold ${
                    isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  {billing("fields.name")}
                </div>
                <div className={`text-sm ${headText}`}>
                  {product.name ?? emptyLabel}
                </div>
              </div>

              <div>
                <div
                  className={`text-xs font-semibold ${
                    isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  {billing("fields.description")}
                </div>
                <div className={`whitespace-pre-wrap text-sm ${headText}`}>
                  {product.description ?? emptyLabel}
                </div>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className={`text-sm font-semibold ${headText}`}>
                  {t("prices.title")}
                </h2>
                <p className={`mt-0.5 text-xs ${mutedText2}`}>
                  {t("prices.description")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPriceModalOpen(true)}
                className={clsBtnPrimary}
              >
                {t("actions.newPrice")}
              </button>
            </div>

            {prices.length === 0 ? (
              <p className={`text-sm ${mutedText}`}>{t("prices.empty")}</p>
            ) : (
              <div className={`overflow-x-auto rounded-xl border ${border}`}>
                <table className="min-w-full text-left text-sm">
                  <thead className={theadBg}>
                    <tr>
                      <th
                        className={`px-4 py-2 text-xs font-semibold ${
                          isDark ? "text-slate-300" : "text-slate-700"
                        }`}
                      >
                        {t("prices.table.amount")}
                      </th>
                      <th
                        className={`px-4 py-2 text-xs font-semibold ${
                          isDark ? "text-slate-300" : "text-slate-700"
                        }`}
                      >
                        {t("prices.table.type")}
                      </th>
                      <th
                        className={`px-4 py-2 text-xs font-semibold ${
                          isDark ? "text-slate-300" : "text-slate-700"
                        }`}
                      >
                        {t("prices.table.status")}
                      </th>
                      <th
                        className={`px-4 py-2 text-xs font-semibold ${
                          isDark ? "text-slate-300" : "text-slate-700"
                        }`}
                      >
                        {t("prices.table.created")}
                      </th>
                      <th
                        className={`px-4 py-2 text-right text-xs font-semibold ${
                          isDark ? "text-slate-300" : "text-slate-700"
                        }`}
                      >
                        {t("prices.table.actions")}
                      </th>
                    </tr>
                  </thead>

                  <tbody className={`divide-y ${divider}`}>
                    {prices.map((pr) => {
                      const amount = fmtMoney(
                        pr.currency,
                        pr.unit_amount,
                        emptyLabel,
                      );
                      const recurringLabel = pr.recurring?.interval
                        ? t("prices.recurringLabel", {
                            count: pr.recurring.interval_count ?? 1,
                            interval: pr.recurring.interval,
                          })
                        : emptyLabel;
                      const typeLabel = pr.recurring?.interval
                        ? t("prices.recurringType", { recurringLabel })
                        : billing("price.oneTime");

                      return (
                        <tr key={pr.id} className={rowHover}>
                          <td className={`px-4 py-2 font-semibold ${headText}`}>
                            {amount}
                          </td>
                          <td
                            className={`px-4 py-2 ${
                              isDark ? "text-slate-300" : "text-slate-700"
                            }`}
                          >
                            {typeLabel}
                          </td>
                          <td className="px-4 py-2">
                            {pr.active ? (
                              <span
                                className={[
                                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                                  isDark
                                    ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                                    : "bg-emerald-50 text-emerald-700",
                                ].join(" ")}
                              >
                                {billing("status.active")}
                              </span>
                            ) : (
                              <span
                                className={[
                                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                                  isDark
                                    ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
                                    : "bg-slate-100 text-slate-600",
                                ].join(" ")}
                              >
                                {billing("status.archived")}
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-4 py-2 ${
                              isDark ? "text-slate-300" : "text-slate-700"
                            }`}
                          >
                            {fmtUnix(pr.created, locale, emptyLabel)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {pr.active ? (
                              <button
                                type="button"
                                onClick={() => archivePrice(pr.id)}
                                className={clsBtnDangerSoft}
                              >
                                {common("actions.archive")}
                              </button>
                            ) : (
                              <span
                                className={`text-xs ${
                                  isDark ? "text-slate-600" : "text-slate-300"
                                }`}
                              >
                                {emptyLabel}
                              </span>
                            )}
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

        <div
          className={`flex h-full flex-col rounded-2xl border shadow-sm ${card}`}
        >
          <div className={`border-b px-6 py-5 ${border}`}>
            <h2 className={`text-sm font-semibold ${headText}`}>
              {t("activity.title")}
            </h2>
            <p className={`mt-0.5 text-xs ${mutedText2}`}>
              {t("activity.description")}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activity.length === 0 ? (
              <p className={`text-xs ${mutedText2}`}>{t("activity.empty")}</p>
            ) : (
              <div className="space-y-3 text-xs">
                {activity.map((a) => {
                  const iconSrc = activityIcon(a);
                  const label = activityLabel(a, t);
                  const text = activityText(
                    a,
                    product.name ?? displayName,
                    t,
                    emptyLabel,
                  );

                  return (
                    <div key={a.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={iconSrc}
                          alt={label}
                          className={[
                            "h-8 w-8 rounded-full border object-cover",
                            isDark ? "border-slate-800" : "border-slate-200",
                          ].join(" ")}
                        />
                      </div>

                      <div className="flex-1">
                        <div
                          className={[
                            "rounded-xl border px-3 py-2",
                            isDark
                              ? "border-slate-800 bg-slate-900/30"
                              : "border-slate-100 bg-slate-50",
                          ].join(" ")}
                        >
                          <div
                            className={`mb-1 flex items-center justify-between gap-2 text-[11px] ${mutedText2}`}
                          >
                            <span
                              className={`font-semibold ${
                                isDark ? "text-slate-200" : "text-slate-700"
                              }`}
                            >
                              {label}
                            </span>
                            <span>{fmtIso(a.created_at, locale)}</span>
                          </div>

                          <div
                            className={`whitespace-pre-wrap text-[11px] ${headText}`}
                          >
                            {text}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {priceModalOpen && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalOverlay}`}
        >
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-xl ${card}`}
          >
            <div className={`border-b px-5 py-4 ${border}`}>
              <h3 className={`text-base font-semibold ${headText}`}>
                {t("modal.title")}
              </h3>
              <p className={`mt-1 text-xs ${mutedText2}`}>
                {t("modal.description")}
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className={`text-xs font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {billing("fields.currency")}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className={inputBase}
                    disabled={savingPrice}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <p className={`mt-1 text-[11px] ${mutedText2}`}>
                    {t("modal.help.currency")}
                  </p>
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {t("modal.fields.amountCents")}
                  </label>
                  <input
                    value={amountCents}
                    onChange={(e) => setAmountCents(e.target.value)}
                    className={inputBase}
                    inputMode="numeric"
                    disabled={savingPrice}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="recurring"
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="cursor-pointer"
                  disabled={savingPrice}
                />
                <label
                  htmlFor="recurring"
                  className={`cursor-pointer text-sm ${
                    isDark ? "text-slate-200" : "text-slate-700"
                  }`}
                >
                  {billing("price.recurring")}
                </label>
              </div>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className={`text-xs font-semibold ${
                        isDark ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t("modal.fields.interval")}
                    </label>
                    <select
                      value={interval}
                      onChange={(e) =>
                        setInterval(
                          e.target.value as "day" | "week" | "month" | "year",
                        )
                      }
                      className={inputBase}
                      disabled={savingPrice}
                    >
                      <option value="day">{t("modal.intervals.day")}</option>
                      <option value="week">{t("modal.intervals.week")}</option>
                      <option value="month">
                        {t("modal.intervals.month")}
                      </option>
                      <option value="year">{t("modal.intervals.year")}</option>
                    </select>
                  </div>

                  <div>
                    <label
                      className={`text-xs font-semibold ${
                        isDark ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {t("modal.fields.intervalCount")}
                    </label>
                    <input
                      value={intervalCount}
                      onChange={(e) => setIntervalCount(e.target.value)}
                      className={inputBase}
                      inputMode="numeric"
                      disabled={savingPrice}
                    />
                  </div>
                </div>
              )}
            </div>

            <div
              className={`flex items-center justify-end gap-2 border-t px-5 py-4 ${border}`}
            >
              <button
                type="button"
                onClick={() => setPriceModalOpen(false)}
                className={clsBtnSecondary}
                disabled={savingPrice}
              >
                {common("actions.cancel")}
              </button>

              <button
                type="button"
                onClick={createPrice}
                disabled={savingPrice}
                className={clsBtnPrimary}
              >
                {savingPrice
                  ? billing("actions.creating")
                  : t("actions.createPrice")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
