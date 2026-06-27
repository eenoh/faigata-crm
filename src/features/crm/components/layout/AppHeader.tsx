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
import { useTranslations } from "next-intl";
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
import { useTheme } from "@/components/providers/ThemeProvider";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ===================== HEADER ALERT BRIDGE ===================== */

type HeaderAlertKind = "warning" | "error";

type HeaderAlertPayload = {
  id: string;
  kind: HeaderAlertKind;
  text: string;
  title?: string;
};

const HEADER_ALERT_EVENT = "faigata:header-alert";
const HEADER_ALERT_CLEAR_EVENT = "faigata:header-alert-clear";

/* =============================================================== */

type HeaderUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
  role: string | null;
};

type ProfileRowLike = {
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  role?: unknown;
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

type LeadRowLike = {
  id?: string;
  team_id?: string;
  setter_id?: string | null;
  stage?: string | null;
  custom_values?: Record<string, any> | null;
  created_at?: string | null;
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

const REMINDER_TTL_HOURS = 24;
const REMINDER_LOCALSTORAGE_KEY = "faigatacrm.headerReminderFirstSeen";

type ReminderSeenMap = Record<string, string>;

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

const ROLE_PRIORITY: Record<string, number> = {
  prospector: 1,
  setter: 2,
  closer: 3,
  manager: 4,
  admin: 5,
};

function getHighestRole(rawRoles: unknown): string | null {
  if (!Array.isArray(rawRoles)) {
    if (typeof rawRoles === "string" && rawRoles.trim()) return rawRoles;
    return null;
  }

  let bestRole: string | null = null;
  let bestScore = -1;

  for (const r of rawRoles) {
    if (typeof r !== "string") continue;
    const key = r.toLowerCase();
    const score = ROLE_PRIORITY[key] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestRole = r;
    }
  }

  return bestRole;
}

function getRoleLabel(
  common: ReturnType<typeof useTranslations<"Common">>,
  role: unknown,
) {
  switch (String(role ?? "").trim().toLowerCase()) {
    case "admin":
      return common("roles.admin");
    case "manager":
      return common("roles.manager");
    case "prospector":
      return common("roles.prospector");
    case "setter":
      return common("roles.setter");
    case "closer":
      return common("roles.closer");
    default:
      return common("roles.member");
  }
}

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

  const t = useTranslations("AppHeader");
  const tCommon = useTranslations("Common");
  const tSidebar = useTranslations("AppSidebar");

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const getSectionName = useCallback(
    (path: string): string => {
      if (path.startsWith("/leads")) return tSidebar("nav.leads");
      if (path.startsWith("/calendar")) return tSidebar("nav.calendar");
      if (path.startsWith("/billing")) return tSidebar("nav.billing");
      if (path.startsWith("/pipeline")) return tSidebar("nav.pipeline");
      if (path.startsWith("/settings")) return tSidebar("nav.settings");
      if (path.startsWith("/dashboard")) return tSidebar("nav.dashboard");
      return t("sections.default");
    },
    [t, tSidebar],
  );

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

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

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
          const profile = (profileData ??
            null) as unknown as ProfileRowLike | null;
          const highestRole = getHighestRole(profile?.role);

          const headerUser: HeaderUser = {
            id: userId,
            firstName: profile?.first_name ?? null,
            lastName: profile?.last_name ?? null,
            avatarPath: profile?.avatar_url ?? null,
            role: highestRole,
          };

          setUser(headerUser);

          if (headerUser.avatarPath) {
            refreshAvatar(headerUser.avatarPath);
          } else {
            setAvatarUrl(null);
          }
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }

    if (profileOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

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

  useEffect(() => {
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  const supportsHeaderSearch =
    pathname.startsWith("/leads") ||
    pathname.startsWith("/pipeline") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/settings/niches");

  function handleSearchChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);

    if (!supportsHeaderSearch) return;

    const params = new URLSearchParams(searchParams.toString());

    if (value.trim().length > 0) params.set("q", value);
    else params.delete("q");

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearSearch() {
    setSearch("");

    if (!supportsHeaderSearch) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const searchPlaceholder = pathname.startsWith("/settings/niches")
    ? t("search.placeholders.niches")
    : t("search.placeholders.default");

  const initials = (() => {
    if (!user) return t("profile.initialsFallback");
    const first = user.firstName?.trim()?.charAt(0).toUpperCase();
    const last = user.lastName?.trim()?.charAt(0).toUpperCase();
    if (first && last) return `${first}${last}`;
    return first || last || t("profile.initialsFallback");
  })();

  const displayName =
    user && (user.firstName || user.lastName)
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : t("profile.you");

  const displayRole = (() => {
    return getRoleLabel(tCommon, user?.role);
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

  function handleHeaderAlertClick(a: HeaderAlertPayload) {
    if (a.id === "calendar" && a.text.toLowerCase().includes("reconnect")) {
      handleGoogleReconnect();
      return;
    }

    if (a.text.toLowerCase().includes("session")) {
      router.push("/login");
      return;
    }

    if (a.id === "calendar") {
      router.push("/profile/integrations");
      return;
    }
  }

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

    return t("reminders.fallbackLeadInStage", {
      stage: lead.stage || t("reminders.pipelineFallback"),
    });
  }

  const computeReminders = useCallback(async () => {
    if (!user || !teamId) {
      setReminders([]);
      return;
    }

    setLoadingReminders(true);

    try {
      const { data: leadsData, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("team_id", teamId);

      if (leadsError || !leadsData?.length) {
        setReminders([]);
        return;
      }

      const leads = (leadsData as unknown as LeadRowLike[])
        .filter((lead) => lead.setter_id === user.id)
        .map((lead) => ({
          id: lead.id ?? "",
          team_id: lead.team_id ?? "",
          setter_id: lead.setter_id ?? null,
          stage: lead.stage ?? "",
          custom_values: lead.custom_values ?? null,
          created_at: lead.created_at ?? new Date().toISOString(),
        }))
        .filter((lead) => lead.id && lead.team_id);

      if (!leads.length) {
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
        const msg = m as HeaderMessage;
        const list = byLead.get(msg.lead_id) ?? [];
        list.push(msg);
        byLead.set(msg.lead_id, list);
      });

      const now = new Date();
      const candidateReminders: Reminder[] = [];

      const followupThresholds = [
        { hours: 48, key: "noReply48h" },
        { hours: 96, key: "noReply4d" },
        { hours: 168, key: "noReply1w" },
      ] as const;

      const stageThresholdHours = 72;

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

          let followLabelKey:
            | (typeof followupThresholds)[number]["key"]
            | null = null;

          for (let i = followupThresholds.length - 1; i >= 0; i--) {
            if (hoursSince >= followupThresholds[i].hours) {
              followLabelKey = followupThresholds[i].key;
              break;
            }
          }

          if (followLabelKey) {
            candidateReminders.push({
              id: `noinbound-${lead.id}-${lastOutbound.sent_at}`,
              type: "no_inbound",
              leadId: lead.id,
              leadName: leadDisplayName(lead),
              text: t(`reminders.${followLabelKey}`),
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
            text: t("reminders.stageStuck", {
              stage: lead.stage,
            }),
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
  }, [user, teamId, t]);

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
        <span className={kickerText}>{t("kicker")}</span>
        <span className={titleText}>{section}</span>
      </div>

      <div className="flex items-center gap-4">
        <div ref={searchRef} className={cn(inputWrap, "gap-2")}>
          <MagnifyingGlassIcon className="h-4 w-4" />
          <input
            type="text"
            placeholder={searchPlaceholder}
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
              aria-label={t("search.clearSearch")}
              title={tCommon("actions.clear")}
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
            title={t("calendarReconnect.title")}
          >
            <ClockIcon className="h-4 w-4" />
            {t("calendarReconnect.text")}
          </button>
        )}

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
            aria-label={t("notifications.ariaLabel")}
            title={t("notifications.title")}
          >
            <BellIcon className="h-4 w-4" />

            {unreadCount === 0 ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : (
              <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5">
                <span className="text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              </span>
            )}
          </button>

          <div
            className={cn(
              "absolute right-0 mt-2 w-72 origin-top-right transition-all duration-150 ease-out",
              popoverShell,
              notificationsOpen
                ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                : "pointer-events-none translate-y-1 scale-95 opacity-0",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2",
                popoverHeaderBorder,
              )}
            >
              <span className={popoverTitle}>{t("notifications.title")}</span>
              {loadingReminders ? (
                <span className={popoverMeta}>
                  {t("notifications.checking")}
                </span>
              ) : (
                <span className={popoverMeta}>
                  {t("notifications.openCount", { count: unreadCount })}
                </span>
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
                  {t("notifications.empty")}
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
                      "flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left",
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
            className="flex cursor-pointer items-center gap-2"
            aria-label={t("profile.menuAriaLabel")}
            title={t("profile.menuTitle")}
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

            <div className="hidden flex-col text-left sm:flex">
              <span
                className={cn(
                  "cursor-pointer text-xs font-medium",
                  profileName,
                )}
              >
                {displayName}
              </span>
              <span className={cn("cursor-pointer text-[11px]", profileRole)}>
                {displayRole}
              </span>
            </div>
          </button>

          {!loadingUser && (
            <div
              className={cn(
                "absolute right-0 top-9 mt-2 w-44 origin-top-right transition-all duration-150 ease-out",
                popoverShell,
                profileOpen
                  ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-1 scale-95 opacity-0",
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
                  {t("profile.logout")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
