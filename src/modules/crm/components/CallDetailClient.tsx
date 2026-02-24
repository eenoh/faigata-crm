// src/modules/crm/components/CallDetailClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

type Outcome = {
  attended_status: string | null;
  offer_made: boolean | null;
  closed_on_call: boolean | null;
  notes: string | null;
  closer_user_id: string | null;
  updated_at: string | null;
  offer_product_id?: string | null;
};

type Booking = {
  id: string;
  team_id: string;
  lead_id: string;
  owner_user_id: string | null;
  start_at: string;
  end_at: string;
  timezone: string | null;
  created_at: string;
  booking_outcomes?: Outcome[] | Outcome | null;
};

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string) {
  return UUID_RE.test(v);
}

const ALLOWED_STATUS = new Set([
  "unknown",
  "attended",
  "no_show",
  "cancelled",
  "rescheduled",
]);

function safeStatus(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return ALLOWED_STATUS.has(s) ? s : "unknown";
}

function pickOutcome(b: Booking): Outcome | null {
  const raw: any = (b as any)?.booking_outcomes;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "object") return raw as Outcome;
  return null;
}

function toLabel(s: string) {
  const v = (s || "unknown").toLowerCase().replace(/_/g, " ");
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function statusPill(status: string) {
  const s = (status || "unknown").toLowerCase();
  if (s === "attended")
    return "bg-emerald-50/60 text-emerald-700 ring-emerald-200";
  if (s === "no_show") return "bg-rose-50/60 text-rose-700 ring-rose-200";
  if (s === "rescheduled")
    return "bg-amber-50/60 text-amber-800 ring-amber-200";
  return "bg-slate-100/70 text-slate-700 ring-slate-200";
}

function yesNoPill(isYes: boolean) {
  return isYes
    ? "bg-emerald-50/60 text-emerald-700 ring-emerald-200"
    : "bg-rose-50/60 text-rose-700 ring-rose-200";
}

function isStripeProductId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id);
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
  if (!uniq.length) return {};

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return {};

  const res = await fetch("/api/billing/products/labels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

function DetailLoadingState() {
  return (
    <div className="max-w-3xl space-y-4 animate-pulse">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-6 w-44 rounded bg-slate-100" />
        <div className="mt-2 h-4 w-56 rounded bg-slate-100" />
        <div className="mt-4 flex gap-2">
          <div className="h-9 w-28 rounded-lg bg-slate-100" />
          <div className="h-9 w-28 rounded-lg bg-slate-100" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
          <div className="h-16 rounded-xl bg-slate-100" />
        </div>
        <div className="h-32 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

function ProductBadgeLoading() {
  return (
    <span
      aria-label="Resolving product"
      className="inline-flex max-w-full items-center gap-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200"
    >
      <span className="h-2 w-2 rounded-full bg-indigo-200 animate-pulse" />
      <span className="h-3 w-28 rounded bg-indigo-200/70 animate-pulse" />
    </span>
  );
}

export default function CallDetailClient({
  leadId,
  bookingId,
}: {
  leadId: string;
  bookingId: string;
}) {
  const router = useRouter();
  const viewerTz = useMemo(readBrowserTimeZone, []);

  const normalizedLeadId = useMemo(() => String(leadId ?? "").trim(), [leadId]);
  const normalizedBookingId = useMemo(
    () => String(bookingId ?? "").trim(),
    [bookingId],
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [productResolving, setProductResolving] = useState(false);
  const [productLookupFailed, setProductLookupFailed] = useState(false);

  async function fetchBooking(teamId: string, token: string) {
    const res = await fetch(
      `/api/crm/bookings/${encodeURIComponent(normalizedBookingId)}?teamId=${encodeURIComponent(teamId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || `load_failed_${res.status}`);

    const b = json?.booking as Booking;
    if (!b) throw new Error("missing_booking");
    if (String(b.lead_id) !== String(normalizedLeadId))
      throw new Error("booking_lead_mismatch");
    return b;
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
        )
          return setErr("Missing lead id.");
        if (
          !normalizedBookingId ||
          normalizedBookingId === "undefined" ||
          normalizedBookingId === "null"
        )
          return setErr("Missing booking id.");
        if (!isUuid(normalizedLeadId)) return setErr("Invalid lead id.");
        if (!isUuid(normalizedBookingId)) return setErr("Invalid booking id.");

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return setErr("Not signed in.");

        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .maybeSingle();

        const teamId = String(profile?.team_id ?? "").trim();
        if (!teamId) return setErr("No team found.");

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return setErr("Missing session token.");

        const b = await fetchBooking(teamId, token);
        const o = pickOutcome(b);

        if (!cancelled) {
          setBooking(b);
          setOutcome(o);
        }
      } catch (e: any) {
        if (!cancelled)
          setErr(String(e?.message ?? "Failed to load call details"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedLeadId, normalizedBookingId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setProductLabel(null);
      setProductLookupFailed(false);

      const offerMade = !!outcome?.offer_made;
      const offerProductId = String(
        (outcome as any)?.offer_product_id ?? "",
      ).trim();

      if (!offerMade || !offerProductId) return;

      if (!isStripeProductId(offerProductId)) {
        setProductLookupFailed(true);
        return;
      }

      try {
        setProductResolving(true);
        const labels = await fetchStripeProductLabels([offerProductId]);
        const label = String(labels?.[offerProductId] ?? "").trim();

        if (!cancelled) {
          if (label) setProductLabel(label);
          else setProductLookupFailed(true);
        }
      } catch {
        if (!cancelled) setProductLookupFailed(true);
      } finally {
        if (!cancelled) setProductResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [outcome?.offer_made, (outcome as any)?.offer_product_id]);

  if (loading) return <DetailLoadingState />;
  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!booking)
    return <p className="text-sm text-slate-500">Call not found.</p>;

  const start = DateTime.fromISO(booking.start_at, { setZone: true }).setZone(
    viewerTz,
  );
  const end = DateTime.fromISO(booking.end_at, { setZone: true }).setZone(
    viewerTz,
  );

  const headerDate = start.isValid
    ? start.toLocaleString(DateTime.DATE_MED)
    : booking.start_at;
  const headerTime =
    start.isValid && end.isValid
      ? `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`
      : "—";

  const attendedRaw = safeStatus(outcome?.attended_status ?? "unknown");
  const attendedLabel = toLabel(attendedRaw);

  const offerMade = !!outcome?.offer_made;
  const closedOnCall =
    attendedRaw === "attended" ? !!outcome?.closed_on_call : false;
  const notes = String(outcome?.notes ?? "").trim();

  const offerProductId = String(
    (outcome as any)?.offer_product_id ?? "",
  ).trim();

  const productCardContent = (() => {
    if (!offerMade) {
      return (
        <>
          <span className="text-slate-400">—</span>
          <div className="mt-1 text-[11px] text-slate-400">
            No offer was made.
          </div>
        </>
      );
    }

    if (!offerProductId) {
      return (
        <>
          <span className="inline-flex max-w-full items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 truncate">
            Not specified
          </span>
          <div className="mt-1 text-[11px] text-slate-500">
            Offer was marked as made, but no product/service was selected.
          </div>
        </>
      );
    }

    if (productResolving) return <ProductBadgeLoading />;

    if (productLabel) {
      return (
        <>
          <span className="inline-flex max-w-full items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 truncate">
            {productLabel}
          </span>
          <div className="mt-1 text-[11px] text-slate-400">
            Offer was made for this product/service.
          </div>
        </>
      );
    }

    return (
      <>
        <span className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 truncate">
          Product not found
        </span>
        <div className="mt-1 text-[11px] text-slate-500">
          {productLookupFailed
            ? "We couldn’t resolve this product in Stripe."
            : "—"}
        </div>
      </>
    );
  })();

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Call Details
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {headerDate} · {headerTime}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/leads/${encodeURIComponent(normalizedLeadId)}/calls`,
                )
              }
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to Calls
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/leads/${encodeURIComponent(normalizedLeadId)}/calls/${encodeURIComponent(normalizedBookingId)}`,
                )
              }
              className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              title="Edit call outcome"
              aria-label="Edit call outcome"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Attendance
            </div>
            <div className="mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(attendedRaw)}`}
              >
                {attendedLabel}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Offer Made
            </div>
            <div className="mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${yesNoPill(offerMade)}`}
              >
                {offerMade ? "Yes" : "No"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Closed on Call
            </div>
            <div className="mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${yesNoPill(closedOnCall)}`}
              >
                {closedOnCall ? "Yes" : "No"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Product / Service
            </div>
            <div className="mt-2">{productCardContent}</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-slate-700">Notes</div>
          <div
            role="textbox"
            aria-readonly="true"
            tabIndex={0}
            className={[
              "w-full rounded-lg border border-slate-200 bg-white px-3 py-2",
              "text-sm text-slate-800 whitespace-pre-wrap",
              "min-h-[140px] max-h-[360px] overflow-y-auto",
              "focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300",
            ].join(" ")}
          >
            {notes ? (
              notes
            ) : (
              <span className="text-slate-400">No notes yet.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
