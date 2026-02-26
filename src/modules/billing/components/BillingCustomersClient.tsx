"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  UserCircleIcon,
  LinkIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

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
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/** Small empty-state card (theme-aware) */
function EmptyState({
  variant,
  query,
  isDark,
}: {
  variant: "none" | "no_match";
  query?: string;
  isDark: boolean;
}) {
  if (variant === "no_match") {
    return (
      <div
        className={[
          "rounded-xl border p-6 text-sm",
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-400"
            : "border-slate-200 bg-white text-slate-500",
        ].join(" ")}
      >
        <p
          className={
            isDark
              ? "font-semibold text-slate-200"
              : "font-semibold text-slate-700"
          }
        >
          No customers match “{query}”.
        </p>
        <p className="mt-1">
          Try a different name, email, phone number, or Stripe customer id.
        </p>
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-xl border border-dashed p-6 text-sm",
        isDark
          ? "border-slate-700 bg-slate-950 text-slate-400"
          : "border-slate-300 bg-slate-50 text-slate-500",
      ].join(" ")}
    >
      <p>No customers yet.</p>
      <p className="mt-1">
        Click{" "}
        <span
          className={isDark ? "font-semibold text-slate-200" : "font-semibold"}
        >
          Refresh
        </span>{" "}
        to sync from Stripe, or remove the filter in the header search.
      </p>
    </div>
  );
}

export default function BillingCustomersClient({ q = "" }: { q?: string }) {
  const qNormalized = (typeof q === "string" ? q : "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Link existing customer -> lead
  const [linkingCustomer, setLinkingCustomer] = useState<CustomerRow | null>(
    null,
  );
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
  const filteredCreateLeadQuery = useMemo(
    () => createLeadQuery.trim(),
    [createLeadQuery],
  );

  // theme tokens
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50/50";
  const theadBg = isDark
    ? "bg-slate-900/40 text-slate-400"
    : "bg-slate-50 text-slate-500";
  const subHeadBorder = isDark ? "border-slate-800" : "border-slate-100";

  const inputBase = [
    "mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400/40"
      : "border-slate-200 bg-white text-slate-700 focus:ring-indigo-500",
  ].join(" ");

  async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("no_session");

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(input, { ...init, headers });
  }

  async function loadCustomers() {
    setLoading(true);
    setErr(null);

    try {
      const res = await authedFetch(
        `/api/billing/customers${
          qNormalized ? `?q=${encodeURIComponent(qNormalized)}` : ""
        }`,
        { cache: "no-store" },
      );

      const json = await res.json().catch(() => ({}));
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
        `/api/billing/customers/leads${
          forQuery ? `?q=${encodeURIComponent(forQuery)}` : ""
        }`,
        { cache: "no-store" },
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // lead search errors shouldn’t nuke the main list; show a soft error
        setLeads([]);
        setErr(json?.error ?? `leads_failed_${res.status}`);
        return;
      }

      setLeads((json?.leads ?? []) as LeadOption[]);
    } finally {
      setLoadingLeads(false);
    }
  }

  // ✅ Reload when q changes
  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qNormalized]);

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
    if (!lead) return;

    setCreateName((lead.label ?? "").trim());

    const type = (lead.primary_contact_type ?? "").toLowerCase().trim();
    const value = (lead.primary_contact_value ?? "").trim();

    setCreateEmail(type === "email" ? value : "");
    setCreatePhone(type === "phone" ? value : "");
  }

  async function linkCustomer() {
    if (!linkingCustomer || !selectedLeadId) return;
    setSavingLink(true);
    setErr(null);

    try {
      const res = await authedFetch("/api/billing/customers/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeCustomerId: linkingCustomer.id,
          leadId: selectedLeadId,
        }),
      });

      const json = await res.json().catch(() => ({}));
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

      const json = await res.json().catch(() => ({}));
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

      const json = await res.json().catch(() => ({}));
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

  const totalCount = rows.length;
  const visibleCount = rows.length;

  const refreshBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const linkBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const unlinkBtn = isDark
    ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header card */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${headText}`}>Customers</h1>
            <p className={`mt-1 max-w-2xl text-sm ${mutedText}`}>
              Stripe customers for your connected account. Use the header search
              to filter by name, email, phone, or ID.
            </p>

            {qNormalized ? (
              <p className={`mt-2 text-xs ${mutedText2}`}>
                Filter:{" "}
                <span
                  className={
                    isDark
                      ? "font-semibold text-slate-200"
                      : "font-semibold text-slate-700"
                  }
                >
                  “{qNormalized}”
                </span>
              </p>
            ) : (
              <p className={`mt-2 text-xs ${mutedText2}`}>No filter applied.</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCustomers}
              disabled={loading}
              className={[
                "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
                refreshBtn,
              ].join(" ")}
            >
              <ArrowPathIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
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

      {/* Table */}
      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div className={`border-b px-5 py-3 ${subHeadBorder}`}>
          <h2 className={`text-sm font-semibold ${headText}`}>
            Stripe customers
          </h2>
          <p className={`mt-0.5 text-xs ${mutedText2}`}>
            {loading
              ? "Loading…"
              : qNormalized
                ? `Showing ${visibleCount} customer(s) matching your filter`
                : `${totalCount} customer(s) shown`}
          </p>
        </div>

        {loading ? (
          <div className="p-5">
            <div className="space-y-3">
              <div
                className={[
                  "h-4 w-1/3 animate-pulse rounded",
                  isDark ? "bg-slate-800" : "bg-slate-200",
                ].join(" ")}
              />
              <div
                className={[
                  "h-4 w-2/3 animate-pulse rounded",
                  isDark ? "bg-slate-800" : "bg-slate-200",
                ].join(" ")}
              />
              <div
                className={[
                  "h-4 w-1/2 animate-pulse rounded",
                  isDark ? "bg-slate-800" : "bg-slate-200",
                ].join(" ")}
              />
            </div>
          </div>
        ) : totalCount === 0 ? (
          <div className="p-5">
            <EmptyState variant="none" isDark={isDark} />
          </div>
        ) : visibleCount === 0 ? (
          <div className="p-5">
            <EmptyState
              variant="no_match"
              query={qNormalized}
              isDark={isDark}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={theadBg}>
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold">Customer</th>
                  <th className="px-5 py-3 text-xs font-semibold">Created</th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    Payment method
                  </th>
                  <th className="px-5 py-3 text-xs font-semibold">
                    Linked lead
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className={`divide-y ${divider}`}>
                {rows.map((c) => {
                  const hasPm = !!c.invoice_settings?.default_payment_method;

                  return (
                    <tr
                      key={c.id}
                      className={[
                        rowHover,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={[
                              "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl",
                              isDark ? "bg-slate-900/50" : "bg-slate-100",
                            ].join(" ")}
                          >
                            <UserCircleIcon
                              className={[
                                "h-5 w-5",
                                isDark ? "text-slate-400" : "text-slate-500",
                              ].join(" ")}
                            />
                          </div>

                          <div className="min-w-0">
                            <p className={`truncate font-semibold ${headText}`}>
                              {c.name || c.email || c.id}
                            </p>
                            <p className={`truncate text-xs ${mutedText2}`}>
                              {c.email ?? "—"} {c.phone ? `• ${c.phone}` : ""}
                            </p>
                            <p
                              className={[
                                "truncate text-[11px]",
                                isDark ? "text-slate-500" : "text-slate-400",
                              ].join(" ")}
                            >
                              {c.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td
                        className={`px-5 py-4 ${isDark ? "text-slate-300" : "text-slate-700"}`}
                      >
                        {formatDate(c.created)}
                      </td>

                      <td className="px-5 py-4">
                        {hasPm ? (
                          <span
                            className={[
                              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                              isDark
                                ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
                                : "bg-emerald-50 text-emerald-700",
                            ].join(" ")}
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                            On file
                          </span>
                        ) : (
                          <span
                            className={[
                              "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                              isDark
                                ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
                                : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            None
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {c.linkedLeadId ? (
                          <div className="space-y-1">
                            <p className={`text-xs font-semibold ${headText}`}>
                              {c.linkedLeadLabel ?? "Linked lead"}
                            </p>
                          </div>
                        ) : (
                          <span className={`text-xs ${mutedText2}`}>
                            Not linked
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setLinkingCustomer(c)}
                            disabled={pendingRow === c.id}
                            className={[
                              "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed",
                              linkBtn,
                            ].join(" ")}
                          >
                            <LinkIcon className="h-4 w-4" />
                            {c.linkedLeadId ? "Change link" : "Link"}
                          </button>

                          {c.linkedLeadId && (
                            <button
                              type="button"
                              onClick={() => unlinkCustomer(c.id)}
                              disabled={pendingRow === c.id}
                              className={[
                                "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed",
                                unlinkBtn,
                              ].join(" ")}
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
        <div
          className={[
            "fixed inset-0 z-40 flex items-center justify-center p-4",
            isDark ? "bg-black/60" : "bg-slate-900/40",
          ].join(" ")}
        >
          <div
            className={`w-full max-w-xl rounded-2xl border shadow-xl ${card}`}
          >
            <div
              className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${border}`}
            >
              <div>
                <p className={`text-xs font-semibold ${mutedText2}`}>
                  Create Stripe customer
                </p>
                <h3 className={`mt-1 text-base font-semibold ${headText}`}>
                  New customer
                </h3>
                <p className={`mt-1 text-xs ${mutedText2}`}>
                  Create a customer in the connected Stripe account and link it
                  to a lead.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCreatingCustomer(false)}
                className={[
                  "cursor-pointer rounded-lg border p-2",
                  isDark
                    ? "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900/40"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  Find a Lead
                </label>
                <input
                  value={createLeadQuery}
                  onChange={(e) => setCreateLeadQuery(e.target.value)}
                  placeholder="Type lead name, email, phone…"
                  className={inputBase}
                />
                <p
                  className={`mt-1 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
                >
                  Selecting a lead will prefill name + primary email/phone.
                </p>
              </div>

              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  Select Lead
                </label>

                <div
                  className={`mt-1 max-h-48 overflow-y-auto rounded-xl border ${border}`}
                >
                  {loadingLeads ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      Loading leads…
                    </div>
                  ) : leads.length === 0 ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      No leads found.
                    </div>
                  ) : (
                    leads.map((l) => (
                      <button
                        key={`create-${l.id}`}
                        type="button"
                        onClick={() => {
                          setCreateLeadId(l.id);
                          applyLeadPrefill(l.id);
                        }}
                        className={[
                          "flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-2 text-left text-sm",
                          isDark
                            ? "hover:bg-slate-900/30"
                            : "hover:bg-slate-50",
                          createLeadId === l.id
                            ? isDark
                              ? "bg-indigo-500/10"
                              : "bg-indigo-50"
                            : "",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-semibold ${headText}`}
                          >
                            {l.label}
                          </p>
                          <p className={`truncate text-[11px] ${mutedText2}`}>
                            Stage: {l.stage}
                            {l.primary_contact_value
                              ? ` • ${l.primary_contact_value}`
                              : ""}
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
                  <label
                    className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    Customer name
                  </label>
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. ACME GmbH"
                    className={inputBase}
                  />
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    Email
                  </label>
                  <input
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="name@company.com"
                    className={inputBase}
                  />
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    Phone
                  </label>
                  <input
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="+49 …"
                    className={inputBase}
                  />
                </div>
              </div>
            </div>

            <div
              className={`flex items-center justify-end gap-2 border-t px-5 py-4 ${border}`}
            >
              <button
                type="button"
                onClick={() => setCreatingCustomer(false)}
                className={[
                  "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold",
                  isDark
                    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
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
        <div
          className={[
            "fixed inset-0 z-40 flex items-center justify-center p-4",
            isDark ? "bg-black/60" : "bg-slate-900/40",
          ].join(" ")}
        >
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-xl ${card}`}
          >
            <div
              className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${border}`}
            >
              <div>
                <p className={`text-xs font-semibold ${mutedText2}`}>
                  Link customer
                </p>
                <h3 className={`mt-1 text-base font-semibold ${headText}`}>
                  {linkingCustomer.name ||
                    linkingCustomer.email ||
                    linkingCustomer.id}
                </h3>
                <p className={`mt-1 text-xs ${mutedText2}`}>
                  Choose a lead to link this Stripe customer to.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setLinkingCustomer(null)}
                className={[
                  "cursor-pointer rounded-lg border p-2",
                  isDark
                    ? "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900/40"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  Search leads (optional)
                </label>
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Type a lead name, company, email…"
                  className={inputBase}
                />
                <p
                  className={`mt-1 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
                >
                  This is only for the modal. Global search stays in the header.
                </p>
              </div>

              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  Select Lead
                </label>

                <div
                  className={`mt-1 max-h-56 overflow-y-auto rounded-xl border ${border}`}
                >
                  {loadingLeads ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      Loading leads…
                    </div>
                  ) : leads.length === 0 ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      No leads found.
                    </div>
                  ) : (
                    leads.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLeadId(l.id)}
                        className={[
                          "flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-2 text-left text-sm",
                          isDark
                            ? "hover:bg-slate-900/30"
                            : "hover:bg-slate-50",
                          selectedLeadId === l.id
                            ? isDark
                              ? "bg-indigo-500/10"
                              : "bg-indigo-50"
                            : "",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-semibold ${headText}`}
                          >
                            {l.label}
                          </p>
                          <p className={`truncate text-[11px] ${mutedText2}`}>
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

            <div
              className={`flex items-center justify-end gap-2 border-t px-5 py-4 ${border}`}
            >
              <button
                type="button"
                onClick={() => setLinkingCustomer(null)}
                className={[
                  "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold",
                  isDark
                    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
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
