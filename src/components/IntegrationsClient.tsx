// src/components/IntegrationsClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

type ProviderId = "google" | "outlook";

type IntegrationStatus = {
  calendar: Record<ProviderId, boolean>;
  email: Record<ProviderId, boolean>;
  billing: { stripe: boolean };
};

const EMPTY_STATUS: IntegrationStatus = {
  calendar: { google: false, outlook: false },
  email: { google: false, outlook: false },
  billing: { stripe: false },
};

const GC_RECONNECT_FLAG_KEY = "faigatacrm.googleCalendarReconnectRequired";

const calendarProviders = [
  {
    id: "google" as const,
    name: "Google Calendar",
    description: "Used by most SaaS and startup teams.",
    connectHref: "/api/integrations/calendar/google/connect",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-700",
    buttonBg: "bg-indigo-600",
    buttonHoverBg: "hover:bg-indigo-700",
    buttonText: "text-white",
    enabled: true,
  },
  {
    id: "outlook" as const,
    name: "Outlook / Microsoft 365 Calendar",
    description: "Common in corporate and enterprise environments.",
    connectHref: "/api/integrations/calendar/outlook/connect",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-700",
    buttonBg: "bg-sky-600",
    buttonHoverBg: "hover:bg-sky-700",
    buttonText: "text-white",
    enabled: false,
  },
];

const emailProviders = [
  {
    id: "google" as const,
    name: "Gmail / Google Workspace",
    description: "Send and log emails directly from FaigataCRM.",
    connectHref: "/api/integrations/email/google/connect",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    buttonBg: "bg-emerald-600",
    buttonHoverBg: "hover:bg-emerald-700",
    buttonText: "text-white",
    enabled: false,
  },
  {
    id: "outlook" as const,
    name: "Outlook / Microsoft 365 Mail",
    description: "Use your Outlook inbox inside FaigataCRM.",
    connectHref: "/api/integrations/email/outlook/connect",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    buttonBg: "bg-sky-700",
    buttonHoverBg: "hover:bg-sky-800",
    buttonText: "text-white",
    enabled: false,
  },
];

const billingProviders = [
  {
    id: "stripe" as const,
    name: "Stripe (Test)",
    description:
      "Connect Stripe to create products, send invoices, collect payments, and show payment status.",
    connectHref: "/api/integrations/stripe/connect",
    badgeBg: "bg-violet-50",
    badgeText: "text-violet-700",
    buttonBg: "bg-violet-600",
    buttonHoverBg: "hover:bg-violet-700",
    buttonText: "text-white",
    enabled: true,
  },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function CalendarProviderIcon({ id }: { id: ProviderId }) {
  if (id === "google") {
    return (
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7"
        aria-hidden="true"
        role="img"
      >
        <rect
          x="5"
          y="7"
          width="22"
          height="20"
          rx="4"
          fill="#EEF2FF"
          stroke="#4F46E5"
          strokeWidth="1.4"
        />
        <rect x="9" y="11" width="5" height="2" rx="1" fill="#4F46E5" />
        <rect x="18" y="11" width="5" height="2" rx="1" fill="#4F46E5" />
        <rect x="9" y="16" width="4" height="3" rx="1" fill="#C7D2FE" />
        <rect x="14" y="16" width="4" height="3" rx="1" fill="#E5E7EB" />
        <rect x="19" y="16" width="4" height="3" rx="1" fill="#E5E7EB" />
        <rect x="9" y="21" width="4" height="3" rx="1" fill="#E5E7EB" />
        <rect x="14" y="21" width="4" height="3" rx="1" fill="#E5E7EB" />
        <rect x="19" y="21" width="4" height="3" rx="1" fill="#E5E7EB" />
        <path
          d="M19 9.5L22.5 9.5"
          stroke="#10B981"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M21.5 8L23 9.5L21.5 11"
          fill="none"
          stroke="#10B981"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true" role="img">
      <rect
        x="6"
        y="7"
        width="18"
        height="19"
        rx="4"
        fill="#E0F2FE"
        stroke="#0369A1"
        strokeWidth="1.4"
      />
      <rect x="9" y="11" width="5" height="2" rx="1" fill="#0369A1" />
      <rect x="16" y="11" width="5" height="2" rx="1" fill="#0369A1" />
      <rect x="9" y="16" width="4" height="3" rx="1" fill="#BAE6FD" />
      <rect x="14" y="16" width="4" height="3" rx="1" fill="#E5E7EB" />
      <rect x="9" y="21" width="4" height="3" rx="1" fill="#E5E7EB" />
      <rect x="14" y="21" width="4" height="3" rx="1" fill="#E5E7EB" />
      <rect
        x="18.5"
        y="10"
        width="7.5"
        height="12"
        rx="2"
        fill="#FFFFFF"
        stroke="#0EA5E9"
        strokeWidth="1.2"
      />
      <rect x="20" y="12" width="4" height="1.8" rx="0.9" fill="#0EA5E9" />
      <rect x="20" y="15" width="4" height="1.4" rx="0.7" fill="#BAE6FD" />
      <rect x="20" y="18" width="3" height="1.4" rx="0.7" fill="#E5E7EB" />
    </svg>
  );
}

function EmailProviderIcon({ id }: { id: ProviderId }) {
  const stroke = id === "google" ? "#16A34A" : "#0284C7";
  const fill = id === "google" ? "#DCFCE7" : "#E0F2FE";
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true" role="img">
      <rect
        x="5"
        y="9"
        width="22"
        height="14"
        rx="3"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.4"
      />
      <path
        d="M7 11L16 17L25 11"
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="22.5" r="2" fill="#E5E7EB" />
      <circle cx="18" cy="22.5" r="2" fill="#CBD5F5" />
    </svg>
  );
}

function StripeProviderIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true" role="img">
      <rect
        x="6"
        y="7"
        width="20"
        height="19"
        rx="6"
        fill="#F5F3FF"
        stroke="#7C3AED"
        strokeWidth="1.4"
      />
      <path
        d="M12 13.2c0-1.6 1.4-2.7 4-2.7 1.2 0 2.4.2 3.5.6v2.5c-1-.5-2.2-.8-3.4-.8-1.1 0-1.7.3-1.7.9 0 1.6 5.6.6 5.6 4.6 0 1.7-1.3 2.8-4.1 2.8-1.4 0-2.8-.3-3.9-.8v-2.6c1.2.6 2.6 1 3.8 1 1.1 0 1.8-.3 1.8-.9 0-1.6-5.6-.7-5.6-4.6z"
        fill="#7C3AED"
      />
    </svg>
  );
}

const readReconnectFlag = () =>
  typeof window !== "undefined" &&
  window.localStorage.getItem(GC_RECONNECT_FLAG_KEY) === "1";

const clearReconnectFlag = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GC_RECONNECT_FLAG_KEY);
  window.dispatchEvent(new Event("gc-reconnect-cleared"));
};

export default function IntegrationsClient() {
  // ✅ IMPORTANT: call ALL hooks unconditionally (fixes hook-order error)
  const { resolvedTheme } = useTheme();
  const searchParams = useSearchParams();

  const connectedParam = searchParams.get("connected");
  const errorParam = searchParams.get("error");

  const [mounted, setMounted] = useState(false);

  const [status, setStatus] = useState<IntegrationStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);

  const [pendingCalendar, setPendingCalendar] = useState<ProviderId | null>(
    null,
  );
  const [pendingStripe, setPendingStripe] = useState(false);

  const [googleReconnectNeeded, setGoogleReconnectNeeded] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  const cardBase = useMemo(
    () =>
      cn(
        "rounded-2xl border shadow-sm",
        isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
      ),
    [isDark],
  );

  const tileBase = useMemo(
    () =>
      cn(
        "flex h-full flex-col rounded-2xl border p-4 shadow-sm transition",
        isDark
          ? "border-slate-800 bg-slate-950 hover:border-indigo-500/40 hover:shadow-md"
          : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md",
      ),
    [isDark],
  );

  const heading = (cls = "") =>
    cn(
      "text-sm font-semibold",
      isDark ? "text-slate-100" : "text-slate-900",
      cls,
    );

  const subText = (cls = "") =>
    cn("text-xs", isDark ? "text-slate-400" : "text-slate-500", cls);

  const muted = (cls = "") =>
    cn(
      "text-[11px] leading-snug",
      isDark ? "text-slate-500" : "text-slate-400",
      cls,
    );

  const iconWrap = cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-full",
    isDark ? "bg-slate-900/40" : "bg-slate-100",
  );

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      setRolesLoading(true);

      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;

      if (!user?.id) {
        setIsAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[Integrations] Failed to load roles", error);
        setIsAdmin(false);
        return;
      }

      const roles = (data?.role ?? []) as string[];
      setIsAdmin(roles.some((r) => String(r).toLowerCase() === "admin"));
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    const token = await getAccessToken();

    if (!token) {
      setStatus(EMPTY_STATUS);
      return;
    }

    const [googleRes, stripeRes] = await Promise.allSettled([
      fetch("/api/integrations/calendar/google/status", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/integrations/stripe/status", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    let calendarEmail: Pick<IntegrationStatus, "calendar" | "email"> = {
      calendar: { google: false, outlook: false },
      email: { google: false, outlook: false },
    };

    if (googleRes.status === "fulfilled" && googleRes.value.ok) {
      const json = (await googleRes.value.json()) as any;
      calendarEmail = {
        calendar: json?.calendar ?? calendarEmail.calendar,
        email: json?.email ?? calendarEmail.email,
      };
    }

    let stripeConnected = false;
    if (stripeRes.status === "fulfilled" && stripeRes.value.ok) {
      const json = (await stripeRes.value.json()) as any;
      stripeConnected = !!json?.connected;
    }

    setStatus({ ...calendarEmail, billing: { stripe: stripeConnected } });
  }, [getAccessToken]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchRoles()]);
    } catch (e) {
      console.error("[Integrations] Failed to load status/roles", e);
      setStatus(EMPTY_STATUS);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, fetchRoles]);

  const clearGoogleConnectedCookie = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    await fetch("/api/integrations/calendar/google/clear-cookie", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [getAccessToken]);

  useEffect(() => {
    setGoogleReconnectNeeded(readReconnectFlag());

    const onNeed = () => setGoogleReconnectNeeded(true);
    const onCleared = () => setGoogleReconnectNeeded(false);

    window.addEventListener("gc-reconnect-required", onNeed as EventListener);
    window.addEventListener("gc-reconnect-cleared", onCleared as EventListener);

    return () => {
      window.removeEventListener(
        "gc-reconnect-required",
        onNeed as EventListener,
      );
      window.removeEventListener(
        "gc-reconnect-cleared",
        onCleared as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (googleReconnectNeeded) clearGoogleConnectedCookie().catch(() => {});
  }, [googleReconnectNeeded, clearGoogleConnectedCookie]);

  useEffect(() => {
    refresh();

    const onFocus = () => refresh().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (
      connectedParam === "google" ||
      connectedParam === "stripe" ||
      errorParam
    ) {
      clearReconnectFlag();
      refresh().catch(() => {});
    }
  }, [connectedParam, errorParam, refresh]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh().catch(() => {});
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const isCalendarConnected = (id: ProviderId) => status.calendar[id] ?? false;
  const isEmailConnected = (id: ProviderId) => status.email[id] ?? false;
  const isStripeConnected = status.billing.stripe;

  const startConnect = useCallback(
    async (connectHref: string, providerId?: ProviderId) => {
      const token = await getAccessToken();

      if (!token) {
        window.location.href = "/login";
        return;
      }

      if (providerId === "google" && googleReconnectNeeded) {
        await clearGoogleConnectedCookie().catch(() => {});
      }

      const res = await fetch(connectHref, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = (json as any)?.error || `connect_failed_${res.status}`;
        window.location.href = `/settings/integrations?error=${encodeURIComponent(msg)}`;
        return;
      }

      const authUrl = (json as any)?.authUrl as string | undefined;
      if (!authUrl) {
        window.location.href = `/settings/integrations?error=${encodeURIComponent("missing_auth_url")}`;
        return;
      }

      window.location.href = authUrl;
    },
    [getAccessToken, googleReconnectNeeded, clearGoogleConnectedCookie],
  );

  async function handleCalendarClick(
    provider: (typeof calendarProviders)[number],
    connected: boolean,
  ) {
    if (!provider.enabled && !connected) return;

    if (!connected) {
      await startConnect(provider.connectHref, provider.id);
      return;
    }

    try {
      setPendingCalendar(provider.id);

      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch(
        `/api/integrations/calendar/${provider.id}/disconnect`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Disconnect calendar failed:", res.status, text);
        return;
      }

      await fetchStatus();

      if (provider.id === "google") {
        window.open(
          "https://myaccount.google.com/permissions",
          "_blank",
          "noopener,noreferrer",
        );
      }
    } finally {
      setPendingCalendar(null);
    }
  }

  async function handleStripeClick() {
    const stripeProvider = billingProviders[0];
    if (!stripeProvider.enabled) return;

    if (!isStripeConnected) {
      await startConnect(stripeProvider.connectHref);
      return;
    }

    try {
      setPendingStripe(true);

      const token = await getAccessToken();
      if (!token) return;

      const res = await fetch("/api/integrations/stripe/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Disconnect stripe failed:", res.status, text);
        return;
      }

      await fetchStatus();
    } finally {
      setPendingStripe(false);
    }
  }

  async function handleEmailClick(
    provider: (typeof emailProviders)[number],
    connected: boolean,
  ) {
    if (!provider.enabled && !connected) return;
    if (!connected) await startConnect(provider.connectHref, provider.id);
  }

  // ✅ safe to gate render AFTER hooks
  if (!mounted) return null;

  return (
    <div className="max-w-3xl space-y-6 pt-6">
      <div className={cn(cardBase, "px-5 py-4")}>
        <h1
          className={cn(
            "text-2xl font-semibold",
            isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          Integrations
        </h1>
        <p
          className={cn(
            "mt-1 text-sm",
            isDark ? "text-slate-400" : "text-slate-600",
          )}
        >
          Connect your calendar and inbox to power bookings and communication.
        </p>

        {googleReconnectNeeded && (
          <p
            className={cn(
              "mt-2 text-xs font-semibold",
              isDark ? "text-amber-300" : "text-amber-700",
            )}
          >
            Your Google Calendar needs to be reconnected so booking links can
            check availability. Click “Reconnect Google Calendar”.
          </p>
        )}

        {!!errorParam && (
          <p
            className={cn(
              "mt-2 text-xs font-semibold",
              isDark ? "text-rose-300" : "text-rose-600",
            )}
          >
            Connection failed: {errorParam}
          </p>
        )}
      </div>

      {/* Calendar */}
      <section className="space-y-3">
        <div>
          <h2 className={heading()}>Calendar Connections</h2>
          <p className={subText("mt-1")}>
            We use your calendar to show availability and create events when a
            lead books a call.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {calendarProviders.map((p) => {
            const connected =
              p.id === "google" && googleReconnectNeeded
                ? false
                : isCalendarConnected(p.id);

            const isPending = pendingCalendar === p.id;

            return (
              <div key={p.id} className={tileBase}>
                <div className="mb-3 flex min-h-[40px] items-center gap-2">
                  <div className={iconWrap}>
                    <CalendarProviderIcon id={p.id} />
                  </div>

                  {connected && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-emerald-500/10 text-emerald-200"
                          : "bg-emerald-50 text-emerald-700",
                      )}
                    >
                      <span
                        className={cn(
                          "mr-1 h-1.5 w-1.5 rounded-full",
                          isDark ? "bg-emerald-400" : "bg-emerald-500",
                        )}
                      />
                      Connected
                    </span>
                  )}

                  {p.id === "google" && googleReconnectNeeded && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-amber-500/10 text-amber-200"
                          : "bg-amber-50 text-amber-800",
                      )}
                    >
                      Action required
                    </span>
                  )}

                  {!p.enabled && !connected && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-slate-900/40 text-slate-300"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      Coming soon
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className={heading()}>{p.name}</h3>
                  <p className={subText("mt-1")}>{p.description}</p>
                  <div
                    className={cn(
                      "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isDark
                        ? "bg-slate-900/40 text-slate-200"
                        : `${p.badgeBg} ${p.badgeText}`,
                    )}
                  >
                    {p.id === "google"
                      ? "Great for Google Workspace teams"
                      : "Great for Microsoft 365 / Outlook users"}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={
                      loading || isPending || (!p.enabled && !connected)
                    }
                    onClick={() => handleCalendarClick(p, connected)}
                    className={cn(
                      "inline-flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                      connected
                        ? isDark
                          ? "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                          : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : cn(p.buttonBg, p.buttonHoverBg, p.buttonText),
                    )}
                  >
                    {p.id === "google" && googleReconnectNeeded
                      ? "Reconnect Google Calendar"
                      : connected
                        ? `Disconnect ${p.name}`
                        : `Connect ${p.name}`}
                  </button>

                  <p className={muted(connected ? "pb-[11px]" : "")}>
                    {p.id === "google" && googleReconnectNeeded
                      ? "Reconnect to restore availability checks for booking links."
                      : connected
                        ? "Currently syncing events from this calendar."
                        : "We’ll only be able to see and manage events in your calendar."}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Email */}
      <section className="space-y-3">
        <div>
          <h2 className={heading()}>Email Connections</h2>
          <p className={subText("mt-1")}>
            Connect your inbox to send emails from FaigataCRM and log
            conversations to leads.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {emailProviders.map((p) => {
            const connected = isEmailConnected(p.id);

            return (
              <div key={`${p.id}-email`} className={tileBase}>
                <div className="mb-3 flex min-h-[40px] items-center gap-2">
                  <div className={iconWrap}>
                    <EmailProviderIcon id={p.id} />
                  </div>

                  {connected && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-emerald-500/10 text-emerald-200"
                          : "bg-emerald-50 text-emerald-700",
                      )}
                    >
                      <span
                        className={cn(
                          "mr-1 h-1.5 w-1.5 rounded-full",
                          isDark ? "bg-emerald-400" : "bg-emerald-500",
                        )}
                      />
                      Connected
                    </span>
                  )}

                  {!p.enabled && !connected && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-slate-900/40 text-slate-300"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      Coming soon
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className={heading()}>{p.name}</h3>
                  <p className={subText("mt-1")}>{p.description}</p>
                  <div
                    className={cn(
                      "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isDark
                        ? "bg-slate-900/40 text-slate-200"
                        : `${p.badgeBg} ${p.badgeText}`,
                    )}
                  >
                    {p.id === "google"
                      ? "Requires Gmail / Workspace mail permissions"
                      : "Requires Outlook / Microsoft 365 mail permissions"}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={loading || (!p.enabled && !connected)}
                    onClick={() => handleEmailClick(p, connected)}
                    className={cn(
                      "inline-flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                      connected
                        ? isDark
                          ? "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                          : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : cn(p.buttonBg, p.buttonHoverBg, p.buttonText),
                    )}
                  >
                    {connected ? `Disconnect ${p.name}` : `Connect ${p.name}`}
                  </button>

                  <p className={muted()}>
                    {connected
                      ? "We’re using this inbox to send and log lead-related communication."
                      : "You’ll see a separate consent screen. We only use this to send and log lead-related communication."}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Billing (ADMIN ONLY) */}
      {isAdmin && (
        <section className="space-y-3">
          <div>
            <h2 className={heading()}>Billing Connections</h2>
            <p className={subText("mt-1")}>
              Connect Stripe to create products, send invoices, and collect
              payments.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {billingProviders.map((p) => (
              <div key={p.id} className={tileBase}>
                <div className="mb-3 flex min-h-[40px] items-center gap-2">
                  <div className={iconWrap}>
                    <StripeProviderIcon />
                  </div>

                  {isStripeConnected ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-emerald-500/10 text-emerald-200"
                          : "bg-emerald-50 text-emerald-700",
                      )}
                    >
                      <span
                        className={cn(
                          "mr-1 h-1.5 w-1.5 rounded-full",
                          isDark ? "bg-emerald-400" : "bg-emerald-500",
                        )}
                      />
                      Connected
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isDark
                          ? "bg-slate-900/40 text-slate-200"
                          : `${p.badgeBg} ${p.badgeText}`,
                      )}
                    >
                      Billing
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <h3 className={heading()}>{p.name}</h3>
                  <p className={subText("mt-1")}>{p.description}</p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={
                      loading || rolesLoading || pendingStripe || !p.enabled
                    }
                    onClick={handleStripeClick}
                    className={cn(
                      "inline-flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                      isStripeConnected
                        ? isDark
                          ? "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                          : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : cn(p.buttonBg, p.buttonHoverBg, p.buttonText),
                    )}
                  >
                    {pendingStripe
                      ? "Working..."
                      : isStripeConnected
                        ? "Disconnect Stripe"
                        : "Connect Stripe (Test)"}
                  </button>

                  <p className={muted()}>
                    {isStripeConnected
                      ? "Stripe is connected for this workspace (test mode)."
                      : "You’ll be redirected to Stripe to authorize access (test mode)."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
