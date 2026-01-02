// src/modules/billing/components/ProductArchiveClient.tsx
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
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

// Stripe-first shape (minimal for this page)
type StripeProduct = {
  id: string;
  name: string | null;
  description?: string | null;
  active?: boolean;
  created?: number | null;
};

export default function ProductArchiveClient({ productId }: { productId: string }) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ NEW: product fetch state
  const [product, setProduct] = useState<StripeProduct | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);

  const productName = useMemo(() => {
    const n = String(product?.name ?? "").trim();
    return n || productId;
  }, [product?.name, productId]);

  // ✅ NEW: fetch product name from Stripe-backed endpoint
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingProduct(true);
      setErr(null);

      try {
        const res = await authedFetch(`/api/billing/products/${encodeURIComponent(productId)}`, {
          cache: "no-store",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          // Don't hard-fail the page—just fall back to productId.
          console.error("[ProductArchive] Failed to load product", res.status, json);
          if (!cancelled) setProduct(null);
          return;
        }

        const p = json?.product ?? null;

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
              : null
          );
        }
      } catch (e) {
        console.error("[ProductArchive] Unexpected product load error", e);
        if (!cancelled) setProduct(null);
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
        { method: "POST" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `failed_${res.status}`);
      router.push("/billing/products");
    } catch (e: any) {
      setErr(String(e?.message ?? "archive_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-5 shadow-sm">
        <h1 className="text-xl font-semibold text-rose-800">Archive product</h1>
        <p className="mt-1 text-sm text-rose-700">
          This sets <span className="font-semibold">active=false</span> in Stripe. Existing invoices are unaffected.
        </p>
        {!!err && <p className="mt-3 text-xs font-semibold text-rose-700">Error: {err}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p className="text-sm text-slate-700">
          Are you sure you want to archive{" "}
          <span className="font-semibold text-slate-900">
            {loadingProduct ? "…" : productName}
          </span>
          ?
        </p>

        <p className="mt-2 text-xs text-slate-500">
          Stripe ID: <span className="font-mono">{productId}</span>
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={archive}
            disabled={saving}
            className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
          >
            {saving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>
    </div>
  );
}
