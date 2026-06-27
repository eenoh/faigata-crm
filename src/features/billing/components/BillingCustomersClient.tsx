"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  BILLING_SESSION_EXPIRED_MESSAGE,
  readBillingApiErrorMessage,
} from "@/features/billing/components/errorMessages";
import {
  UserCircleIcon,
  LinkIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";

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

async function readApiError(res: Response, fallback: string): Promise<string> {
  return readBillingApiErrorMessage(res, fallback);
}

function formatDate(unixSeconds: number, locale?: string) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function SkeletonBlock({
  isDark,
  className = "",
}: {
  isDark: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={[
        "animate-pulse rounded-lg",
        isDark ? "bg-slate-800/70" : "bg-slate-200/80",
        className,
      ].join(" ")}
    />
  );
}

function BillingCustomersLoading({
  isDark,
  t,
}: {
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"BillingCustomersPage">>;
}) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const headerRow = isDark
    ? "border-slate-800 bg-slate-900/40"
    : "border-slate-100 bg-slate-50";
  const rowBg = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SkeletonBlock isDark={isDark} className="h-7 w-40" />
            <SkeletonBlock
              isDark={isDark}
              className="mt-2 h-4 w-full max-w-2xl"
            />
            <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-48" />
          </div>

          <div className="flex items-center gap-2">
            <SkeletonBlock isDark={isDark} className="h-9 w-28 rounded-lg" />
            <SkeletonBlock isDark={isDark} className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div
          className={`border-b px-5 py-3 ${isDark ? "border-slate-800" : "border-slate-100"}`}
        >
          <SkeletonBlock isDark={isDark} className="h-4 w-32" />
          <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-40" />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className={headerRow}>
              <tr>
                <th className="px-5 py-3">
                  <SkeletonBlock isDark={isDark} className="h-3 w-20" />
                </th>
                <th className="px-5 py-3">
                  <SkeletonBlock isDark={isDark} className="h-3 w-16" />
                </th>
                <th className="px-5 py-3">
                  <SkeletonBlock isDark={isDark} className="h-3 w-28" />
                </th>
                <th className="px-5 py-3">
                  <SkeletonBlock isDark={isDark} className="h-3 w-20" />
                </th>
                <th className="px-5 py-3 text-right">
                  <SkeletonBlock isDark={isDark} className="ml-auto h-3 w-16" />
                </th>
              </tr>
            </thead>

            <tbody
              className={
                isDark
                  ? "divide-y divide-slate-800"
                  : "divide-y divide-slate-100"
              }
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className={rowBg}>
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <SkeletonBlock
                        isDark={isDark}
                        className="h-9 w-9 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <SkeletonBlock isDark={isDark} className="h-4 w-40" />
                        <SkeletonBlock
                          isDark={isDark}
                          className="mt-2 h-3 w-56 max-w-full"
                        />
                        <SkeletonBlock
                          isDark={isDark}
                          className="mt-2 h-3 w-28"
                        />
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <SkeletonBlock isDark={isDark} className="h-4 w-24" />
                  </td>

                  <td className="px-5 py-4">
                    <SkeletonBlock
                      isDark={isDark}
                      className="h-6 w-20 rounded-full"
                    />
                  </td>

                  <td className="px-5 py-4">
                    <SkeletonBlock isDark={isDark} className="h-4 w-28" />
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <SkeletonBlock
                        isDark={isDark}
                        className="h-8 w-24 rounded-lg"
                      />
                      <SkeletonBlock
                        isDark={isDark}
                        className="h-8 w-20 rounded-lg"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sr-only">{t("table.loading")}</div>
      </div>
    </div>
  );
}

function EmptyState({
  variant,
  query,
  isDark,
  t,
}: {
  variant: "none" | "no_match";
  query?: string;
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"BillingCustomersPage">>;
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
          {t("empty.noMatch.title", { query: query ?? "" })}
        </p>
        <p className="mt-1">{t("empty.noMatch.description")}</p>
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
      <p
        className={
          isDark
            ? "font-semibold text-slate-200"
            : "font-semibold text-slate-700"
        }
      >
        {t("empty.none.title")}
      </p>
      <p className="mt-1">
        {t.rich("empty.none.description", {
          newCustomer: (chunks) => (
            <span
              className={isDark ? "font-semibold text-white" : "font-semibold"}
            >
              {chunks}
            </span>
          ),
          refresh: (chunks) => (
            <span
              className={isDark ? "font-semibold text-white" : "font-semibold"}
            >
              {chunks}
            </span>
          ),
        })}
      </p>
    </div>
  );
}

export default function BillingCustomersClient({ q = "" }: { q?: string }) {
  const t = useTranslations("BillingCustomersPage");
  const billing = useTranslations("BillingCommon");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");
  const locale = useLocale();
  const qNormalized = (typeof q === "string" ? q : "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [linkingCustomer, setLinkingCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [savingLink, setSavingLink] = useState(false);

  const [pendingRow, setPendingRow] = useState<string | null>(null);

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

  async function loadCustomers() {
    setLoading(true);
    setErr(null);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/customers${
          qNormalized ? `?q=${encodeURIComponent(qNormalized)}` : ""
        }`,
        locale,
      );

      if (!res.ok) {
        const message = await readApiError(res, `failed_${res.status}`);
        setErr(message);
        setRows([]);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as {
        customers?: CustomerRow[];
      };

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
    setErr(null);

    try {
      const res = await billingAuthedFetch(
        `/api/billing/customers/leads${
          forQuery ? `?q=${encodeURIComponent(forQuery)}` : ""
        }`,
        locale,
      );

      if (!res.ok) {
        const message = await readApiError(res, `leads_failed_${res.status}`);
        setLeads([]);
        setErr(message);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as {
        leads?: LeadOption[];
      };

      setLeads((json?.leads ?? []) as LeadOption[]);
    } finally {
      setLoadingLeads(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qNormalized, locale]);

  useEffect(() => {
    if (!linkingCustomer) return;
    loadLeads("");
    setLeadQuery("");
    setSelectedLeadId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingCustomer?.id, locale]);

  useEffect(() => {
    if (!linkingCustomer) return;
    const handle = window.setTimeout(() => {
      loadLeads(filteredLeadQuery);
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeadQuery, linkingCustomer?.id, locale]);

  useEffect(() => {
    if (!creatingCustomer) return;
    loadLeads("");
    setCreateLeadId("");
    setCreateLeadQuery("");
    setCreateName("");
    setCreateEmail("");
    setCreatePhone("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatingCustomer, locale]);

  useEffect(() => {
    if (!creatingCustomer) return;
    const handle = window.setTimeout(() => {
      loadLeads(filteredCreateLeadQuery);
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCreateLeadQuery, creatingCustomer, locale]);

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
      const res = await billingAuthedFetch(
        "/api/billing/customers/link",
        locale,
        {
          method: "POST",
          body: JSON.stringify({
            stripeCustomerId: linkingCustomer.id,
            leadId: selectedLeadId,
          }),
        },
      );

      if (!res.ok) {
        const message = await readApiError(res, `link_failed_${res.status}`);
        setErr(message);
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
      const res = await billingAuthedFetch(
        "/api/billing/customers/unlink",
        locale,
        {
          method: "POST",
          body: JSON.stringify({ stripeCustomerId: customerId }),
        },
      );

      if (!res.ok) {
        const message = await readApiError(res, `unlink_failed_${res.status}`);
        setErr(message);
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
      const res = await billingAuthedFetch(
        "/api/billing/customers/create",
        locale,
        {
          method: "POST",
          body: JSON.stringify({
            leadId: createLeadId,
            name: createName,
            email: createEmail,
            phone: createPhone,
          }),
        },
      );

      if (!res.ok) {
        const message = await readApiError(res, `create_failed_${res.status}`);
        setErr(message);
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

  const createdLabel = (unixSeconds: number) => formatDate(unixSeconds, locale);

  return (
    <div className="max-w-6xl space-y-6">
      {loading ? (
        <BillingCustomersLoading isDark={isDark} t={t} />
      ) : (
        <>
          <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className={`text-2xl font-semibold ${headText}`}>
                  {t("page.title")}
                </h1>
                <p className={`mt-1 max-w-2xl text-sm ${mutedText}`}>
                  {t("page.description")}
                </p>

                {qNormalized ? (
                  <p className={`mt-2 text-xs ${mutedText2}`}>
                    {t.rich("page.filterApplied", {
                      query: qNormalized,
                      strong: (chunks) => (
                        <span
                          className={
                            isDark
                              ? "font-semibold text-slate-200"
                              : "font-semibold text-slate-700"
                          }
                        >
                          {chunks}
                        </span>
                      ),
                    })}
                  </p>
                ) : (
                  <p className={`mt-2 text-xs ${mutedText2}`}>
                    {t("page.noFilter")}
                  </p>
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
                  {common("actions.refresh")}
                </button>

                <button
                  type="button"
                  onClick={() => setCreatingCustomer(true)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t("actions.newCustomer")}
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
                  {billing("errors.prefix")}: {err}
                </div>
              </div>
            )}
          </div>

          <div
            className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}
          >
            <div className={`border-b px-5 py-3 ${subHeadBorder}`}>
              <h2 className={`text-sm font-semibold ${headText}`}>
                {t("table.title")}
              </h2>
              <p className={`mt-0.5 text-xs ${mutedText2}`}>
                {qNormalized
                  ? t("table.filteredCount", { count: visibleCount })
                  : t("table.totalCount", { count: totalCount })}
              </p>
            </div>

            {totalCount === 0 ? (
              <div className="p-5">
                <EmptyState variant="none" isDark={isDark} t={t} />
              </div>
            ) : visibleCount === 0 ? (
              <div className="p-5">
                <EmptyState
                  variant="no_match"
                  query={qNormalized}
                  isDark={isDark}
                  t={t}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className={theadBg}>
                    <tr>
                      <th className="px-5 py-3 text-xs font-semibold">
                        {t("table.columns.customer")}
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold">
                        {t("table.columns.created")}
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold">
                        {t("table.columns.paymentMethod")}
                      </th>
                      <th className="px-5 py-3 text-xs font-semibold">
                        {t("table.columns.linkedLead")}
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold">
                        {t("table.columns.actions")}
                      </th>
                    </tr>
                  </thead>

                  <tbody className={`divide-y ${divider}`}>
                    {rows.map((c) => {
                      const hasPm =
                        !!c.invoice_settings?.default_payment_method;

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
                                    isDark
                                      ? "text-slate-400"
                                      : "text-slate-500",
                                  ].join(" ")}
                                />
                              </div>

                              <div className="min-w-0">
                                <p
                                  className={`truncate font-semibold ${headText}`}
                                >
                                  {c.name || c.email || c.id}
                                </p>
                                <p className={`truncate text-xs ${mutedText2}`}>
                                  {c.email ?? tDomain("fallbacks.empty")}{" "}
                                  {c.phone ? `• ${c.phone}` : ""}
                                </p>
                                <p
                                  className={[
                                    "truncate text-[11px]",
                                    isDark
                                      ? "text-slate-500"
                                      : "text-slate-400",
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
                            {createdLabel(c.created)}
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
                                {t("paymentMethod.onFile")}
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
                                {t("paymentMethod.none")}
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {c.linkedLeadId ? (
                              <div className="space-y-1">
                                <p
                                  className={`text-xs font-semibold ${headText}`}
                                >
                                  {c.linkedLeadLabel ??
                                    t("linkedLead.linkedLead")}
                                </p>
                              </div>
                            ) : (
                              <span className={`text-xs ${mutedText2}`}>
                                {t("linkedLead.notLinked")}
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
                                {c.linkedLeadId
                                  ? t("actions.changeLink")
                                  : t("actions.link")}
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
                                  {t("actions.unlink")}
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
        </>
      )}

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
                  {t("createModal.eyebrow")}
                </p>
                <h3 className={`mt-1 text-base font-semibold ${headText}`}>
                  {t("createModal.title")}
                </h3>
                <p className={`mt-1 text-xs ${mutedText2}`}>
                  {t("createModal.description")}
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
                  {t("createModal.fields.findLead")}
                </label>
                <input
                  value={createLeadQuery}
                  onChange={(e) => setCreateLeadQuery(e.target.value)}
                  placeholder={t("createModal.placeholders.findLead")}
                  className={inputBase}
                />
                <p
                  className={`mt-1 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
                >
                  {t("createModal.help.prefill")}
                </p>
              </div>

              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  {t("createModal.fields.selectLead")}
                </label>

                <div
                  className={`mt-1 max-h-48 overflow-y-auto rounded-xl border ${border}`}
                >
                  {loadingLeads ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      {t("leadSearch.loading")}
                    </div>
                  ) : leads.length === 0 ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      {t("leadSearch.none")}
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
                            {t("leadSearch.stage", { stage: l.stage })}
                            {l.primary_contact_value
                              ? ` • ${l.primary_contact_value}`
                              : ""}
                          </p>
                        </div>

                        {createLeadId === l.id && (
                          <span className="mt-1 inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {t("leadSearch.selected")}
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
                    {t("createModal.fields.customerName")}
                  </label>
                  <input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={t("createModal.placeholders.customerName")}
                    className={inputBase}
                  />
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    {common("fields.email")}
                  </label>
                  <input
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder={t("createModal.placeholders.email")}
                    className={inputBase}
                  />
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    {billing("fields.phone")}
                  </label>
                  <input
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder={t("createModal.placeholders.phone")}
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
                {common("actions.cancel")}
              </button>

              <button
                type="button"
                onClick={createStripeCustomer}
                disabled={!createLeadId || creating}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating
                  ? billing("actions.creating")
                  : t("actions.createCustomer")}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  {t("linkModal.eyebrow")}
                </p>
                <h3 className={`mt-1 text-base font-semibold ${headText}`}>
                  {linkingCustomer.name ||
                    linkingCustomer.email ||
                    linkingCustomer.id}
                </h3>
                <p className={`mt-1 text-xs ${mutedText2}`}>
                  {t("linkModal.description")}
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
                  {t("linkModal.fields.searchLeads")}
                </label>
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder={t("linkModal.placeholders.searchLeads")}
                  className={inputBase}
                />
                <p
                  className={`mt-1 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
                >
                  {t("linkModal.help.search")}
                </p>
              </div>

              <div>
                <label
                  className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  {t("linkModal.fields.selectLead")}
                </label>

                <div
                  className={`mt-1 max-h-56 overflow-y-auto rounded-xl border ${border}`}
                >
                  {loadingLeads ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      {t("leadSearch.loading")}
                    </div>
                  ) : leads.length === 0 ? (
                    <div className={`p-3 text-xs ${mutedText2}`}>
                      {t("leadSearch.none")}
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
                            {t("leadSearch.stage", { stage: l.stage })}
                          </p>
                        </div>

                        {selectedLeadId === l.id && (
                          <span className="mt-1 inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {t("leadSearch.selected")}
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
                {common("actions.cancel")}
              </button>

              <button
                type="button"
                onClick={linkCustomer}
                disabled={!selectedLeadId || savingLink}
                className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingLink ? t("actions.linking") : t("actions.linkToLead")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
