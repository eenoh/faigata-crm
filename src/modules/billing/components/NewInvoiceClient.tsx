// src/modules/billing/components/NewInvoiceClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

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
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">New Invoice</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create an invoice in Stripe, then add line items and send it to the
          customer.
        </p>
        {!!err && (
          <p className="mt-3 text-xs font-semibold text-rose-600">
            Error: {err}
          </p>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div>
          <label className="text-xs font-semibold text-slate-700">
            Customer
          </label>

          <div className="mt-1 flex items-center gap-2">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
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
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              disabled={saving}
              title="Manage customers"
            >
              Manage
            </button>
          </div>

          <p className="mt-1 text-[11px] text-slate-400">
            Tip: use the global header search on the Customers page to find the
            exact customer fast.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-700">
              Collection method
            </label>
            <select
              value={collectionMethod}
              onChange={(e) => setCollectionMethod(e.target.value as any)}
              className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={saving}
            >
              <option value="send_invoice">Send invoice</option>
              <option value="charge_automatically">Charge automatically</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Send invoice = email the invoice link. Charge automatically =
              Stripe attempts payment.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">
              Days until due
            </label>
            <input
              value={daysUntilDue}
              onChange={(e) => setDaysUntilDue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              inputMode="numeric"
              disabled={saving || collectionMethod !== "send_invoice"}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Only applies when using “Send invoice”.
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700">
            Memo (optional)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder="Visible to the customer on the invoice."
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={createInvoice}
            disabled={!canSubmit}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Creating…" : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
