"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

type PaymentRow = {
  stripe_payment_intent_id: string;
  stripe_charge_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  amount: number;
  amount_received: number;
  currency: string;
  status: string;
  created_at_stripe: string | null;
};

type ApiError = {
  error?: string;
  detail?: string;
  details?: any;
  hint?: string;
};

async function authedFetch(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("no_session");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers, cache: "no-store" });
}

const fmtMoney = (currency: string, amountSmallest: number) => {
  const cur = (currency || "usd").toUpperCase();
  const v = amountSmallest / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${cur}`;
  }
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

/* -------------------- Empty state (theme-aware) -------------------- */

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
          No payments match “{query}”.
        </p>
        <p className="mt-1">
          Try searching by customer email, name, status, or payment intent ID.
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
          : "border-slate-300 bg-slate-50 text-slate-600",
      ].join(" ")}
    >
      <p
        className={
          isDark
            ? "font-semibold text-slate-200"
            : "font-semibold text-slate-700"
        }
      >
        No payments yet.
      </p>
      <p className="mt-1">
        Once payments are registered in Stripe, they will automatically appear
        here for tracking and review.
      </p>
    </div>
  );
}

function StatusPill({ status, isDark }: { status: string; isDark: boolean }) {
  const s = String(status ?? "").toLowerCase();

  const cls =
    s === "succeeded"
      ? isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
        : "bg-emerald-50 text-emerald-700"
      : s === "requires_payment_method" || s === "failed"
        ? isDark
          ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
          : "bg-rose-50 text-rose-700"
        : s === "processing"
          ? isDark
            ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/30"
            : "bg-indigo-50 text-indigo-700"
          : isDark
            ? "bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/25"
            : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {status}
    </span>
  );
}

/* -------------------- Role helpers (admin gate) -------------------- */

// role priority from lowest -> highest
const ROLE_PRIORITY: Record<string, number> = {
  prospector: 1,
  setter: 2,
  closer: 3,
  manager: 4,
  admin: 5,
};

function getHighestRole(rawRoles: unknown): string | null {
  if (!Array.isArray(rawRoles)) return null;

  let bestRole: string | null = null;
  let bestScore = -1;

  for (const r of rawRoles) {
    if (typeof r !== "string") continue;
    const key = r.toLowerCase();
    const score = ROLE_PRIORITY[key] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestRole = r; // keep original casing
    }
  }

  return bestRole;
}

/* -------------------- Component -------------------- */

export default function PaymentsClient() {
  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens (match invoices/customers)
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const headText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const mutedText2 = isDark ? "text-slate-500" : "text-slate-500";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const subHeadBorder = isDark ? "border-slate-800" : "border-slate-100";
  const divider = isDark ? "divide-slate-800" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50";
  const refreshBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  const ghostBtn = refreshBtn;

  // warning styles (calendar-like)
  const warnShell = isDark
    ? "border-amber-500/20 bg-amber-500/10"
    : "border-amber-200 bg-amber-50";
  const warnTitle = isDark ? "text-amber-200" : "text-amber-900";
  const warnSub = isDark ? "text-amber-200/80" : "text-amber-800";
  const warnIcon = isDark ? "text-amber-300" : "text-amber-600";

  // fallback error styles
  const errShell = isDark
    ? "border-rose-500/25 bg-rose-500/10"
    : "border-rose-200 bg-rose-50";
  const errTitle = isDark ? "text-rose-200" : "text-rose-900";
  const errSub = isDark ? "text-rose-200/80" : "text-rose-800";
  const errIcon = isDark ? "text-rose-300" : "text-rose-600";

  const primaryBtn = isDark
    ? "cursor-pointer border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-900/60"
    : "cursor-pointer border-slate-200 bg-white text-slate-800 hover:bg-slate-50";

  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  // role (for admin gate)
  const [highestRole, setHighestRole] = useState<string | null>(null);
  const isAdmin = (highestRole ?? "").toLowerCase() === "admin";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (cancelled) return;
        setHighestRole(getHighestRole(profile?.role));
      } catch {
        if (!cancelled) setHighestRole(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPayments = useMemo(
    () =>
      async (refresh = false) => {
        setErr(null);

        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (refresh) params.set("refresh", "1");

        const res = await authedFetch(
          `/api/billing/payments/list${params.toString() ? `?${params}` : ""}`,
        );
        const json: any = await res.json().catch(() => ({}));

        if (!res.ok) {
          setItems([]);
          setErr({
            error: json.error ?? `failed_${res.status}`,
            detail: json.detail,
            details: json.details,
            hint: json.hint,
          });
          return;
        }

        setItems((json.items ?? []) as PaymentRow[]);
      },
    [q],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      await fetchPayments(false).catch((e: any) => {
        setErr({ error: e?.message ?? "load_failed" });
        setItems([]);
      });
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchPayments]);

  const totalCount = items.length;
  const visibleCount = totalCount;

  const errCode = String(err?.error ?? "");
  const isMissingStripe = errCode === "missing_stripe_account";

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header card */}
      <div className={`rounded-2xl border px-7 py-6 shadow-sm ${card}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${headText}`}>Payments</h1>
            <p className={`mt-1 text-sm ${mutedText}`}>
              View payments synced from your connected Stripe account. Click a
              payment to see details.
            </p>

            {!!err && isMissingStripe ? (
              // ✅ Stripe missing warning (calendar-style)
              <div className="mt-3">
                <div
                  className={["rounded-2xl border p-4 sm:p-5", warnShell].join(
                    " ",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <ExclamationTriangleIcon
                      className={`h-5 w-5 mt-0.5 ${warnIcon}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${warnTitle}`}>
                        Stripe account not connected
                      </div>
                      <div
                        className={`mt-1 text-sm leading-relaxed ${warnSub}`}
                      >
                        This organization doesn’t have a Stripe account
                        connected, so payments can’t be loaded yet.
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => router.push("/profile/integrations")}
                            className={[
                              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm",
                              primaryBtn,
                            ].join(" ")}
                          >
                            Open Integrations
                          </button>
                        ) : (
                          <div
                            className={[
                              "text-sm",
                              isDark ? "text-amber-200/80" : "text-amber-800",
                            ].join(" ")}
                          >
                            Ask a <span className="font-semibold">manager</span>{" "}
                            to connect Stripe for your organization.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : !!err ? (
              // Existing error UI for other errors (still nice)
              <div
                className={[
                  "mt-3 rounded-2xl border p-4 sm:p-5",
                  errShell,
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <XCircleIcon className={`h-5 w-5 mt-0.5 ${errIcon}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${errTitle}`}>
                      Payments failed to load
                    </div>
                    <div className={`mt-1 text-sm leading-relaxed ${errSub}`}>
                      {err.detail ||
                        err.hint ||
                        "Something went wrong while fetching payments. Please try again."}
                    </div>
                    <div
                      className={[
                        "mt-2 text-[11px] font-medium",
                        isDark ? "text-slate-400" : "text-slate-500",
                      ].join(" ")}
                    >
                      Error code:{" "}
                      <span className="font-semibold">{errCode}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await fetchPayments(true).catch(() => {});
                setLoading(false);
              }}
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

            <Link
              href="/billing/payments/failed"
              className={[
                "rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm",
                ghostBtn,
              ].join(" ")}
            >
              View failed →
            </Link>
          </div>
        </div>
      </div>

      {/* List */}
      <div className={`overflow-hidden rounded-2xl border shadow-sm ${card}`}>
        <div
          className={`border-b px-5 py-3 text-xs ${subHeadBorder} ${mutedText2}`}
        >
          {loading
            ? "Loading…"
            : q
              ? `Showing ${visibleCount} result(s) for “${q}”`
              : `${totalCount} payments`}
        </div>

        {loading ? (
          <div className={`p-6 text-sm ${mutedText}`}>Loading payments…</div>
        ) : totalCount === 0 && !q ? (
          <div className="p-5">
            <EmptyState variant="none" isDark={isDark} />
          </div>
        ) : visibleCount === 0 && !!q ? (
          <div className="p-5">
            <EmptyState variant="no_match" query={q} isDark={isDark} />
          </div>
        ) : (
          <div className={`divide-y ${divider}`}>
            {items.map((p) => {
              const customerLabel =
                p.customer_email?.trim() ||
                p.customer_name?.trim() ||
                "Unknown customer";
              const amount = fmtMoney(
                p.currency,
                p.amount_received || p.amount,
              );
              const when = fmtDate(p.created_at_stripe);

              return (
                <Link
                  key={p.stripe_payment_intent_id}
                  href={`/billing/payments/${encodeURIComponent(
                    p.stripe_payment_intent_id,
                  )}`}
                  className={[
                    "flex items-center justify-between gap-4 px-5 py-4",
                    rowHover,
                    isDark ? "bg-slate-950" : "bg-white",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={p.status} isDark={isDark} />
                      <span className={`text-xs font-semibold ${headText}`}>
                        {amount}
                      </span>
                      <span
                        className={`text-xs ${isDark ? "text-slate-600" : "text-slate-400"}`}
                      >
                        •
                      </span>
                      <span className={`text-xs ${mutedText}`}>{when}</span>
                    </div>

                    <p className={`mt-1 truncate text-xs ${mutedText}`}>
                      {customerLabel} •{" "}
                      {p.description ?? p.stripe_payment_intent_id}
                    </p>

                    <p
                      className={[
                        "mt-1 truncate font-mono text-[11px]",
                        isDark ? "text-slate-500" : "text-slate-400",
                      ].join(" ")}
                    >
                      PI: {p.stripe_payment_intent_id}
                      {p.stripe_charge_id ? ` • CH: ${p.stripe_charge_id}` : ""}
                    </p>
                  </div>

                  <div
                    className={[
                      "text-xs font-semibold",
                      isDark ? "text-indigo-300" : "text-indigo-600",
                    ].join(" ")}
                  >
                    Open →
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
