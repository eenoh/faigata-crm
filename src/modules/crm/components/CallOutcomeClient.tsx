// src/modules/crm/components/CallOutcomeClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

type Outcome = {
  attended_status: string | null;
  offer_made: boolean | null;
  offer_product_id?: string | null;
  closed_on_call: boolean | null;
  notes: string | null;
  closer_user_id: string | null;
  updated_at: string | null;
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

type StripeProductLite = {
  id: string;
  name: string | null;
  active: boolean;
  created: number | null;
};

const STATUS_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "attended", label: "Attended" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rescheduled", label: "Rescheduled" },
];

const STATUS_ALLOWED = new Set(STATUS_OPTIONS.map((o) => o.value));
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function safeStatus(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return STATUS_ALLOWED.has(s) ? s : "unknown";
}

function pickOutcome(b: Booking): Outcome | null {
  const raw: any = (b as any)?.booking_outcomes;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "object") return raw as Outcome;
  return null;
}

function normalizeTeamId(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function bestErrorMessage(json: any, status: number) {
  return (
    json?.message ||
    json?.error ||
    json?.details?.message ||
    json?.details?.hint ||
    json?.details?.code ||
    `request_failed_${status}`
  );
}

/* -------------------- pills (theme-aware) -------------------- */

function statusPill(status: string, isDark: boolean) {
  const s = (status || "unknown").toLowerCase();

  if (isDark) {
    if (s === "attended")
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30";
    if (s === "no_show") return "bg-rose-500/15 text-rose-200 ring-rose-400/30";
    if (s === "cancelled")
      return "bg-slate-500/15 text-slate-200 ring-slate-400/25";
    if (s === "rescheduled")
      return "bg-amber-500/15 text-amber-200 ring-amber-400/30";
    return "bg-slate-500/15 text-slate-200 ring-slate-400/25";
  }

  if (s === "attended")
    return "bg-emerald-50/60 text-emerald-700 ring-emerald-200";
  if (s === "no_show") return "bg-rose-50/60 text-rose-700 ring-rose-200";
  if (s === "cancelled") return "bg-slate-100/70 text-slate-700 ring-slate-200";
  if (s === "rescheduled")
    return "bg-amber-50/60 text-amber-800 ring-amber-200";
  return "bg-slate-100/70 text-slate-700 ring-slate-200";
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

/* -------------------- component -------------------- */

export default function CallOutcomeClient({
  leadId,
  bookingId,
}: {
  leadId: string;
  bookingId: string;
}) {
  const router = useRouter();
  const viewerTz = useMemo(readBrowserTimeZone, []);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const [teamId, setTeamId] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [attendedStatus, setAttendedStatus] = useState("unknown");
  const [offerMade, setOfferMade] = useState(false);
  const [closedOnCall, setClosedOnCall] = useState(false);
  const [notes, setNotes] = useState("");

  const [products, setProducts] = useState<StripeProductLite[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsErr, setProductsErr] = useState<string | null>(null);
  const [offerProductId, setOfferProductId] = useState<string>("");

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const bodyText = isDark ? "text-slate-200" : "text-slate-800";
  const labelText = isDark ? "text-slate-300" : "text-slate-700";

  const inputBase = [
    "mt-2 w-full rounded-lg border px-3 py-2 text-sm",
    "focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400/40"
      : "border-slate-200 bg-white text-slate-800 focus:ring-indigo-200 focus:border-indigo-300",
  ].join(" ");

  const backBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  function hydrateFormFromOutcome(outcome: Outcome | null) {
    const nextStatus = safeStatus(outcome?.attended_status ?? "unknown");
    setAttendedStatus(nextStatus);

    const om = !!outcome?.offer_made;
    setOfferMade(om);

    setClosedOnCall(
      nextStatus === "attended" ? !!outcome?.closed_on_call : false,
    );

    setNotes(String(outcome?.notes ?? ""));
    setOfferProductId(String(outcome?.offer_product_id ?? "").trim());
  }

  async function fetchBooking(tId: string, token: string) {
    const res = await fetch(
      `/api/crm/bookings/${encodeURIComponent(bookingId)}?teamId=${encodeURIComponent(tId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(bestErrorMessage(json, res.status));

    const b = json?.booking as Booking;
    if (!b) throw new Error("missing_booking");
    if (String(b.lead_id) !== String(leadId))
      throw new Error("booking_lead_mismatch");
    if (normalizeTeamId(b.team_id) !== normalizeTeamId(tId))
      throw new Error("team_mismatch");
    return b;
  }

  async function fetchStripeProducts(token: string, tId: string) {
    setProductsLoading(true);
    setProductsErr(null);

    try {
      const res = await fetch(
        `/api/billing/products/list?teamId=${encodeURIComponent(tId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, "x-team-id": tId },
          cache: "no-store",
        },
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.message ||
          json?.error ||
          (res.status === 401
            ? "Unauthorized to load billing products."
            : `products_failed_${res.status}`);
        throw new Error(msg);
      }

      const rows = (json?.products ?? []) as StripeProductLite[];
      setProducts(
        [...rows].sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return (b.created ?? 0) - (a.created ?? 0);
        }),
      );
    } finally {
      setProductsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setOk(null);

        if (!UUID_RE.test(String(leadId ?? "")))
          throw new Error("Invalid lead id.");
        if (!UUID_RE.test(String(bookingId ?? "")))
          throw new Error("Invalid booking id.");

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) throw new Error("Not signed in.");

        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .maybeSingle();

        const tId = String(profile?.team_id ?? "").trim();
        if (!tId) throw new Error("No team found.");
        if (!cancelled) setTeamId(tId);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Missing session token.");

        const b = await fetchBooking(tId, token);

        if (!cancelled) {
          setBooking(b);
          hydrateFormFromOutcome(pickOutcome(b));
        }

        try {
          await fetchStripeProducts(token, tId);
        } catch (e: any) {
          if (!cancelled) {
            setProducts([]);
            setProductsErr(String(e?.message ?? "Failed to load products"));
          }
        }
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? "Failed to load booking"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leadId, bookingId]);

  async function save() {
    if (!teamId) return;

    try {
      setSaving(true);
      setErr(null);
      setOk(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("missing_token");

      const offerPid = String(offerProductId ?? "").trim();
      if (offerMade && !offerPid)
        throw new Error("Please select a product for the offer.");

      const status = safeStatus(attendedStatus);

      const res = await fetch(
        `/api/crm/bookings/${encodeURIComponent(bookingId)}/outcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            teamId: teamId.trim(),
            attended_status: status,
            offer_made: !!offerMade,
            offer_product_id: offerMade ? offerPid : null,
            closed_on_call: status === "attended" ? !!closedOnCall : false,
            notes: String(notes ?? ""),
          }),
        },
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(bestErrorMessage(json, res.status));

      setOk("Saved.");
      router.push(`/leads/${encodeURIComponent(leadId)}/calls`);
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    const sk = isDark ? "bg-slate-800" : "bg-slate-100";
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className={`rounded-2xl border p-5 shadow-sm ${card}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`h-6 w-44 rounded ${sk}`} />
              <div className={`mt-2 h-4 w-56 rounded ${sk}`} />
              <div className={`mt-3 h-3 w-40 rounded ${sk}`} />
            </div>
            <div className={`h-9 w-28 rounded-lg ${sk}`} />
          </div>
        </div>

        <div className={`rounded-2xl border p-5 shadow-sm space-y-5 ${card}`}>
          <div className="space-y-2">
            <div className={`h-3 w-24 rounded ${sk}`} />
            <div className={`h-10 w-full rounded-lg ${sk}`} />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <div className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded ${sk}`} />
              <div className={`h-4 w-24 rounded ${sk}`} />
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-4 w-4 rounded ${sk}`} />
              <div className={`h-4 w-28 rounded ${sk}`} />
            </div>
          </div>

          <div className="space-y-2">
            <div className={`h-3 w-16 rounded ${sk}`} />
            <div className={`h-28 w-full rounded-lg ${sk}`} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className={`h-3 w-72 rounded ${sk}`} />
              <div className={`h-3 w-52 rounded ${sk}`} />
            </div>
            <div className={`h-9 w-28 rounded-lg ${sk}`} />
          </div>
        </div>
      </div>
    );
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

  if (!booking)
    return (
      <p
        className={[
          "text-sm",
          isDark ? "text-slate-400" : "text-slate-500",
        ].join(" ")}
      >
        Booking not found.
      </p>
    );

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
      ? `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(
          DateTime.TIME_SIMPLE,
        )}`
      : "—";

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === safeStatus(attendedStatus))?.label ??
    "Unknown";

  return (
    <div className="max-w-3xl space-y-4">
      <div className={`rounded-2xl border p-5 shadow-sm ${card}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={`text-xl font-semibold ${titleText}`}>
              Call Outcome
            </h1>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {headerDate} · {headerTime}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(`/leads/${encodeURIComponent(leadId)}/calls`)
            }
            className={[
              "cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm",
              backBtn,
            ].join(" ")}
          >
            Back to Calls
          </button>
        </div>

        {ok && (
          <p
            className={[
              "mt-3 text-xs font-semibold",
              isDark ? "text-emerald-200" : "text-emerald-700",
            ].join(" ")}
          >
            {ok}
          </p>
        )}
        {err && (
          <p
            className={[
              "mt-3 text-xs font-semibold",
              isDark ? "text-rose-300" : "text-rose-600",
            ].join(" ")}
          >
            {err}
          </p>
        )}
      </div>

      {/* Form */}
      <div className={`rounded-2xl border p-5 shadow-sm space-y-4 ${card}`}>
        {/* Quick chips (nice UX + dark mode colors) */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
              statusPill(attendedStatus, isDark),
            ].join(" ")}
          >
            Attendance: {statusLabel}
          </span>

          <span
            className={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
              yesNoPill(offerMade, isDark),
            ].join(" ")}
          >
            Offer: {offerMade ? "Yes" : "No"}
          </span>

          <span
            className={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
              yesNoPill(
                safeStatus(attendedStatus) === "attended"
                  ? closedOnCall
                  : false,
                isDark,
              ),
            ].join(" ")}
            title={
              safeStatus(attendedStatus) !== "attended"
                ? "Only meaningful when attendance is Attended."
                : undefined
            }
          >
            Closed:{" "}
            {safeStatus(attendedStatus) === "attended" && closedOnCall
              ? "Yes"
              : "No"}
          </span>

          {offerMade && offerProductId ? (
            <span
              className={[
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                productPill(isDark),
              ].join(" ")}
            >
              Product selected
            </span>
          ) : null}
        </div>

        <div>
          <label className={`block text-xs font-semibold ${labelText}`}>
            Attendance
          </label>
          <select
            value={attendedStatus}
            onChange={(e) => {
              const v = safeStatus(e.target.value);
              setAttendedStatus(v);
              if (v !== "attended") setClosedOnCall(false);
            }}
            className={["cursor-pointer", inputBase].join(" ")}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
          <label
            className={[
              "inline-flex items-center gap-2 text-sm",
              isDark ? "text-slate-200" : "text-slate-800",
              "cursor-pointer",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={offerMade}
              onChange={(e) => {
                const checked = e.target.checked;
                setOfferMade(checked);
                if (!checked) setOfferProductId("");
              }}
              className={[
                "h-4 w-4 cursor-pointer rounded border",
                isDark
                  ? "border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-400/30"
                  : "border-slate-300 text-indigo-600 focus:ring-indigo-500",
              ].join(" ")}
            />
            Offer Made
          </label>

          <label
            className={[
              "inline-flex items-center gap-2 text-sm",
              safeStatus(attendedStatus) !== "attended"
                ? isDark
                  ? "text-slate-500 cursor-not-allowed"
                  : "text-slate-400 cursor-not-allowed"
                : isDark
                  ? "text-slate-200 cursor-pointer"
                  : "text-slate-800 cursor-pointer",
            ].join(" ")}
            title={
              safeStatus(attendedStatus) !== "attended"
                ? "Mark attendance as Attended to enable this."
                : undefined
            }
          >
            <input
              type="checkbox"
              checked={closedOnCall}
              disabled={safeStatus(attendedStatus) !== "attended"}
              onChange={(e) => setClosedOnCall(e.target.checked)}
              className={[
                "h-4 w-4 rounded border",
                safeStatus(attendedStatus) !== "attended"
                  ? "cursor-not-allowed"
                  : "cursor-pointer",
                isDark
                  ? "border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-400/30"
                  : "border-slate-300 text-indigo-600 focus:ring-indigo-500",
              ].join(" ")}
            />
            Closed on Call
          </label>
        </div>

        {offerMade && (
          <div
            className={[
              "rounded-xl border p-4",
              isDark
                ? "border-slate-800 bg-slate-900/20"
                : "border-slate-200 bg-slate-50",
            ].join(" ")}
          >
            <div className={`text-sm font-semibold ${titleText}`}>
              Offer Product / Service
            </div>
            <p className={`mt-0.5 text-xs ${mutedText}`}>
              Select which Stripe product you offered on this call.
            </p>

            {productsErr && (
              <div
                className={[
                  "mt-3 rounded-lg border px-3 py-2 text-[12px]",
                  isDark
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-900",
                ].join(" ")}
              >
                {productsErr}
              </div>
            )}

            <div className="mt-3">
              <label className={`block text-xs font-semibold ${labelText}`}>
                Product
              </label>
              <select
                value={offerProductId}
                onChange={(e) => setOfferProductId(e.target.value)}
                className={["cursor-pointer", inputBase].join(" ")}
                disabled={productsLoading || !!productsErr}
              >
                <option value="">
                  {productsLoading
                    ? "Loading products…"
                    : productsErr
                      ? "Products unavailable"
                      : "Select a product…"}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ? p.name : p.id}
                    {!p.active ? " — archived" : ""}
                  </option>
                ))}
              </select>

              <p className={`mt-1 text-[11px] ${mutedText}`}>
                This will be logged in the lead activity timeline.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className={`block text-xs font-semibold ${labelText}`}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className={[
              "mt-2 w-full rounded-lg border px-3 py-2 text-sm",
              "focus:outline-none focus:ring-2",
              isDark
                ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400/40"
                : "border-slate-200 bg-white text-slate-800 focus:ring-indigo-200 focus:border-indigo-300",
            ].join(" ")}
            placeholder="Quick summary of what happened on the call…"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className={`text-[11px] ${mutedText}`}>
            Tip: Set the result of the call, then click{" "}
            <span
              className={
                isDark
                  ? "font-semibold text-slate-200"
                  : "font-semibold text-slate-700"
              }
            >
              Save Outcome
            </span>
            .
          </p>

          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Outcome"}
          </button>
        </div>
      </div>
    </div>
  );
}
