"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  UserCircleIcon,
  LinkIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created: number;
  invoice_settings: { default_payment_method: string | null };
  linkedLeadId: string | null;
  linkedLeadLabel: string | null;
};

type LeadOption = {
  id: string;
  label: string;
  stage: string;
  created_at: string;
  primary_contact_type: "email" | "phone" | string | null;
  primary_contact_value: string | null;
};

function formatDate(unixSeconds: number) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

/** Small empty-state card */
function EmptyState({
  variant,
  query,
}: {
  variant: "none" | "no_match";
  query?: string;
}) {
  if (variant === "no_match") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-semibold text-slate-700">No customers match “{query}”.</p>
        <p className="mt-1">Try a different name, email, phone number, or Stripe customer id.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
      <p>No customers yet.</p>
      <p className="mt-1">
        Click <span className="font-semibold">Refresh</span> to sync from Stripe, or remove the filter
        in the header search.
      </p>
    </div>
  );
}

export default function BillingCustomersClient() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Link existing customer -> lead
  const [linkingCustomer, setLinkingCustomer] = useState<CustomerRow | null>(null);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [savingLink, setSavingLink] = useState(false);

  const [pendingRow, setPendingRow] = useState<string | null>(null);

  // Create new Stripe customer + link to lead
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createLeadId, setCreateLeadId] = useState("");
  const [createLeadQuery, setCreateLeadQuery] = useState("");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredLeadQuery = useMemo(() => leadQuery.trim(), [leadQuery]);
  const filteredCreateLeadQuery = useMemo(() => createLeadQuery.trim(), [createLeadQuery]);

  async function authedFetch(input: RequestInfo, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("no_session");

    const res = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    return res;
  }

  async function loadCustomers() {
    setLoading(true);
    setErr(null);

    try {
      const res = await authedFetch(
        `/api/billing/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setErr(json?.error ?? `failed_${res.status}`);
        setRows([]);
        return;
      }

      setRows((json?.customers ?? []) as CustomerRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "load_failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadLeads(forQuery: string) {
    setLoadingLeads(true);
    try {
      const res = await authedFetch(
        `/api/billing/customers/leads${forQuery ? `?q=${encodeURIComponent(forQuery)}` : ""}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLeads([]);
        return;
      }
      setLeads((json?.leads ?? []) as LeadOption[]);
    } finally {
      setLoadingLeads(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!linkingCustomer) return;
    loadLeads("");
    setLeadQuery("");
    setSelectedLeadId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingCustomer?.id]);

  useEffect(() => {
    if (!linkingCustomer) return;
    const handle = window.setTimeout(() => {
      loadLeads(filteredLeadQuery);
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeadQuery, linkingCustomer?.id]);

  // Create modal lead search
  useEffect(() => {
    if (!creatingCustomer) return;
    loadLeads("");
    setCreateLeadId("");
    setCreateLeadQuery("");
    setCreateName("");
    setCreateEmail("");
    setCreatePhone("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatingCustomer]);

  useEffect(() => {
    if (!creatingCustomer) return;
    const handle = window.setTimeout(() => {
      loadLeads(filteredCreateLeadQuery);
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCreateLeadQuery, creatingCustomer]);

  function applyLeadPrefill(leadId: string) {
    const lead = leads.find((l) => l.id === leadId);

    // If we can't resolve the lead, clear prefills
    if (!lead) {
      setCreateName("");
      setCreateEmail("");
      setCreatePhone("");
      return;
    }

    // Always prefill name from lead label (or empty)
    setCreateName((lead.label ?? "").trim());

    // Always recompute primary contact prefills
    const t = (lead.primary_contact_type ?? "").toLowerCase().trim();
    const v = (lead.primary_contact_value ?? "").trim();

    // If lead has no usable value, clear both
    if (!v) {
      setCreateEmail("");
      setCreatePhone("");
      return;
    }

    // Only set the matching field; clear the other every time
    if (t === "email") {
      setCreateEmail(v);
      setCreatePhone("");
      return;
    }

    if (t === "phone") {
      setCreatePhone(v);
      setCreateEmail("");
      return;
    }

    // Unknown type -> clear both (per your requirement)
    setCreateEmail("");
    setCreatePhone("");
  }

  async function linkCustomer() {
    if (!linkingCustomer || !selectedLeadId) return;
    setSavingLink(true);

    try {
      const res = await authedFetch("/api/billing/customers/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeCustomerId: linkingCustomer.id,
          leadId: selectedLeadId,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error ?? `link_failed_${res.status}`);
        return;
      }

      setLinkingCustomer(null);
      await loadCustomers();
    } finally {
      setSavingLink(false);
    }
  }

  async function unlinkCustomer(customerId: string) {
    setPendingRow(customerId);
    setErr(null);

    try {
      const res = await authedFetch("/api/billing/customers/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeCustomerId: customerId }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error ?? `unlink_failed_${res.status}`);
        return;
      }

      await loadCustomers();
    } finally {
      setPendingRow(null);
    }
  }

  async function createStripeCustomer() {
    if (!createLeadId) return;

    setCreating(true);
    setErr(null);

    try {
      const res = await authedFetch("/api/billing/customers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: createLeadId,
          name: createName,
          email: createEmail,
          phone: createPhone,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error ?? `create_failed_${res.status}`);
        return;
      }

      setCreatingCustomer(false);
      await loadCustomers();
    } finally {
      setCreating(false);
    }
  }

  const visibleRows = useMemo(() => rows, [rows]);
  const totalCount = visibleRows.length;
  const visibleCount = visibleRows.length;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white px-7 py-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Stripe customers for your connected account. Use the header search to filter by name,
              email, phone, or ID.
            </p>

            {q ? (
              <p className="mt-2 text-xs text-slate-500">
                Filter: <span className="font-semibold text-slate-700">“{q}”</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No filter applied.</p>
            )}
          </div>

          {/* ✅ Refresh LEFT, New customer RIGHT */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setCreatingCustomer(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" />
              New customer
            </button>
          </div>
        </div>

        {!!err && (
          <p className="mt-3 text-xs font-semibold text-rose-600">Error: {err}</p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Stripe customers</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {loading
              ? "Loading…"
              : q
              ? `Showing ${visibleCount} customer(s) matching your filter`
              : `${totalCount} customer(s) shown`}
          </p>
        </div>

        {loading ? (
          <div className="p-5">
            <div className="space-y-3">
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ) : totalCount === 0 ? (
          <div className="p-5">
            <EmptyState variant="none" />
          </div>
        ) : visibleCount === 0 ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Payment method</th>
                  <th className="px-5 py-3 font-semibold">Linked lead</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((c) => {
                  const hasPm = !!c.invoice_settings?.default_payment_method;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
                            <UserCircleIcon className="h-5 w-5 text-slate-500" />
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {c.name || c.email || c.id}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {c.email ?? "—"} {c.phone ? `• ${c.phone}` : ""}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">{c.id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">{formatDate(c.created)}</td>

                      <td className="px-5 py-4">
                        {hasPm ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircleIcon className="h-4 w-4" />
                            On file
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                            None
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {c.linkedLeadId ? (
                          <div className="space-y-1">
                            {/* ✅ Show lead name only (no id) */}
                            <p className="text-xs font-semibold text-slate-900">
                              {c.linkedLeadLabel ?? "Linked lead"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Not linked</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLinkingCustomer(c)}
                            disabled={pendingRow === c.id}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <LinkIcon className="h-4 w-4" />
                            {c.linkedLeadId ? "Change link" : "Link"}
                          </button>

                          {c.linkedLeadId && (
                            <button
                              type="button"
                              onClick={() => unlinkCustomer(c.id)}
                              disabled={pendingRow === c.id}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {pendingRow === c.id ? (
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                              ) : (
                                <XMarkIcon className="h-4 w-4" />
                              )}
                              Unlink
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create customer modal */}
      {creatingCustomer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">Create Stripe customer</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  New customer
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Create a customer in the connected Stripe account and link it to a lead.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCreatingCustomer(false)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Find a Lead
                </label>
                <input
                  value={createLeadQuery}
                  onChange={(e) => setCreateLeadQuery(e.target.value)}
                  placeholder="Type lead name, email, phone…"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Selecting a lead will prefill name + primary email/phone.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Select Lead</label>

                <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                  {loadingLeads ? (
                    <div className="p-3 text-xs text-slate-500">Loading leads…</div>
                  ) : leads.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">No leads found.</div>
                  ) : (
                    leads.map((l) => (
                      <button
                        key={`create-${l.id}`}
                        type="button"
                        onClick={() => {
                          setCreateLeadId(l.id);
                          applyLeadPrefill(l.id);
                        }}
                        className={`flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                          createLeadId === l.id ? "bg-indigo-50" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{l.label}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            Stage: {l.stage}
                            {l.primary_contact_value ? ` • ${l.primary_contact_value}` : ""}
                          </p>
                        </div>

                        {createLeadId === l.id && (
                          <span className="mt-1 inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            Selected
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700">Customer name</label>
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. ACME GmbH"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Email</label>
                  <input
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Phone</label>
                  <input
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="+49 …"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setCreatingCustomer(false)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createStripeCustomer}
                disabled={!createLeadId || creating}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating ? "Creating…" : "Create Customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link existing customer modal */}
      {linkingCustomer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">Link customer</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  {linkingCustomer.name || linkingCustomer.email || linkingCustomer.id}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Choose a lead to link this Stripe customer to.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setLinkingCustomer(null)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Search leads (optional)
                </label>
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Type a lead name, company, email…"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  This is only for the modal. Global search stays in the header.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Select Lead</label>

                <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                  {loadingLeads ? (
                    <div className="p-3 text-xs text-slate-500">Loading leads…</div>
                  ) : leads.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">No leads found.</div>
                  ) : (
                    leads.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLeadId(l.id)}
                        className={`flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                          selectedLeadId === l.id ? "bg-indigo-50" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{l.label}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            Stage: {l.stage}
                          </p>
                        </div>

                        {selectedLeadId === l.id && (
                          <span className="mt-1 inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            Selected
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setLinkingCustomer(null)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={linkCustomer}
                disabled={!selectedLeadId || savingLink}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingLink ? "Linking…" : "Link to lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
