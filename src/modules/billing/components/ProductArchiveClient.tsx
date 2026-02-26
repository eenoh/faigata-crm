// src/modules/billing/components/ProductArchiveClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

// Stripe-first shape (minimal for this page)
type StripeProduct = {
  id: string;
  name: string | null;
  description?: string | null;
  active?: boolean;
  created?: number | null;
};

export default function ProductArchiveClient({
  productId,
}: {
  productId: string;
}) {
  const router = useRouter();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens (match invoices/customers)
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";

  const btnBase =
    "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  const btnSecondary = [
    btnBase,
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");

  const btnDangerSolid = [
    "cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
    isDark ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-600 hover:bg-rose-700",
  ].join(" ");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [product, setProduct] = useState<StripeProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);

  const productName = useMemo(
    () => String(product?.name ?? "").trim() || productId,
    [product?.name, productId],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingProduct(true);
      setErr(null);

      try {
        const res = await authedFetch(
          `/api/billing/products/${encodeURIComponent(productId)}`,
          { cache: "no-store" },
        );
        const json: any = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!cancelled) {
            setProduct(null);
            setErr(json?.error ?? `failed_${res.status}`);
          }
          return;
        }

        const p = json.product;
        if (!cancelled) {
          setProduct(
            p
              ? {
                  id: String(p.id ?? productId),
                  name: p.name ?? null,
                  description: p.description ?? null,
                  active: typeof p.active === "boolean" ? p.active : undefined,
                  created: typeof p.created === "number" ? p.created : null,
                }
              : null,
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setProduct(null);
          setErr(String(e?.message ?? "load_failed"));
        }
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function archive() {
    setErr(null);
    setSaving(true);

    try {
      const res = await authedFetch(
        `/api/billing/products/${encodeURIComponent(productId)}/archive`,
        { method: "POST" },
      );
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `failed_${res.status}`);
      router.push("/billing/products");
    } catch (e: any) {
      setErr(String(e?.message ?? "archive_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* Warning header card (match invoices error style) */}
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold ${headText}`}>Archive product</h1>
        <p className={`mt-1 text-sm ${mutedText}`}>
          This sets <span className="font-semibold">active=false</span> in
          Stripe. Existing invoices are unaffected.
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
              Error: {err}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation card */}
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <p className={`text-sm ${mutedText}`}>
          Are you sure you want to archive{" "}
          <span className={`font-semibold ${headText}`}>
            {loadingProduct ? "…" : productName}
          </span>
          ?
        </p>

        <p className={`mt-2 text-xs ${mutedText2}`}>
          Stripe ID: <span className="font-mono">{productId}</span>
        </p>

        <div
          className={`mt-5 flex items-center justify-end gap-2 border-t pt-4 ${border}`}
        >
          <button
            type="button"
            onClick={() => router.back()}
            className={btnSecondary}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={archive}
            disabled={saving}
            className={btnDangerSolid}
          >
            {saving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}
