// src/modules/billing/components/NewInvoiceClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

type CustomerOption = { id: string; name: string | null; email: string | null };

async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}

export default function NewInvoiceClient() {
  const router = useRouter();
  const presetCustomer = (useSearchParams().get("customer") ?? "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens (match BillingCustomersClient / BillingInvoicesClient)
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
        const res = await authedFetch("/api/billing/customers?limit=50", {
          cache: "no-store",
        });
        const json: any = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!cancelled) {
            setErr(json.error ?? `failed_${res.status}`);
            setCustomers([]);
          }
          return;
        }

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
  }, []);

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

      const res = await authedFetch("/api/billing/invoices/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `failed_${res.status}`);

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
      {/* Header card */}
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold ${headText}`}>New Invoice</h1>
        <p className={`mt-1 text-sm ${mutedText}`}>
          Create an invoice in Stripe, then add line items and send it to the
          customer.
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

      {/* Form card */}
      <div
        className={`space-y-4 rounded-2xl border px-6 py-5 shadow-sm ${card}`}
      >
        <div>
          <label
            className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
          >
            Customer
          </label>

          <div className="mt-1 flex items-center gap-2">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className={[inputBase, "cursor-pointer"].join(" ")}
              disabled={loadingCustomers || saving}
            >
              <option value="">
                {loadingCustomers ? "Loading customers…" : "Select a customer"}
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
              title="Manage customers"
            >
              Manage
            </button>
          </div>

          <p className={`mt-1 text-[11px] ${mutedText2}`}>
            Tip: use the global header search on the Customers page to find the
            exact customer fast.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
            >
              Collection method
            </label>
            <select
              value={collectionMethod}
              onChange={(e) => setCollectionMethod(e.target.value as any)}
              className={[inputBase, "cursor-pointer"].join(" ")}
              disabled={saving}
            >
              <option value="send_invoice">Send invoice</option>
              <option value="charge_automatically">Charge automatically</option>
            </select>
            <p className={`mt-1 text-[11px] ${mutedText2}`}>
              Send invoice = email the invoice link. Charge automatically =
              Stripe attempts payment.
            </p>
          </div>

          <div>
            <label
              className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
            >
              Days until due
            </label>
            <input
              value={daysUntilDue}
              onChange={(e) => setDaysUntilDue(e.target.value)}
              className={inputBase}
              inputMode="numeric"
              disabled={saving || collectionMethod !== "send_invoice"}
            />
            <p className={`mt-1 text-[11px] ${mutedText2}`}>
              Only applies when using “Send invoice”.
            </p>
          </div>
        </div>

        <div>
          <label
            className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
          >
            Memo (optional)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className={inputBase}
            placeholder="Visible to the customer on the invoice."
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
            Cancel
          </button>

          <button
            type="button"
            onClick={createInvoice}
            disabled={!canSubmit}
            className={btnPrimary}
          >
            {saving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Creating…" : "Create Invoice"}
          </button>
        </div>

        {/* optional: tiny helper text for disabled submit */}
        {!customerId && (
          <p className={`text-[11px] ${mutedText2}`}>
            Select a customer to enable “Create Invoice”.
          </p>
        )}
      </div>
    </div>
  );
}
