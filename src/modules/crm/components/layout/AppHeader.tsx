// src/modules/crm/components/layout/AppHeader.tsx
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BellIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useSidebar } from "@/context/SidebarContext";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

function getSectionName(pathname: string): string {
  if (pathname.startsWith("/leads")) return "Leads";
  if (pathname.startsWith("/calendar")) return "Calendar";
  if (pathname.startsWith("/billing")) return "Billing";
  if (pathname.startsWith("/pipeline")) return "Pipeline";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  return "FaigataCRM";
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ===================== HEADER ALERT BRIDGE (NEW) ===================== */

type HeaderAlertKind = "warning" | "error";

type HeaderAlertPayload = {
  id: string; // stable per page (e.g. "calendar")
  kind: HeaderAlertKind;
  text: string;
  title?: string;
};

const HEADER_ALERT_EVENT = "faigata:header-alert";
const HEADER_ALERT_CLEAR_EVENT = "faigata:header-alert-clear";

/* ================================================================ */

type HeaderUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
  role: string | null;
};

type HeaderLead = {
  id: string;
  team_id: string;
  setter_id: string | null;
  stage: string;
  custom_values: Record<string, any> | null;
  created_at: string;
};

type HeaderMessage = {
  id: string;
  team_id: string;
  lead_id: string;
  direction: "inbound" | "outbound";
  channel: string | null;
  sent_at: string;
};

type ReminderType = "no_inbound" | "stage_stuck";

type Reminder = {
  id: string;
  type: ReminderType;
  leadId: string;
  leadName: string;
  text: string;
};

function diffHours(a: Date, b: Date) {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

// TTL handling for reminders (24h)
const REMINDER_TTL_HOURS = 24;
const REMINDER_LOCALSTORAGE_KEY = "faigatacrm.headerReminderFirstSeen";

type ReminderSeenMap = Record<string, string>; // reminderId -> ISO timestamp

function loadReminderSeenMap(): ReminderSeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REMINDER_LOCALSTORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as ReminderSeenMap)
      : {};
  } catch {
    return {};
  }
}

function saveReminderSeenMap(map: ReminderSeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMINDER_LOCALSTORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// Same heuristic as LeadMessagesClient to label leads
function leadDisplayName(lead: HeaderLead): string {
  const cv = lead.custom_values ?? {};
  const preferredKeys = [
    "name",
    "full_name",
    "first_name",
    "last_name",
    "company",
    "account",
    "email",
  ];

  const lowerEntries = Object.entries(cv).map(
    ([k, v]) => [k.toLowerCase(), v] as const,
  );

  for (const pref of preferredKeys) {
    const match = lowerEntries.find(
      ([key, value]) =>
        key.includes(pref) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== "",
    );
    if (match) return String(match[1]).trim();
  }

  const anyField = lowerEntries.find(
    ([, value]) =>
      value !== null &&
      value !== undefined &&
      typeof value === "string" &&
      String(value).trim() !== "",
  );
  if (anyField) return String(anyField[1]).trim();

  return `Lead in “${lead.stage || "Pipeline"}” stage`;
}

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

/** Google Calendar reconnect banner (header) */
const GC_RECONNECT_FLAG_KEY = "faigatacrm.googleCalendarReconnectRequired";

function readGcReconnectFlag(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GC_RECONNECT_FLAG_KEY) === "1";
}

function clearGcReconnectFlag() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GC_RECONNECT_FLAG_KEY);
  window.dispatchEvent(new Event("gc-reconnect-cleared"));
}

async function fetchGoogleCalendarConnected(): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return false;

    const res = await fetch("/api/integrations/calendar/google/status", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return false;

    const json = (await res.json().catch(() => ({}))) as any;
    return !!json?.calendar?.google;
  } catch {
    return false;
  }
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { collapsed } = useSidebar();

  // ✅ Standard theme logic (match ProductSuiteHeader)
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const section = getSectionName(pathname);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [gcReconnectNeeded, setGcReconnectNeeded] = useState(false);

  // NEW: page-driven alerts (e.g. Calendar error/warning pill)
  const [headerAlerts, setHeaderAlerts] = useState<
    Record<string, HeaderAlertPayload>
  >({});

  const profileRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const searchRef = useRef<HTMLDivElement | null>(null);

  const leftClass = collapsed ? "left-16" : "left-64";
  const teamId = searchParams.get("team");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  // NEW: Listen for cross-page header alert events
  useEffect(() => {
    const onAlert = (ev: Event) => {
      const e = ev as CustomEvent<HeaderAlertPayload>;
      if (!e?.detail?.id) return;
      setHeaderAlerts((prev) => ({ ...prev, [e.detail.id]: e.detail }));
    };

    const onClear = (ev: Event) => {
      const e = ev as CustomEvent<{ id: string }>;
      const id = e?.detail?.id;
      if (!id) return;
      setHeaderAlerts((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    window.addEventListener(HEADER_ALERT_EVENT, onAlert as EventListener);
    window.addEventListener(HEADER_ALERT_CLEAR_EVENT, onClear as EventListener);

    return () => {
      window.removeEventListener(HEADER_ALERT_EVENT, onAlert as EventListener);
      window.removeEventListener(
        HEADER_ALERT_CLEAR_EVENT,
        onClear as EventListener,
      );
    };
  }, []);

  // Reconnect banner: init from local flag, then verify real status and clear stale flag
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setGcReconnectNeeded(readGcReconnectFlag());

      const connected = await fetchGoogleCalendarConnected();
      if (cancelled) return;

      if (connected) {
        setGcReconnectNeeded(false);
        clearGcReconnectFlag();
      } else {
        setGcReconnectNeeded(true);
      }
    })();

    const onNeed = () => setGcReconnectNeeded(true);
    const onCleared = () => setGcReconnectNeeded(false);

    window.addEventListener("gc-reconnect-required", onNeed as EventListener);
    window.addEventListener("gc-reconnect-cleared", onCleared as EventListener);

    return () => {
      cancelled = true;
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

  async function refreshAvatar(path: string | null) {
    if (!path) {
      setAvatarUrl(null);
      return;
    }

    if (path.startsWith("http://") || path.startsWith("https://")) {
      setAvatarUrl(path);
      return;
    }

    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24);

    if (error) {
      setAvatarUrl(null);
      return;
    }

    setAvatarUrl(data?.signedUrl ?? null);
  }

  // load current user
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (!cancelled) {
            setUser(null);
            setAvatarUrl(null);
            setLoadingUser(false);
          }
          return;
        }

        const userId = userRes.user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url, role")
          .eq("id", userId)
          .single();

        if (profileError) {
          if (!cancelled) {
            setUser({
              id: userId,
              firstName: null,
              lastName: null,
              avatarPath: null,
              role: null,
            });
            setAvatarUrl(null);
          }
        } else if (!cancelled) {
          const highestRole = getHighestRole(profile?.role);

          const headerUser: HeaderUser = {
            id: userId,
            firstName: profile?.first_name ?? null,
            lastName: profile?.last_name ?? null,
            avatarPath: profile?.avatar_url ?? null,
            role: highestRole,
          };

          setUser(headerUser);
          if (headerUser.avatarPath) refreshAvatar(headerUser.avatarPath);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAvatarUrl(null);
        }
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close profile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }

    if (profileOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  // Close notifications when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    if (notificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notificationsOpen]);

  // Close on route change
  useEffect(() => {
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);

    if (
      !pathname.startsWith("/leads") &&
      !pathname.startsWith("/pipeline") &&
      !pathname.startsWith("/billing")
    ) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (value.trim().length > 0) params.set("q", value);
    else params.delete("q");

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearSearch() {
    setSearch("");

    if (
      pathname.startsWith("/leads") ||
      pathname.startsWith("/pipeline") ||
      pathname.startsWith("/billing")
    ) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  const initials = (() => {
    if (!user) return "U";
    const first = user.firstName?.trim()?.charAt(0).toUpperCase();
    const last = user.lastName?.trim()?.charAt(0).toUpperCase();
    if (first && last) return `${first}${last}`;
    return first || last || "U";
  })();

  const displayName =
    user && (user.firstName || user.lastName)
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : "You";

  const displayRole = (() => {
    const raw = user?.role;
    if (!raw || typeof raw !== "string") return "Member";

    switch (raw.toLowerCase()) {
      case "prospector":
        return "Prospector";
      case "setter":
        return "Setter";
      case "closer":
        return "Closer";
      case "manager":
        return "Manager";
      case "admin":
        return "Admin";
      default:
        return raw;
    }
  })();

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
    }
  }

  async function handleGoogleReconnect() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/integrations/calendar/google/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = json?.error || `connect_failed_${res.status}`;
        router.push(`/profile/integrations?error=${encodeURIComponent(msg)}`);
        return;
      }

      const authUrl = json?.authUrl as string | undefined;
      if (!authUrl) {
        router.push(
          `/profile/integrations?error=${encodeURIComponent(
            "missing_auth_url",
          )}`,
        );
        return;
      }

      window.location.href = authUrl;
    } catch {
      router.push(
        `/profile/integrations?error=${encodeURIComponent(
          "google_reconnect_failed",
        )}`,
      );
    }
  }

  // NEW: Click behavior for dynamic header pills (calendar etc.)
  function handleHeaderAlertClick(a: HeaderAlertPayload) {
    // If it's a Calendar reconnect-type pill, reuse your reconnect flow.
    if (a.id === "calendar" && a.text.toLowerCase().includes("reconnect")) {
      handleGoogleReconnect();
      return;
    }

    // Session expired: go login.
    if (a.text.toLowerCase().includes("session")) {
      router.push("/login");
      return;
    }

    // Otherwise, integrations is the best default place for calendar issues.
    if (a.id === "calendar") {
      router.push("/profile/integrations");
      return;
    }
  }

  const computeReminders = useCallback(async () => {
    if (!user || !teamId) {
      setReminders([]);
      return;
    }

    setLoadingReminders(true);

    try {
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, team_id, setter_id, stage, custom_values, created_at")
        .eq("team_id", teamId)
        .eq("setter_id", user.id);

      if (leadsError || !leads?.length) {
        setReminders([]);
        return;
      }

      const leadIds = leads.map((l) => l.id);

      const { data: msgs, error: msgsError } = await supabase
        .from("lead_messages")
        .select("id, team_id, lead_id, direction, channel, sent_at")
        .eq("team_id", teamId)
        .in("lead_id", leadIds)
        .order("sent_at", { ascending: false });

      if (msgsError) {
        setReminders([]);
        return;
      }

      const byLead = new Map<string, HeaderMessage[]>();
      (msgs ?? []).forEach((m) => {
        const list = byLead.get(m.lead_id) ?? [];
        list.push(m as HeaderMessage);
        byLead.set(m.lead_id, list);
      });

      const now = new Date();
      const candidateReminders: Reminder[] = [];

      const followupThresholds = [
        { hours: 48, label: "No reply in 48 hours" },
        { hours: 96, label: "No reply in 4 days" },
        { hours: 168, label: "No reply in 1 week" },
      ];

      const stageThresholdHours = 72; // 3 days

      for (const lead of leads as HeaderLead[]) {
        const leadMsgs = byLead.get(lead.id) ?? [];

        const lastOutbound = leadMsgs.find((m) => m.direction === "outbound");
        const lastInbound = leadMsgs.find((m) => m.direction === "inbound");

        if (
          lastOutbound &&
          (!lastInbound ||
            new Date(lastInbound.sent_at) < new Date(lastOutbound.sent_at))
        ) {
          const hoursSince = diffHours(now, new Date(lastOutbound.sent_at));

          let followLabel: string | null = null;
          for (let i = followupThresholds.length - 1; i >= 0; i--) {
            if (hoursSince >= followupThresholds[i].hours) {
              followLabel = followupThresholds[i].label;
              break;
            }
          }

          if (followLabel) {
            candidateReminders.push({
              id: `noinbound-${lead.id}-${lastOutbound.sent_at}`,
              type: "no_inbound",
              leadId: lead.id,
              leadName: leadDisplayName(lead),
              text: `${followLabel} after your last message.`,
            });
          }
        }

        const stageMsgs = leadMsgs.filter(
          (m) => (m.channel ?? "").toLowerCase() === "pipeline",
        );
        const lastStageChange = stageMsgs.length
          ? new Date(stageMsgs[0].sent_at)
          : new Date(lead.created_at);

        const hoursInStage = diffHours(now, lastStageChange);

        if (hoursInStage >= stageThresholdHours) {
          candidateReminders.push({
            id: `stage-${lead.id}-${lastStageChange.toISOString()}`,
            type: "stage_stuck",
            leadId: lead.id,
            leadName: leadDisplayName(lead),
            text: `In stage "${lead.stage}" for more than 3 days.`,
          });
        }
      }

      const seenMap = loadReminderSeenMap();
      const filteredReminders: Reminder[] = [];

      const candidateIds = new Set(candidateReminders.map((r) => r.id));

      for (const key of Object.keys(seenMap)) {
        if (!candidateIds.has(key)) delete seenMap[key];
      }

      for (const r of candidateReminders) {
        const existing = seenMap[r.id];
        if (!existing) {
          seenMap[r.id] = now.toISOString();
          filteredReminders.push(r);
          continue;
        }

        const ageHours = diffHours(now, new Date(existing));
        if (ageHours < REMINDER_TTL_HOURS) filteredReminders.push(r);
        else delete seenMap[r.id];
      }

      saveReminderSeenMap(seenMap);
      setReminders(filteredReminders);
    } catch {
      setReminders([]);
    } finally {
      setLoadingReminders(false);
    }
  }, [user, teamId]);

  useEffect(() => {
    if (!user || !teamId) {
      setReminders([]);
      return;
    }
    computeReminders();
  }, [user, teamId, computeReminders]);

  useEffect(() => {
    if (!user || !teamId) return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ teamId?: string; leadId?: string }>;
      if (custom.detail?.teamId && custom.detail.teamId !== teamId) return;
      computeReminders();
    };

    window.addEventListener("lead-message-logged", handler as EventListener);
    return () =>
      window.removeEventListener(
        "lead-message-logged",
        handler as EventListener,
      );
  }, [user, teamId, computeReminders]);

  useEffect(() => {
    if (!user || !teamId) return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ teamId?: string; leadId?: string }>;
      if (custom.detail?.teamId && custom.detail.teamId !== teamId) return;
      computeReminders();
    };

    window.addEventListener("lead-stage-updated", handler as EventListener);
    return () =>
      window.removeEventListener(
        "lead-stage-updated",
        handler as EventListener,
      );
  }, [user, teamId, computeReminders]);

  const unreadCount = reminders.length;

  // ---------- theme-driven styles (match ProductSuiteHeader) ----------
  const headerBase = cn(
    "fixed top-0 right-0 z-20 flex items-center justify-between border-b px-6 py-3 transition-all duration-300",
    isDark
      ? "border-slate-800 bg-slate-950"
      : "border-slate-200 bg-white backdrop-blur",
  );

  const kickerText = "text-[11px] uppercase tracking-wide text-slate-400";
  const titleText = cn(
    "text-sm font-semibold",
    isDark ? "text-slate-100" : "text-slate-900",
  );

  // surfaces (buttons/inputs/popovers) mirror ProductSuiteHeader button styles
  const surfaceBtn = cn(
    "inline-flex items-center justify-center rounded-full border transition shadow-sm",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-100 hover:border-slate-700"
      : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600",
  );

  const iconBtn = cn("h-8 w-8", surfaceBtn);

  const inputWrap = cn(
    "hidden md:flex items-center gap-2 rounded-full border px-3 py-1 text-xs focus-within:ring-2 focus-within:ring-indigo-500",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-400"
      : "border-slate-200 bg-white text-slate-500",
  );

  const inputText = cn(
    "w-40 bg-transparent text-xs focus:outline-none",
    isDark
      ? "text-slate-200 placeholder:text-slate-500"
      : "text-slate-700 placeholder:text-slate-400",
  );

  const popoverShell = cn(
    "rounded-xl border shadow-lg text-xs",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );

  const popoverHeaderBorder = cn(
    "border-b",
    isDark ? "border-slate-900" : "border-slate-100",
  );
  const popoverTitle = cn(
    "font-semibold",
    isDark ? "text-slate-100" : "text-slate-800",
  );
  const popoverMeta = cn(
    "text-[11px]",
    isDark ? "text-slate-500" : "text-slate-400",
  );

  const reminderItemHover = isDark
    ? "hover:bg-slate-900/60"
    : "hover:bg-slate-50";
  const reminderLead = isDark ? "text-slate-100" : "text-slate-800";
  const reminderText = isDark ? "text-slate-300" : "text-slate-600";

  const profileName = isDark ? "text-slate-100" : "text-slate-900";
  const profileRole = isDark ? "text-slate-500" : "text-slate-400";
  const profileMenuMeta = isDark ? "text-slate-400" : "text-slate-500";
  const profileMenuBorder = cn(
    "border-t",
    isDark ? "border-slate-900" : "border-slate-100",
  );

  const logoutBtn = cn(
    "w-full rounded-lg px-2 py-1.5 text-xs font-semibold transition cursor-pointer",
    isDark
      ? "bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
      : "bg-rose-50 text-rose-600 hover:bg-rose-100",
  );

  // NEW: Alert pills styled similarly to reconnect button
  const alertPillBase =
    "hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer";

  const alertPillWarning = cn(
    alertPillBase,
    isDark
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
      : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  );

  const alertPillError = cn(
    alertPillBase,
    isDark
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
      : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
  );

  return (
    <header className={cn(headerBase, leftClass)}>
      <div className="flex flex-col">
        <span className={kickerText}>Lumo</span>
        <span className={titleText}>{section}</span>
      </div>

      <div className="flex items-center gap-4">
        <div ref={searchRef} className={cn(inputWrap, "gap-2")}>
          <MagnifyingGlassIcon className="h-4 w-4" />
          <input
            type="text"
            placeholder="Search leads, companies…"
            className={cn(inputText, "pr-2")}
            value={search}
            onChange={handleSearchChange}
          />

          {search.trim().length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              className={cn(
                "ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border cursor-pointer transition",
                isDark
                  ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-100 hover:border-slate-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600",
              )}
              aria-label="Clear search"
              title="Clear"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {gcReconnectNeeded && (
          <button
            type="button"
            onClick={handleGoogleReconnect}
            className={cn(
              "hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer",
              isDark
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
            )}
            title="Reconnect Google Calendar to keep booking links working"
          >
            <ClockIcon className="h-4 w-4" />
            Reconnect Google Calendar
          </button>
        )}

        {/* NEW: dynamic alerts pushed from pages (e.g. Calendar) */}
        {Object.values(headerAlerts).map((a) => {
          const isWarning = a.kind === "warning";
          const cls = isWarning ? alertPillWarning : alertPillError;
          const Icon = isWarning ? ExclamationTriangleIcon : XCircleIcon;

          return (
            <button
              key={a.id}
              type="button"
              onClick={() => handleHeaderAlertClick(a)}
              className={cls}
              title={a.title || a.text}
            >
              <Icon className="h-4 w-4" />
              {a.text}
            </button>
          );
        })}

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className={cn("relative", iconBtn)}
            aria-label="Notifications"
          >
            <BellIcon className="h-4 w-4" />

            {unreadCount === 0 ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : (
              <span className="absolute -right-1 -top-1 min-h-[18px] min-w-[18px] rounded-full bg-rose-500 px-1.5 flex items-center justify-center">
                <span className="text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              </span>
            )}
          </button>

          <div
            className={cn(
              "absolute right-0 mt-2 w-72 transition-all duration-150 ease-out origin-top-right",
              popoverShell,
              notificationsOpen
                ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                : "opacity-0 translate-y-1 scale-95 pointer-events-none",
            )}
          >
            <div
              className={cn(
                "px-3 py-2 flex items-center justify-between",
                popoverHeaderBorder,
              )}
            >
              <span className={popoverTitle}>Reminders</span>
              {loadingReminders ? (
                <span className={popoverMeta}>Checking…</span>
              ) : (
                <span className={popoverMeta}>{unreadCount} open</span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {unreadCount === 0 ? (
                <p
                  className={cn(
                    "px-3 py-3 text-[11px]",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  No follow-ups due right now.
                </p>
              ) : (
                reminders.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/leads/${r.leadId}/messages?team=${encodeURIComponent(
                          teamId ?? "",
                        )}`,
                      )
                    }
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left cursor-pointer",
                      reminderItemHover,
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 h-1.5 w-1.5 rounded-full",
                        r.type === "no_inbound"
                          ? "bg-amber-500"
                          : "bg-indigo-500",
                      )}
                    />
                    <div>
                      <p
                        className={cn(
                          "text-[11px] font-semibold",
                          reminderLead,
                        )}
                      >
                        {r.leadName}
                      </p>
                      <p className={cn("text-[11px]", reminderText)}>
                        {r.text}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div ref={profileRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 cursor-pointer"
          >
            {loadingUser ? (
              <div
                className={cn(
                  "h-8 w-8 animate-pulse rounded-full",
                  isDark ? "bg-slate-800" : "bg-slate-200",
                )}
              />
            ) : avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {initials}
              </div>
            )}

            <div className="hidden sm:flex flex-col text-left">
              <span
                className={cn(
                  "text-xs font-medium cursor-pointer",
                  profileName,
                )}
              >
                {displayName}
              </span>
              <span className={cn("text-[11px] cursor-pointer", profileRole)}>
                {displayRole}
              </span>
            </div>
          </button>

          {!loadingUser && (
            <div
              className={cn(
                "absolute right-0 top-9 mt-2 w-44 transition-all duration-150 ease-out origin-top-right",
                popoverShell,
                profileOpen
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 translate-y-1 scale-95 pointer-events-none",
              )}
            >
              <div className={cn("px-3 pt-2 pb-1 text-xs", profileMenuMeta)}>
                <p className={cn("font-medium", profileName)}>{displayName}</p>
                <p className={cn("text-[11px]", profileRole)}>{displayRole}</p>
              </div>
              <div className={cn("px-3 py-2", profileMenuBorder)}>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={logoutBtn}
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
