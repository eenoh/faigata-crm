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
  const t = useTranslations("BillingProductArchivePage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();

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
    "bg-rose-600 hover:bg-rose-700",
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
        const res = await billingAuthedFetch(
          `/api/billing/products/${encodeURIComponent(productId)}`,
          locale,
          { cache: "no-store" },
        );

        if (!res.ok) {
          const message = await readApiErrorMessage(
            res,
            `failed_${res.status}`,
          );
          if (!cancelled) {
            setProduct(null);
            setErr(message);
          }
          return;
        }

        const json: any = await res.json().catch(() => ({}));
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
  }, [productId, locale]);

  async function archive() {
    setErr(null);
    setSaving(true);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/products/${encodeURIComponent(productId)}/archive`,
        locale,
        { method: "POST" },
      );

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `failed_${res.status}`));
      }

      router.push("/billing/products");
    } catch (e: any) {
      setErr(String(e?.message ?? "archive_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold ${headText}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${mutedText}`}>
          {t.rich("page.description", {
            strong: (chunks) => <span className="font-semibold">{chunks}</span>,
          })}
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
        <p className={`text-sm ${mutedText}`}>
          {t("confirm.before")}{" "}
          <span className={`font-semibold ${headText}`}>
            {loadingProduct ? billing("states.loading") : productName}
          </span>
          {t("confirm.after")}
        </p>

        <p className={`mt-2 text-xs ${mutedText2}`}>
          {t("confirm.stripeId")} <span className="font-mono">{productId}</span>
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
            {common("actions.cancel")}
          </button>

          <button
            type="button"
            onClick={archive}
            disabled={saving}
            className={btnDangerSolid}
          >
            {saving ? billing("actions.archiving") : common("actions.archive")}
          </button>
        </div>
      </div>
    </div>
  );
}
