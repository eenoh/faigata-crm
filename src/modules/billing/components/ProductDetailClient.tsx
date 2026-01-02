// src/modules/billing/components/ProductDetailClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

async function authedFetch(input: RequestInfo, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");
  return fetch(input, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

/**
 * NOTE:
 * This component expects /api/billing/products/[productId] to return Stripe-first shapes:
 * {
 *   product: { id, name, description, active, created, ... },
 *   prices:  [{ id, active, created, currency, unit_amount, recurring? ... }],
 *   activity: [{ id, type, payload, actor_user_id, created_at, stripe_price_id, stripe_product_id? ... }]
 * }
 */

// Stripe-first shapes
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
  recurring?: { interval: "day" | "week" | "month" | "year"; interval_count?: number } | null;
};

type Activity = {
  id: string;
  type: string;
  payload: any;
  actor_user_id: string | null;
  created_at: string; // ISO
  stripe_price_id: string | null;
  stripe_product_id?: string | null;
};

const CURRENCIES = [
  // reasonably complete ISO 4217 set (Stripe supports many; not all may be enabled for every account)
  "aed","afn","all","amd","ang","aoa","ars","aud","awg","azn",
  "bam","bbd","bdt","bgn","bhd","bif","bmd","bnd","bob","brl","bsd","btn","bwp","byn","bzd",
  "cad","cdf","chf","clp","cny","cop","crc","cve","czk",
  "djf","dkk","dop","dzd",
  "egp","ern","etb","eur",
  "fjd","fkp",
  "gbp","gel","ghs","gip","gmd","gnf","gtq","gyd",
  "hkd","hnl","hrk","htg","huf",
  "idr","ils","inr","iqd","irr","isk",
  "jmd","jod","jpy",
  "kes","kgs","khr","kmf","krw","kwd","kyd","kzt",
  "lak","lbp","lkr","lrd","lsl","lyd",
  "mad","mdl","mga","mkd","mmk","mnt","mop","mru","mur","mvr","mwk","mxn","myr","mzn",
  "nad","ngn","nio","nok","npr","nzd",
  "omr",
  "pab","pen","pgk","php","pkr","pln","pyg",
  "qar",
  "ron","rsd","rub","rwf",
  "sar","sbd","scr","sek","sgd","shp","sle","sll","sos","srd","ssp","stn","svc","szl",
  "thb","tjs","tmt","tnd","top","try","ttd","twd","tzs",
  "uah","ugx","usd","uyu","uzs",
  "ves","vnd","vuv",
  "wst",
  "xaf","xcd","xof","xpf",
  "yer",
  "zar","zmw",
] as const;

function fmtMoney(currency: string | null, unit_amount: number | null) {
  if (!currency || unit_amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(unit_amount / 100);
  } catch {
    return `${unit_amount / 100} ${currency}`;
  }
}

function fmtIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function fmtUnix(unix: number | null) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString();
}

function prettyEvent(type: string) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/* -------------------- Loading skeleton -------------------- */

function LoadingState() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="h-6 w-64 rounded bg-slate-200/70 animate-pulse" />
        <div className="mt-2 h-4 w-80 rounded bg-slate-200/60 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm"
            >
              <div className="h-4 w-28 rounded bg-slate-200/60 animate-pulse" />
              <div className="mt-3 h-4 w-64 rounded bg-slate-200/60 animate-pulse" />
              <div className="mt-2 h-4 w-48 rounded bg-slate-200/60 animate-pulse" />
            </div>
          ))}

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 w-24 rounded bg-slate-200/60 animate-pulse" />
                <div className="mt-2 h-3 w-80 rounded bg-slate-200/50 animate-pulse" />
              </div>
              <div className="h-8 w-28 rounded bg-slate-200/60 animate-pulse" />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
              <div className="h-10 bg-slate-100" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 border-t border-slate-100 bg-white" />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="h-4 w-40 rounded bg-slate-200/60 animate-pulse" />
            <div className="mt-2 h-3 w-56 rounded bg-slate-200/50 animate-pulse" />
          </div>
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="h-3 w-48 rounded bg-slate-200/60 animate-pulse" />
                <div className="mt-2 h-3 w-64 rounded bg-slate-200/50 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Activity timeline helpers -------------------- */

function activityIcon(a: Activity) {
  const t = String(a.type || "").toLowerCase();

  if (t === "product_created") return "/icons/new-product.svg";
  if (t === "product_updated") return "/icons/product-updated.svg";

  // ✅ NEW: product archived icon
  if (t === "product_archived") return "/icons/product-archived.svg";

  if (t === "price_created") {
    if (a.payload?.recurring?.interval) return "/icons/price-recurring.svg";
    return "/icons/price-one-time.svg";
  }

  if (t === "price_archived") return "/icons/price-archived.svg";

  return "/icons/stage-change.svg";
}

function activityTitle(a: Activity) {
  const t = String(a.type || "").toLowerCase();

  if (t === "product_created") return "Product created";
  if (t === "product_updated") return "Product updated";
  if (t === "product_archived") return "Product archived";

  if (t === "price_created") {
    return a.payload?.recurring?.interval ? "Recurring price created" : "One-time price created";
  }

  if (t === "price_archived") return "Price archived";

  return prettyEvent(a.type);
}

function activitySubtext(a: Activity, productName: string) {
  const t = String(a.type || "").toLowerCase();

  if (t === "product_created") {
    return `New product added: ${productName || "Product"}`;
  }

  if (t === "product_updated") {
    const name = a.payload?.name ? `Name → ${String(a.payload.name)}` : null;
    const desc = a.payload?.description !== undefined ? "Description updated" : null;
    return [name, desc].filter(Boolean).join(" · ") || "Product details changed";
  }

  if (t === "product_archived") {
    // ✅ fixes your duplicated text issue
    return "Set to inactive in Stripe (existing invoices are unaffected).";
  }

  if (t === "price_created") {
    const cur = String(a.payload?.currency ?? "").toUpperCase();
    const amt = typeof a.payload?.unit_amount === "number" ? a.payload.unit_amount : null;

    const amountLabel = amt != null && cur ? fmtMoney(cur.toLowerCase(), amt) : "New price created";

    if (a.payload?.recurring?.interval) {
      const n = a.payload.recurring.interval_count ?? 1;
      const interval = a.payload.recurring.interval;
      return `${amountLabel} · Billed every ${n} ${interval}${n === 1 ? "" : "s"}`;
    }

    return `${amountLabel} · One-time charge`;
  }

  if (t === "price_archived") {
    return `Archived Stripe price: ${a.stripe_price_id ?? ""}`.trim();
  }

  if (t === "catalog_synced") {
    const p = a.payload?.products;
    const pr = a.payload?.prices;
    const parts = [
      typeof p === "number" ? `${p} products` : null,
      typeof pr === "number" ? `${pr} prices` : null,
    ].filter(Boolean);
    return parts.length ? `Synced catalog · ${parts.join(" · ")}` : "Synced catalog";
  }

  return activityMessage(a, productName);
}

function activityMessage(a: Activity, productName: string) {
  const t = String(a.type || "").toLowerCase();

  if (t === "product_created") {
    return `New Product: ${productName || "New product"}`;
  }

  if (t === "product_updated") {
    // keep it short like your lead timeline vibe
    const name = a.payload?.name ? `Name → ${String(a.payload.name)}` : null;
    const desc = a.payload?.description !== undefined ? "Updated description" : null;
    return [name, desc].filter(Boolean).join(" · ") || "Updated product";
  }

  if (t === "price_created") {
    const cur = String(a.payload?.currency ?? "").toUpperCase();
    const amt = typeof a.payload?.unit_amount === "number" ? a.payload.unit_amount : null;
    const recurring = a.payload?.recurring?.interval
      ? `${a.payload.recurring.interval_count ?? 1}× ${a.payload.recurring.interval}`
      : null;

    const amountLabel = amt != null && cur ? fmtMoney(cur.toLowerCase(), amt) : "Created new price";
    return recurring ? `${amountLabel} · Recurring (${recurring})` : `${amountLabel} · One-time`;
  }

  if (t === "price_archived") {
    return `Archived price: ${a.stripe_price_id ?? ""}`.trim();
  }

  if (t === "catalog_synced") {
    const p = a.payload?.products;
    const pr = a.payload?.prices;
    const parts = [
      typeof p === "number" ? `${p} products` : null,
      typeof pr === "number" ? `${pr} prices` : null,
    ].filter(Boolean);
    return parts.length ? `Synced catalog · ${parts.join(" · ")}` : "Synced catalog";
  }

  return prettyEvent(a.type);
}

export default function ProductDetailClient({ productId }: { productId: string }) {
  const router = useRouter();

  const [product, setProduct] = useState<StripeProduct | null>(null);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // price modal
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [currency, setCurrency] = useState<string>("usd");
  const [amountCents, setAmountCents] = useState<string>("1000");
  const [isRecurring, setIsRecurring] = useState(false);
  const [interval, setInterval] = useState<"day" | "week" | "month" | "year">("month");
  const [intervalCount, setIntervalCount] = useState<string>("1");
  const [savingPrice, setSavingPrice] = useState(false);

  const displayName = useMemo(() => {
    if (!product) return productId;
    return product.name ?? product.id ?? productId;
  }, [product, productId]);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await authedFetch(`/api/billing/products/${encodeURIComponent(productId)}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

      const pRaw = json?.product ?? null;
      const pricesRaw = (json?.prices ?? []) as any[];
      const actRaw = (json?.activity ?? []) as any[];

      setProduct(
        pRaw
          ? {
              id: String(pRaw.id ?? productId),
              name: pRaw.name ?? null,
              description: pRaw.description ?? null,
              active: !!pRaw.active,
              created: typeof pRaw.created === "number" ? pRaw.created : null,
            }
          : null
      );

      setPrices(
        pricesRaw.map((pr) => ({
          id: String(pr.id ?? ""),
          active: !!pr.active,
          created: typeof pr.created === "number" ? pr.created : null,
          currency: pr.currency ?? null,
          unit_amount: typeof pr.unit_amount === "number" ? pr.unit_amount : null,
          recurring: pr.recurring ?? null,
        }))
      );

      setActivity(
        actRaw.map((a) => ({
          id: String(a.id ?? ""),
          type: String(a.type ?? ""),
          payload: a.payload ?? {},
          actor_user_id: a.actor_user_id ?? null,
          created_at: String(a.created_at ?? new Date().toISOString()),
          stripe_price_id: a.stripe_price_id ?? null,
          stripe_product_id: a.stripe_product_id ?? null,
        }))
      );
    } catch (e: any) {
      setErr(String(e?.message ?? "load_failed"));
      setProduct(null);
      setPrices([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function syncAll() {
    setErr(null);
    try {
      const res = await authedFetch("/api/billing/products/sync", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);
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
        throw new Error("Invalid amount (cents).");
      }

      const cur = String(currency || "usd").trim().toLowerCase();
      if (!cur) throw new Error("Currency is required.");

      const payload: any = {
        currency: cur,
        unit_amount,
      };

      if (isRecurring) {
        payload.recurring = {
          interval,
          interval_count: Number(intervalCount) || 1,
        };
      }

      const res = await authedFetch(
        `/api/billing/products/${encodeURIComponent(productId)}/prices/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

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
      const res = await authedFetch(`/api/billing/prices/${encodeURIComponent(priceId)}/archive`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? "price_archive_failed"));
    }
  }

  if (loading) return <LoadingState />;

  if (!product) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Product not found.
        {!!err && <div className="mt-2 text-xs font-semibold text-rose-600">Error: {err}</div>}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        {/* LEFT */}
        <div className="space-y-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-slate-900">{displayName}</h1>
              <p className="mt-1 text-sm text-slate-500">
                Stripe ID: <span className="font-mono text-xs">{product.id}</span>
              </p>
              {!!err && <p className="mt-2 text-xs font-semibold text-rose-600">Error: {err}</p>}
            </div>

            <div className="flex items-center gap-2">
              {/* Sync */}
              <button
                type="button"
                onClick={syncAll}
                title="Sync catalog from Stripe"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4" />
                  Sync
                </span>
              </button>

              {/* Edit */}
              <Link
                href={`/billing/products/${encodeURIComponent(productId)}/edit`}
                className="inline-flex h-[28px] w-16 items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
              >
                Edit
              </Link>

              {/* Archive */}
              <button
                type="button"
                onClick={() =>
                  router.push(`/billing/products/${encodeURIComponent(productId)}/delete`)
                }
                className="inline-flex h-[28px] w-16 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 cursor-pointer"
              >
                Archive
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Status</h2>
            {product.active ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                Archived
              </span>
            )}
            <p className="mt-2 text-xs text-slate-500">Created: {fmtUnix(product.created)}</p>
          </div>

          {/* Details */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Details</h2>
            <div className="space-y-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</div>
                <div className="text-sm text-slate-800">{product.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Description
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">
                  {product.description ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Prices */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Prices</h2>
                <p className="text-xs text-slate-500">
                  Stripe prices are effectively immutable — create a new price and archive the old one.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPriceModalOpen(true)}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                + New price
              </button>
            </div>

            {prices.length === 0 ? (
              <p className="text-sm text-slate-500">No prices yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Amount</th>
                      <th className="px-4 py-2 font-semibold">Type</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 font-semibold">Created</th>
                      <th className="px-4 py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prices.map((pr) => {
                      const amount = fmtMoney(pr.currency ?? null, pr.unit_amount ?? null);
                      const recurringLabel = pr.recurring?.interval
                        ? `${pr.recurring.interval_count ?? 1}× ${pr.recurring.interval}`
                        : "—";
                      const typeLabel = pr.recurring?.interval
                        ? `Recurring (${recurringLabel})`
                        : "One-time";

                      return (
                        <tr key={pr.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 font-semibold text-slate-900">{amount}</td>
                          <td className="px-4 py-2 text-slate-700">{typeLabel}</td>
                          <td className="px-4 py-2">
                            {pr.active ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                Archived
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-700">{fmtUnix(pr.created)}</td>
                          <td className="px-4 py-2 text-right">
                            {pr.active ? (
                              <button
                                type="button"
                                onClick={() => archivePrice(pr.id)}
                                className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Archive
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
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

        {/* RIGHT: Activity timeline */}
        <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Activity Timeline</h2>
            <p className="text-xs text-slate-500">Product updates and price changes.</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {activity.length === 0 ? (
              <p className="text-xs text-slate-500">No activity yet.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {activity.map((a) => {
                  const iconSrc = activityIcon(a);
                  const title = activityTitle(a);
                  const sub = activitySubtext(a, product.name ?? displayName);

                  return (
                    <div key={a.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={iconSrc}
                          alt={prettyEvent(a.type)}
                          className="h-8 w-8 rounded-full object-cover border border-slate-200"
                        />
                      </div>

                      <div className="flex-1">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">{prettyEvent(a.type)}</span>
                            <span>{fmtIso(a.created_at)}</span>
                          </div>

                          <div className="whitespace-pre-wrap text-[11px] text-slate-800">
                            {sub}
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

      {/* Price modal */}
      {priceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Create price</h3>
              <p className="mt-1 text-xs text-slate-500">Amount is in cents (e.g. 1000 = $10.00).</p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white cursor-pointer"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">Pick a currency supported by your Stripe account.</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Amount (cents)</label>
                  <input
                    value={amountCents}
                    onChange={(e) => setAmountCents(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    inputMode="numeric"
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
                />
                <label htmlFor="recurring" className="text-sm text-slate-700 cursor-pointer">
                  Recurring
                </label>
              </div>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Interval</label>
                    <select
                      value={interval}
                      onChange={(e) => setInterval(e.target.value as any)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white cursor-pointer"
                    >
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                      <option value="year">year</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Interval count</label>
                    <input
                      value={intervalCount}
                      onChange={(e) => setIntervalCount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setPriceModalOpen(false)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createPrice}
                disabled={savingPrice}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingPrice ? "Creating…" : "Create price"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
