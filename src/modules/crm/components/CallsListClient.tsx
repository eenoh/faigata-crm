// src/modules/crm/components/CallsListClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { PencilSquareIcon, EyeIcon } from "@heroicons/react/24/outline";

type OutcomeRow = {
  attended_status: string | null;
  offer_made: boolean | null;
  closed_on_call: boolean | null;
  offer_product_id?: string | null;
};

// ⚠️ booking_outcomes can come back as array OR object depending on select / relationship shape
type BookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  booking_outcomes?: OutcomeRow[] | OutcomeRow | null;
};

function isStripeProductId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id);
}

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// normalize outcomes whether API returns array/object/null
function pickOutcome(b: BookingRow): OutcomeRow | null {
  const raw: any = (b as any)?.booking_outcomes;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "object") return raw as OutcomeRow;
  return null;
}

function toLabel(s: string) {
  const v = (s || "unknown").toLowerCase().replace(/_/g, " ");
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function statusPill(status: string) {
  const s = (status || "unknown").toLowerCase();
  if (s === "attended") return "bg-emerald-50/60 text-emerald-700 ring-emerald-200";
  if (s === "no_show") return "bg-rose-50/60 text-rose-700 ring-rose-200";
  if (s === "cancelled") return "bg-slate-100/70 text-slate-700 ring-slate-200";
  if (s === "rescheduled") return "bg-amber-50/60 text-amber-800 ring-amber-200";
  return "bg-slate-100/70 text-slate-700 ring-slate-200";
}

// Transparent, color-coded Yes/No (green for Yes, red for No)
function yesNoPill(isYes: boolean) {
  return isYes
    ? "bg-emerald-50/60 text-emerald-700 ring-emerald-200"
    : "bg-rose-50/60 text-rose-700 ring-rose-200";
}

/**
 * ✅ IMPORTANT (fixes hydration error):
 * Never put literal whitespace / {" "} / comments inside <colgroup>.
 * We render <col> via map to guarantee there are NO text nodes.
 */
const COL_CLASSES = [
  "w-[20%]", // Date
  "w-[20%]", // Time
  "w-[16%]", // Attendance
  "w-[12%]", // Offer
  "w-[12%]", // Closed
  "w-[15%]", // Product/Service
  "w-[2.5%]", // View
  "w-[2.5%]", // Edit
] as const;

/* -------------------- Loading UI -------------------- */

function CallsLoadingState() {
  return (
    <div className="max-w-5xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="h-6 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="mt-2 h-4 w-64 rounded bg-slate-100 animate-pulse" />
          </div>
          <div className="h-9 w-20 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse text-sm">
            <colgroup>
              {COL_CLASSES.map((cls, i) => (
                <col key={i} className={cls} />
              ))}
            </colgroup>

            <thead className="bg-slate-50">
              <tr className="text-left">
                {["Date", "Time", "Attendance", "Offer", "Closed", "Product/Service", "View", "Edit"].map((h) => (
                  <th
                    key={h}
                    className={[
                      "border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600",
                      h === "View" || h === "Edit" ? "text-center px-2" : "",
                    ].join(" ")}
                  >
                    <div className="h-3 w-16 rounded bg-slate-200/70 animate-pulse mx-auto" />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="h-4 w-28 rounded bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-36 rounded bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-24 rounded-full bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-40 rounded bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-2 py-3">
                    <div className="mx-auto h-6 w-6 rounded bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-2 py-3">
                    <div className="mx-auto h-6 w-6 rounded bg-slate-100 animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td colSpan={8} className="border-t border-slate-100 bg-white px-4 py-3">
                  <div className="h-3 w-80 rounded bg-slate-100 animate-pulse" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Product badge + loading state -------------------- */

function ProductBadgeLoading() {
  return (
    <span
      aria-label="Loading product"
      className="inline-flex max-w-full items-center gap-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200"
    >
      <span className="h-2 w-2 rounded-full bg-indigo-200 animate-pulse" />
      <span className="h-3 w-28 rounded bg-indigo-200/70 animate-pulse" />
    </span>
  );
}

/* -------------------- Main -------------------- */

export default function CallsListClient({ leadId }: { leadId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<BookingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // needed to auth billing labels endpoint (fixes 401 in common setups)
  const [teamId, setTeamId] = useState<string | null>(null);

  const viewerTz = useMemo(() => readBrowserTimeZone(), []);
  const normalizedLeadId = useMemo(() => decodeURIComponent(String(leadId ?? "")).trim(), [leadId]);

  // prod_... -> product name
  const [productLabels, setProductLabels] = useState<Record<string, string>>({});
  const [productsResolving, setProductsResolving] = useState(false);

  // ✅ read the header search query (?q=...) for filtering rows on this page
  const qRaw = searchParams.get("q") ?? "";
  const q = qRaw.toLowerCase();

  /**
   * Resolve Stripe product ids -> names via your authed billing endpoint.
   * Returns: { [prodId]: "Name" }
   *
   * IMPORTANT:
   * Many setups require passing team/org context. We include `x-team-id`.
   * If your getAuthedBillingContext expects a different header, change it below.
   */
  async function fetchStripeProductLabels(ids: string[]): Promise<Record<string, string>> {
    const uniq = Array.from(new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean).filter(isStripeProductId)));
    if (uniq.length === 0) return {};
    if (!teamId) return {};

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return {};

    const res = await fetch("/api/billing/products/labels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-team-id": teamId, // ✅ key fix for 401 (if your ctx resolver needs it)
      },
      body: JSON.stringify({ ids: uniq }),
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // silent fail: we just won't show labels
      return {};
    }

    const labels = json?.labels;
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

        if (!normalizedLeadId || normalizedLeadId === "undefined" || normalizedLeadId === "null") {
          setErr("Missing lead id.");
          return;
        }
        if (!isUuid(normalizedLeadId)) {
          setErr("Invalid lead id.");
          return;
        }

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) {
          setErr("Not signed in.");
          return;
        }

        const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
        const tId = String(profile?.team_id ?? "").trim();
        if (!tId) {
          setErr("No team found for your user.");
          return;
        }
        if (!cancelled) setTeamId(tId);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setErr("Missing session token.");
          return;
        }

        const res = await fetch(
          `/api/crm/leads/${encodeURIComponent(normalizedLeadId)}/calls?teamId=${encodeURIComponent(tId)}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
        );

        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `load_failed_${res.status}`);

        if (!cancelled) setCalls((json?.calls ?? []) as BookingRow[]);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? "Failed to load calls"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedLeadId]);

  const rows = useMemo(() => {
    return (calls ?? [])
      .map((c) => {
        const outcome = pickOutcome(c);

        const start = DateTime.fromISO(c.start_at, { setZone: true }).setZone(viewerTz);
        const end = DateTime.fromISO(c.end_at, { setZone: true }).setZone(viewerTz);

        const dateLabel = start.isValid ? start.toLocaleString(DateTime.DATE_MED) : c.start_at;
        const timeLabel =
          start.isValid && end.isValid
            ? `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`
            : "—";

        const attendedRaw = String(outcome?.attended_status ?? "unknown").toLowerCase();
        const offerMade = !!outcome?.offer_made;
        const closed = !!outcome?.closed_on_call;

        const offerProductId = String((outcome as any)?.offer_product_id ?? "").trim();

        return {
          id: c.id,
          dateLabel,
          timeLabel,
          attendedRaw,
          attendedLabel: toLabel(attendedRaw),
          offerMade,
          offerProductId: offerProductId || null,
          closed,
          startMillis: start.isValid ? start.toMillis() : 0,
        };
      })
      .sort((a, b) => b.startMillis - a.startMillis);
  }, [calls, viewerTz]);

  // ✅ filter rows by q (spaces allowed; we do not trim away spaces while typing)
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const productLabel =
        r.offerMade && r.offerProductId ? String(productLabels[r.offerProductId] ?? "").toLowerCase() : "";

      const haystack = [
        r.dateLabel,
        r.timeLabel,
        r.attendedLabel,
        r.attendedRaw,
        r.offerMade ? "yes" : "no",
        r.closed ? "yes" : "no",
        productLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [rows, q, productLabels]);

  // Fetch product names for offered products (based on ALL rows so labels are available for search)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!teamId) return;

      const ids = (rows ?? [])
        .filter((r) => r.offerMade && r.offerProductId)
        .map((r) => r.offerProductId as string)
        .filter(isStripeProductId);

      const uniq = Array.from(new Set(ids));
      if (uniq.length === 0) return;

      const missing = uniq.filter((id) => !productLabels[id]);
      if (missing.length === 0) return;

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
  }, [rows, productLabels, teamId]); // teamId added

  if (loading) return <CallsLoadingState />;
  if (err) return <p className="text-sm text-rose-600">{err}</p>;

  const isFiltering = q.trim().length > 0;
  const showRows = filteredRows;

  return (
    <div className="max-w-5xl space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Calls</h1>
            <p className="mt-1 text-xs text-slate-500">
              {qRaw.trim().length === 0 ? (
                "Booked calls for this lead."
              ) : (
                <>
                  Showing {showRows.length} of {rows.length} calls for this lead.
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}`)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to Lead
            </button>
          </div>
        </div>
      </div>

      {/* Empty */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          No calls booked yet.
        </div>
      ) : showRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">No matches</div>
          <div className="mt-1 text-xs text-slate-500">
            Try a different search (e.g. <span className="font-semibold text-slate-700">attended</span>,{" "}
            <span className="font-semibold text-slate-700">no show</span>,{" "}
            <span className="font-semibold text-slate-700">yes</span>, or a product name).
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-collapse text-sm">
              <colgroup>
                {COL_CLASSES.map((cls, i) => (
                  <col key={i} className={cls} />
                ))}
              </colgroup>

              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">Date</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">Time</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">
                    Attendance
                  </th>
                  <th className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">Offer</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">Closed</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">
                    Product / Service
                  </th>
                  <th className="border-b border-slate-200 px-2 py-3 text-xs font-semibold text-slate-600 text-center">
                    View
                  </th>
                  <th className="border-b border-slate-200 px-2 py-3 text-xs font-semibold text-slate-600 text-center">
                    Edit
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {showRows.map((r) => {
                  const shouldShowProduct = r.offerMade && !!r.offerProductId;
                  const label = shouldShowProduct ? productLabels[r.offerProductId as string] : null;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 truncate">{r.dateLabel}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-slate-700 truncate">{r.timeLabel}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(
                            r.attendedRaw
                          )}`}
                        >
                          {r.attendedLabel}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${yesNoPill(
                            r.offerMade
                          )}`}
                        >
                          {r.offerMade ? "Yes" : "No"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${yesNoPill(
                            r.closed
                          )}`}
                        >
                          {r.closed ? "Yes" : "No"}
                        </span>
                      </td>

                      {/* Product/Service */}
                      <td className="px-4 py-3">
                        {shouldShowProduct ? (
                          label ? (
                            <span className="inline-flex max-w-full items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 truncate">
                              {label}
                            </span>
                          ) : productsResolving ? (
                            <ProductBadgeLoading />
                          ) : (
                            <span className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 truncate">
                              Product not found
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* View (tight) */}
                      <td className="px-2 py-3">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/leads/${encodeURIComponent(normalizedLeadId)}/calls/${encodeURIComponent(r.id)}/view`
                              )
                            }
                            className="inline-flex p-1 !text-slate-600 hover:!text-slate-800 transition-colors cursor-pointer"
                            title="View Call Details"
                            aria-label="View call details"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>

                      {/* Edit (tight) */}
                      <td className="px-2 py-3">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/calls/${encodeURIComponent(r.id)}`)
                            }
                            className="inline-flex p-1 !text-indigo-600 hover:!text-indigo-700 transition-colors cursor-pointer"
                            title="Edit Call Tracking"
                            aria-label="Edit call tracking"
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

          <div className="border-t border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
            Use <span className="font-semibold text-slate-700">View</span> to read notes/outcomes, or{" "}
            <span className="font-semibold text-slate-700">Edit</span> to update tracking.
          </div>
        </div>
      )}
    </div>
  );
}
