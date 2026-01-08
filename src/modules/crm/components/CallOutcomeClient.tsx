// src/modules/crm/components/CallOutcomeClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";

type Outcome = {
  attended_status: string | null;
  offer_made: boolean | null;
  closed_on_call: boolean | null;
  notes: string | null;
  closer_user_id: string | null;
  updated_at: string | null;

  // ✅ NEW
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

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function safeStatus(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  const allowed = new Set(["unknown", "attended", "no_show", "cancelled", "rescheduled"]);
  return allowed.has(s) ? s : "unknown";
}

function pickOutcome(b: Booking): Outcome | null {
  const raw = (b as any)?.booking_outcomes;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "object") return raw as Outcome;
  return null;
}

export default function CallOutcomeClient({ leadId, bookingId }: { leadId: string; bookingId: string }) {
  const router = useRouter();
  const viewerTz = useMemo(() => readBrowserTimeZone(), []);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // form state
  const [attendedStatus, setAttendedStatus] = useState("unknown");
  const [offerMade, setOfferMade] = useState(false);
  const [closedOnCall, setClosedOnCall] = useState(false);
  const [notes, setNotes] = useState("");

  // ✅ NEW: offer product selection
  const [products, setProducts] = useState<StripeProductLite[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [offerProductId, setOfferProductId] = useState<string>("");

  function hydrateFormFromOutcome(outcome: Outcome | null) {
    const nextStatus = safeStatus(outcome?.attended_status ?? "unknown");
    setAttendedStatus(nextStatus);

    const om = !!outcome?.offer_made;
    setOfferMade(om);

    // If status isn’t attended, closed_on_call must be false
    const nextClosed = nextStatus === "attended" ? !!outcome?.closed_on_call : false;
    setClosedOnCall(nextClosed);

    setNotes(String(outcome?.notes ?? ""));

    // ✅ NEW
    setOfferProductId(String(outcome?.offer_product_id ?? "").trim());
  }

  function hydrateFromBooking(b: Booking) {
    hydrateFormFromOutcome(pickOutcome(b));
  }

  async function fetchBooking(tId: string, token: string) {
    const res = await fetch(
      `/api/crm/bookings/${encodeURIComponent(bookingId)}?teamId=${encodeURIComponent(tId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || `load_failed_${res.status}`);

    const b = json?.booking as Booking;
    if (!b) throw new Error("missing_booking");

    if (String(b.lead_id) !== String(leadId)) throw new Error("booking_lead_mismatch");
    return b;
  }

  async function fetchStripeProducts(token: string) {
    setProductsLoading(true);
    try {
      const res = await fetch("/api/billing/products/list", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // ✅ surface Stripe message + debug fields
        const msg =
          json?.message ||
          json?.error ||
          `products_failed_${res.status}`;

        console.error("[CallOutcomeClient] /api/billing/products/list failed", json);
        throw new Error(msg);
      }

      const rows = (json?.products ?? []) as StripeProductLite[];
      // Sort: active first, then newest
      const sorted = [...rows].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return (b.created ?? 0) - (a.created ?? 0);
      });

      setProducts(sorted);
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

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) {
          if (!cancelled) setErr("Not signed in.");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .maybeSingle();

        const tId = String(profile?.team_id ?? "").trim();
        if (!tId) {
          if (!cancelled) setErr("No team found.");
          return;
        }
        if (!cancelled) setTeamId(tId);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (!cancelled) setErr("Missing session token.");
          return;
        }

        const b = await fetchBooking(tId, token);

        if (!cancelled) {
          setBooking(b);
          hydrateFromBooking(b);
        }

        // ✅ Load products for offer selection
        if (!cancelled) await fetchStripeProducts(token);
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

      // ✅ If offer made => product required
      const offerPid = String(offerProductId ?? "").trim();
      if (offerMade && !offerPid) {
        throw new Error("Please select a product for the offer.");
      }

      const payload = {
        teamId,
        attended_status: attendedStatus,
        offer_made: offerMade,
        offer_product_id: offerMade ? offerPid : null, // ✅ NEW
        closed_on_call: attendedStatus === "attended" ? closedOnCall : false,
        notes,
      };

      const res = await fetch(`/api/crm/bookings/${encodeURIComponent(bookingId)}/outcome`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `save_failed_${res.status}`);

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
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        {/* Header skeleton */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="h-6 w-44 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-56 rounded bg-slate-100" />
              <div className="mt-3 h-3 w-40 rounded bg-slate-100" />
            </div>

            <div className="h-9 w-28 rounded-lg bg-slate-100" />
          </div>
        </div>

        {/* Form skeleton */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-10 w-full rounded-lg bg-slate-100" />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-slate-100" />
              <div className="h-4 w-24 rounded bg-slate-100" />
            </div>

            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-slate-100" />
              <div className="h-4 w-28 rounded bg-slate-100" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-slate-100" />
            <div className="h-28 w-full rounded-lg bg-slate-100" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-3 w-72 rounded bg-slate-100" />
              <div className="h-3 w-52 rounded bg-slate-100" />
            </div>
            <div className="h-9 w-28 rounded-lg bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!booking) return <p className="text-sm text-slate-500">Booking not found.</p>;

  const start = DateTime.fromISO(booking.start_at, { setZone: true }).setZone(viewerTz);
  const end = DateTime.fromISO(booking.end_at, { setZone: true }).setZone(viewerTz);

  const headerDate = start.isValid ? start.toLocaleString(DateTime.DATE_MED) : booking.start_at;
  const headerTime =
    start.isValid && end.isValid
      ? `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`
      : "—";

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Call Outcome</h1>
            <p className="mt-1 text-xs text-slate-500">
              {headerDate} · {headerTime}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/leads/${encodeURIComponent(leadId)}/calls`)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to Calls
            </button>
          </div>
        </div>

        {ok && <p className="mt-3 text-xs font-semibold text-emerald-700">{ok}</p>}
        {err && <p className="mt-3 text-xs font-semibold text-rose-600">{err}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700">Attendance</label>
          <select
            value={attendedStatus}
            onChange={(e) => {
              const v = safeStatus(e.target.value);
              setAttendedStatus(v);
              if (v !== "attended") setClosedOnCall(false);
            }}
            className="cursor-pointer mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={offerMade}
              onChange={(e) => {
                const checked = e.target.checked;
                setOfferMade(checked);
                if (!checked) setOfferProductId("");
              }}
              className="h-4 w-4 cursor-pointer"
            />
            Offer Made
          </label>

          <label
            className={[
              "inline-flex items-center gap-2 text-sm",
              attendedStatus !== "attended" ? "text-slate-400" : "text-slate-800",
              attendedStatus !== "attended" ? "cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
            title={attendedStatus !== "attended" ? "Mark attendance as Attended to enable this." : undefined}
          >
            <input
              type="checkbox"
              checked={closedOnCall}
              disabled={attendedStatus !== "attended"}
              onChange={(e) => setClosedOnCall(e.target.checked)}
              className={[
                "h-4 w-4",
                attendedStatus !== "attended" ? "cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            />
            Closed on Call
          </label>
        </div>

        {/* ✅ NEW: Product selection when Offer Made */}
        {offerMade && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Offer Product</div>
            <p className="mt-0.5 text-xs text-slate-500">
              Select which Stripe product you offered on this call.
            </p>

            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700">Product</label>
              <select
                value={offerProductId}
                onChange={(e) => setOfferProductId(e.target.value)}
                className="mt-2 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                disabled={productsLoading}
              >
                <option value="">{productsLoading ? "Loading products…" : "Select a product…"}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ? `${p.name}` : p.id}
                    {!p.active ? " — archived" : ""}
                  </option>
                ))}
              </select>

              <p className="mt-1 text-[11px] text-slate-500">
                This will be logged in the lead activity timeline.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            placeholder="Quick summary of what happened on the call…"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Tip: Set the result of the call, then click{" "}
            <span className="font-semibold text-slate-700">Save Outcome</span>.
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
