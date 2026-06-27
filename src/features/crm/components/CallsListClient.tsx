// src/features/crm/components/CallsListClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { PencilSquareIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  getAttendanceStatusLabel,
  getAttendanceStatusTone,
  normalizeAttendanceStatus,
} from "@/i18n/domain-values";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

type OutcomeRow = {
  attended_status: string | null;
  offer_made: boolean | null;
  closed_on_call: boolean | null;
  offer_product_id?: string | null;
};

type BookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  booking_outcomes?: OutcomeRow[] | OutcomeRow | null;
};

const COL_CLASSES = [
  "w-[20%]",
  "w-[20%]",
  "w-[16%]",
  "w-[12%]",
  "w-[12%]",
  "w-[15%]",
  "w-[2.5%]",
  "w-[2.5%]",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string) {
  return UUID_RE.test(v);
}

function isStripeProductId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id);
}

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function pickOutcome(b: BookingRow): OutcomeRow | null {
  const raw: any = (b as any)?.booking_outcomes;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "object") return raw as OutcomeRow;
  return null;
}

function statusPill(status: string, isDark: boolean) {
  return getAttendanceStatusTone(status, isDark);
}

function yesNoPill(isYes: boolean, isDark: boolean) {
  if (isDark) {
    return isYes
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
      : "bg-rose-500/15 text-rose-200 ring-rose-400/30";
  }

  return isYes
    ? "bg-emerald-50/60 text-emerald-700 ring-emerald-200"
    : "bg-rose-50/60 text-rose-700 ring-rose-200";
}

function productPill(isDark: boolean) {
  return isDark
    ? "bg-indigo-500/15 text-indigo-200 ring-indigo-400/30"
    : "bg-indigo-50 text-indigo-700 ring-indigo-200";
}

function productMissingPill(isDark: boolean) {
  return isDark
    ? "bg-slate-500/15 text-slate-200 ring-slate-400/25"
    : "bg-slate-100 text-slate-700 ring-slate-200";
}

async function crmLocaleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocaleHeader(init?.headers),
  });
}

/* -------------------- loading UI (theme-aware) -------------------- */

function CallsLoadingState({
  isDark,
  t,
  common,
}: {
  isDark: boolean;
  t: (key: string) => string;
  common: (key: string) => string;
}) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headBg = isDark ? "bg-slate-900/40" : "bg-slate-50";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const rowDiv = isDark ? "divide-slate-800" : "divide-slate-100";
  const sk = isDark ? "bg-slate-800" : "bg-slate-100";
  const sk2 = isDark ? "bg-slate-700/70" : "bg-slate-200/70";
  const tfoot = isDark ? "bg-slate-950" : "bg-white";

  const headers = [
    t("table.date"),
    t("table.time"),
    t("table.attendance"),
    t("table.offer"),
    t("table.closed"),
    t("table.productService"),
    common("actions.view"),
    common("actions.edit"),
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <div className={`rounded-2xl border p-5 shadow-sm ${card}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className={`h-6 w-40 rounded animate-pulse ${sk}`} />
            <div className={`mt-2 h-4 w-64 rounded animate-pulse ${sk}`} />
          </div>
          <div className={`h-9 w-20 rounded-lg animate-pulse ${sk}`} />
        </div>
      </div>

      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-sm">
            <colgroup>
              {COL_CLASSES.map((cls, i) => (
                <col key={i} className={cls} />
              ))}
            </colgroup>

            <thead className={headBg}>
              <tr className="text-left">
                {headers.map((h) => (
                  <th
                    key={h}
                    className={[
                      `border-b px-4 py-3 text-xs font-semibold ${
                        isDark ? "text-slate-300" : "text-slate-600"
                      } ${border}`,
                      h === common("actions.view") ||
                      h === common("actions.edit")
                        ? "text-center px-2"
                        : "",
                    ].join(" ")}
                  >
                    <div
                      className={`h-3 w-16 rounded animate-pulse mx-auto ${sk2}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className={`divide-y ${rowDiv}`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={isDark ? "bg-slate-950" : "bg-white"}>
                  <td className="px-4 py-3">
                    <div className={`h-4 w-28 rounded animate-pulse ${sk}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className={`h-4 w-36 rounded animate-pulse ${sk}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`h-5 w-24 rounded-full animate-pulse ${sk}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`h-5 w-16 rounded-full animate-pulse ${sk}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`h-5 w-16 rounded-full animate-pulse ${sk}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className={`h-4 w-40 rounded animate-pulse ${sk}`} />
                  </td>
                  <td className="px-2 py-3">
                    <div
                      className={`mx-auto h-6 w-6 rounded animate-pulse ${sk}`}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div
                      className={`mx-auto h-6 w-6 rounded animate-pulse ${sk}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td
                  colSpan={8}
                  className={`border-t px-4 py-3 ${border} ${tfoot}`}
                >
                  <div className={`h-3 w-80 rounded animate-pulse ${sk}`} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductBadgeLoading({ isDark }: { isDark: boolean }) {
  return (
    <span
      aria-label="Loading product"
      className={[
        "inline-flex max-w-full items-center gap-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
        productPill(isDark),
      ].join(" ")}
    >
      <span
        className={[
          "h-2 w-2 rounded-full animate-pulse",
          isDark ? "bg-indigo-300/40" : "bg-indigo-200",
        ].join(" ")}
      />
      <span
        className={[
          "h-3 w-28 rounded animate-pulse",
          isDark ? "bg-indigo-300/25" : "bg-indigo-200/70",
        ].join(" ")}
      />
    </span>
  );
}

export default function CallsListClient({ leadId }: { leadId?: string }) {
  const t = useTranslations("CallsListPage");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");

  const router = useRouter();
  const searchParams = useSearchParams();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<BookingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [teamId, setTeamId] = useState<string | null>(null);

  const viewerTz = useMemo(readBrowserTimeZone, []);
  const normalizedLeadId = useMemo(
    () => decodeURIComponent(String(leadId ?? "")).trim(),
    [leadId],
  );

  const [productLabels, setProductLabels] = useState<Record<string, string>>(
    {},
  );
  const [productsResolving, setProductsResolving] = useState(false);

  const qRaw = searchParams.get("q") ?? "";
  const q = qRaw.toLowerCase();

  function attendanceLabel(status: string) {
    return getAttendanceStatusLabel(tDomain, normalizeAttendanceStatus(status));
  }

  async function fetchStripeProductLabels(
    ids: string[],
  ): Promise<Record<string, string>> {
    const uniq = Array.from(
      new Set(
        ids
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .filter(isStripeProductId),
      ),
    );
    if (!uniq.length || !teamId) return {};

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return {};

    const res = await crmLocaleFetch("/api/billing/products/labels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-team-id": teamId,
      },
      body: JSON.stringify({ ids: uniq }),
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);
    const labels = res.ok ? json?.labels : null;
    if (!labels || typeof labels !== "object") return {};

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) {
      const name = String(v ?? "").trim();
      if (name) out[String(k)] = name;
    }
    return out;
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (
          !normalizedLeadId ||
          normalizedLeadId === "undefined" ||
          normalizedLeadId === "null"
        ) {
          setErr(t("errors.missingLeadId"));
          return;
        }
        if (!isUuid(normalizedLeadId)) {
          setErr(t("errors.invalidLeadId"));
          return;
        }

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) {
          setErr(t("errors.notSignedIn"));
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .maybeSingle();

        const tId = String(profile?.team_id ?? "").trim();
        if (!tId) {
          setErr(t("errors.noTeam"));
          return;
        }
        if (!cancelled) setTeamId(tId);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setErr(t("errors.missingSessionToken"));
          return;
        }

        const res = await crmLocaleFetch(
          `/api/crm/leads/${encodeURIComponent(normalizedLeadId)}/calls?teamId=${encodeURIComponent(tId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );

        const json = await res.json().catch(() => null);
        if (!res.ok)
          throw new Error(json?.error || `load_failed_${res.status}`);

        if (!cancelled) setCalls((json?.calls ?? []) as BookingRow[]);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? t("errors.loadFailed")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedLeadId, t]);

  const rows = useMemo(() => {
    return (calls ?? [])
      .map((c) => {
        const outcome = pickOutcome(c);

        const start = DateTime.fromISO(c.start_at, { setZone: true }).setZone(
          viewerTz,
        );
        const end = DateTime.fromISO(c.end_at, { setZone: true }).setZone(
          viewerTz,
        );

        const dateLabel = start.isValid
          ? start.toLocaleString(DateTime.DATE_MED)
          : c.start_at;
        const timeLabel =
          start.isValid && end.isValid
            ? `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`
            : "—";

        const attendedRaw = normalizeAttendanceStatus(
          outcome?.attended_status ?? "unknown",
        );
        const offerMade = !!outcome?.offer_made;
        const closed = !!outcome?.closed_on_call;

        const offerProductId = String(outcome?.offer_product_id ?? "").trim();

        return {
          id: c.id,
          dateLabel,
          timeLabel,
          attendedRaw,
          attendedLabel: attendanceLabel(attendedRaw),
          offerMade,
          offerProductId: offerProductId || null,
          closed,
          startMillis: start.isValid ? start.toMillis() : 0,
        };
      })
      .sort((a, b) => b.startMillis - a.startMillis);
  }, [calls, viewerTz, tDomain]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const productLabel =
        r.offerMade && r.offerProductId
          ? String(productLabels[r.offerProductId] ?? "").toLowerCase()
          : "";

      const haystack = [
        r.dateLabel,
        r.timeLabel,
        r.attendedLabel,
        r.attendedRaw,
        r.offerMade ? common("common.yes") : common("common.no"),
        r.closed ? common("common.yes") : common("common.no"),
        productLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [rows, q, productLabels, common]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!teamId) return;

      const ids = rows
        .filter((r) => r.offerMade && r.offerProductId)
        .map((r) => r.offerProductId as string)
        .filter(isStripeProductId);

      const uniq = Array.from(new Set(ids));
      if (!uniq.length) return;

      const missing = uniq.filter((id) => !productLabels[id]);
      if (!missing.length) return;

      try {
        setProductsResolving(true);
        const map = await fetchStripeProductLabels(missing);
        if (!cancelled && map && Object.keys(map).length) {
          setProductLabels((prev) => ({ ...prev, ...map }));
        }
      } finally {
        if (!cancelled) setProductsResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, productLabels, teamId]);

  if (loading) {
    return <CallsLoadingState isDark={isDark} t={t} common={common} />;
  }
  if (err)
    return (
      <p
        className={["text-sm", isDark ? "text-rose-300" : "text-rose-600"].join(
          " ",
        )}
      >
        {err}
      </p>
    );

  const showRows = filteredRows;

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headerBg = isDark ? "bg-slate-950" : "bg-white";
  const tableHead = isDark ? "bg-slate-900/40" : "bg-slate-50";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const hoverRow = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50/70";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const bodyText = isDark ? "text-slate-200" : "text-slate-700";
  const thText = isDark ? "text-slate-300" : "text-slate-600";
  const dashText = isDark ? "text-slate-500" : "text-slate-400";

  const backBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div
      className={`max-w-5xl space-y-4 ${isDark ? "text-slate-200" : "text-slate-800"}`}
    >
      <div className={`rounded-2xl border p-5 shadow-sm ${card} ${headerBg}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className={`text-xl font-semibold ${titleText}`}>
              {t("page.title")}
            </h1>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {qRaw.trim().length === 0
                ? t("page.description")
                : t("page.filteredDescription", {
                    shown: showRows.length,
                    total: rows.length,
                  })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                router.push(`/leads/${encodeURIComponent(normalizedLeadId)}`)
              }
              className={[
                "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm",
                backBtn,
              ].join(" ")}
            >
              {t("actions.backToLead")}
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          className={[
            "rounded-2xl border border-dashed p-6 text-sm",
            isDark
              ? "border-slate-700 bg-slate-950 text-slate-400"
              : "border-slate-300 bg-white text-slate-500",
          ].join(" ")}
        >
          {t("states.noCalls")}
        </div>
      ) : showRows.length === 0 ? (
        <div
          className={[
            "rounded-2xl border border-dashed p-6 text-sm",
            isDark
              ? "border-slate-700 bg-slate-950 text-slate-300"
              : "border-slate-300 bg-white text-slate-600",
          ].join(" ")}
        >
          <div className={`font-semibold ${titleText}`}>
            {t("states.noMatches")}
          </div>
          <div className={`mt-1 text-xs ${mutedText}`}>
            {t("states.tryDifferentSearch.before")}{" "}
            <span
              className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              {t("searchExamples.attended")}
            </span>
            ,{" "}
            <span
              className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              {t("searchExamples.noShow")}
            </span>
            ,{" "}
            <span
              className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              {common("common.yes")}
            </span>
            , {t("states.tryDifferentSearch.after")}
          </div>
        </div>
      ) : (
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-sm">
              <colgroup>
                {COL_CLASSES.map((cls, i) => (
                  <col key={i} className={cls} />
                ))}
              </colgroup>

              <thead className={tableHead}>
                <tr className="text-left">
                  <th
                    className={`border-b px-4 py-3 text-xs font-semibold ${thText} ${border}`}
                  >
                    {t("table.date")}
                  </th>
                  <th
                    className={`border-b px-4 py-3 text-xs font-semibold ${thText} ${border}`}
                  >
                    {t("table.time")}
                  </th>
                  <th
                    className={`border-b px-4 py-3 text-xs font-semibold ${thText} ${border}`}
                  >
                    {t("table.attendance")}
                  </th>
                  <th
                    className={`border-b px-4 py-3 text-xs font-semibold ${thText} ${border}`}
                  >
                    {t("table.offer")}
                  </th>
                  <th
                    className={`border-b px-4 py-3 text-xs font-semibold ${thText} ${border}`}
                  >
                    {t("table.closed")}
                  </th>
                  <th
                    className={`border-b px-4 py-3 text-xs font-semibold ${thText} ${border}`}
                  >
                    {t("table.productService")}
                  </th>
                  <th
                    className={`border-b px-2 py-3 text-xs font-semibold ${thText} ${border} text-center`}
                  >
                    {common("actions.view")}
                  </th>
                  <th
                    className={`border-b px-2 py-3 text-xs font-semibold ${thText} ${border} text-center`}
                  >
                    {common("actions.edit")}
                  </th>
                </tr>
              </thead>

              <tbody className={`divide-y ${divider}`}>
                {showRows.map((r) => {
                  const shouldShowProduct = r.offerMade && !!r.offerProductId;
                  const label = shouldShowProduct
                    ? productLabels[r.offerProductId as string]
                    : null;

                  return (
                    <tr
                      key={r.id}
                      className={[
                        hoverRow,
                        isDark ? "bg-slate-950" : "bg-white",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3">
                        <div className={`font-semibold truncate ${titleText}`}>
                          {r.dateLabel}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className={`truncate ${bodyText}`}>
                          {r.timeLabel}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(
                            r.attendedRaw,
                            isDark,
                          )}`}
                        >
                          {r.attendedLabel}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${yesNoPill(
                            r.offerMade,
                            isDark,
                          )}`}
                        >
                          {r.offerMade
                            ? common("common.yes")
                            : common("common.no")}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${yesNoPill(
                            r.closed,
                            isDark,
                          )}`}
                        >
                          {r.closed
                            ? common("common.yes")
                            : common("common.no")}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {shouldShowProduct ? (
                          label ? (
                            <span
                              className={[
                                "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 truncate",
                                isDark
                                  ? "bg-indigo-500/10 text-indigo-200 ring-indigo-400/30"
                                  : "bg-indigo-50 text-indigo-700 ring-indigo-200",
                              ].join(" ")}
                            >
                              {label}
                            </span>
                          ) : productsResolving ? (
                            <ProductBadgeLoading isDark={isDark} />
                          ) : (
                            <span
                              className={[
                                "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 truncate",
                                productMissingPill(isDark),
                              ].join(" ")}
                            >
                              {t("product.notFound")}
                            </span>
                          )
                        ) : (
                          <span className={dashText}>—</span>
                        )}
                      </td>

                      <td className="px-2 py-3">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/leads/${encodeURIComponent(
                                  normalizedLeadId,
                                )}/calls/${encodeURIComponent(r.id)}/view`,
                              )
                            }
                            className={[
                              "inline-flex p-1 transition-colors cursor-pointer",
                              isDark
                                ? "text-slate-300 hover:text-slate-100"
                                : "!text-slate-600 hover:!text-slate-800",
                            ].join(" ")}
                            title={t("actions.viewCallDetails")}
                            aria-label={t("actions.viewCallDetails")}
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>

                      <td className="px-2 py-3">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/leads/${encodeURIComponent(
                                  normalizedLeadId,
                                )}/calls/${encodeURIComponent(r.id)}`,
                              )
                            }
                            className={[
                              "inline-flex p-1 transition-colors cursor-pointer",
                              isDark
                                ? "text-indigo-300 hover:text-indigo-200"
                                : "!text-indigo-600 hover:!text-indigo-700",
                            ].join(" ")}
                            title={t("actions.editCallTracking")}
                            aria-label={t("actions.editCallTracking")}
                          >
                            <PencilSquareIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className={[
              "border-t px-4 py-3 text-xs",
              border,
              isDark
                ? "bg-slate-950 text-slate-400"
                : "bg-white text-slate-500",
            ].join(" ")}
          >
            {t.rich("footer.help", {
              view: (chunks) => (
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
              edit: (chunks) => (
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
          </div>
        </div>
      )}
    </div>
  );
}
