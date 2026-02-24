"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

async function authedFetch(input: RequestInfo, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

type Mode = "create" | "edit";

type BillingType = "one_time" | "recurring";
type Interval = "day" | "week" | "month" | "year";

// ISO 4217 currency codes (Stripe uses lowercase in API requests commonly).
// This is a broad list; Stripe supports a subset depending on account + payment methods.
// You can trim if you want. Keeping it comprehensive for a dropdown.
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

  // allow "19.99" or "19,99"
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
  const router = useRouter();
  const safeProductId = useMemo(() => (productId ?? "").trim(), [productId]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // ✅ price fields (create mode)
  const [currency, setCurrency] = useState<CurrencyCode>("usd");
  const [amount, setAmount] = useState(""); // major units input (e.g. "19.99")
  const [billingType, setBillingType] = useState<BillingType>("one_time");
  const [interval, setInterval] = useState<Interval>("month");
  const [intervalCount, setIntervalCount] = useState<number>(1);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load existing product (edit mode)
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
        const res = await authedFetch(
          `/api/billing/products/${encodeURIComponent(safeProductId)}`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

        // ✅ Stripe-only route returns Stripe Product -> name/description (not stripe_name)
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
  }, [mode, safeProductId]);

  async function submit() {
    setErr(null);
    setSaving(true);

    try {
      if (!name.trim()) throw new Error("Name is required.");

      // ✅ CREATE: product + price
      if (mode === "create") {
        const cents = toCents(amount);
        if (cents == null) throw new Error("Price amount is required.");

        const cur = String(currency ?? "usd")
          .trim()
          .toLowerCase();
        if (!cur) throw new Error("Currency is required.");

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

        const res = await authedFetch("/api/billing/products/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

        // ✅ Robustly extract product id
        const newId =
          json?.stripe_product_id ??
          json?.product?.id ??
          json?.productId ??
          json?.id;

        if (!newId || typeof newId !== "string")
          throw new Error("create_response_missing_product_id");

        router.push(`/billing/products/${encodeURIComponent(newId)}`);
        return;
      }

      // ✅ EDIT: only name/description
      if (!safeProductId) throw new Error("missing_product_id");

      const res = await authedFetch(
        `/api/billing/products/${encodeURIComponent(safeProductId)}/update`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            // allow clearing description: send null if empty
            description: description.trim() === "" ? null : description.trim(),
          }),
        },
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);

      router.push(`/billing/products/${encodeURIComponent(safeProductId)}`);
    } catch (e: any) {
      setErr(String(e?.message ?? "save_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {mode === "create" ? "New Product" : "Edit Product"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "create"
            ? "Creates a Stripe product + price on your connected account."
            : "Updates the Stripe product name/description."}
        </p>

        {!!err && (
          <p className="mt-3 text-xs font-semibold text-rose-600">
            Error: {err}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Coaching Package"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Optional…"
              />
            </div>

            {/* ✅ Price section only for CREATE */}
            {mode === "create" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Price
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  This will create a Stripe Price for the product. Stripe prices
                  are usually not edited—create a new one instead.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-700">
                      Amount
                    </label>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. 19.99"
                      inputMode="decimal"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Enter in major units (e.g. 19.99). We’ll convert to cents.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">
                      Currency
                    </label>

                    <select
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value as CurrencyCode)
                      }
                      className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c.toUpperCase()}
                        </option>
                      ))}
                    </select>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Sent to Stripe as lowercase code.
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-slate-700">
                    Billing type
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setBillingType("one_time")}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${
                        billingType === "one_time"
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      One-time
                    </button>

                    <button
                      type="button"
                      onClick={() => setBillingType("recurring")}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${
                        billingType === "recurring"
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Recurring
                    </button>
                  </div>
                </div>

                {billingType === "recurring" && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Interval
                      </label>
                      <select
                        value={interval}
                        onChange={(e) =>
                          setInterval(e.target.value as Interval)
                        }
                        className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="day">Daily</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Interval count
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={intervalCount}
                        onChange={(e) =>
                          setIntervalCount(Number(e.target.value))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        e.g. 1 month, 3 months, etc.
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
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving
                  ? "Saving…"
                  : mode === "create"
                    ? "Create Product"
                    : "Save Changes"}
              </button>
            </div>

            {mode === "edit" && !safeProductId && (
              <div className="text-xs text-slate-500">
                Tip: This page requires a product id in the route params.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
