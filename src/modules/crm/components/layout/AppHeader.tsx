// src/components/layout/AppHeader.tsx
"use client";

import type React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  BellIcon,
  MagnifyingGlassIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { useSidebar } from "@/context/SidebarContext";
import { supabase } from "@/lib/supabaseClient";

function getSectionName(pathname: string): string {
  if (pathname.startsWith("/leads")) return "Leads";
  if (pathname.startsWith("/calendar")) return "Calendar";
  if (pathname.startsWith("/pipeline")) return "Pipeline";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  return "FaigataCRM";
}

type HeaderUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
  role: string | null;
};

// minimal DB shapes used for reminders
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

// NEW: TTL handling for reminders (24h)
const REMINDER_TTL_HOURS = 24;
const REMINDER_LOCALSTORAGE_KEY = "faigatacrm.headerReminderFirstSeen";

type ReminderSeenMap = Record<string, string>; // reminderId -> ISO timestamp

function loadReminderSeenMap(): ReminderSeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REMINDER_LOCALSTORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as ReminderSeenMap;
    }
  } catch (err) {
    console.warn("[Header] Failed to load reminder seen map", err);
  }
  return {};
}

function saveReminderSeenMap(map: ReminderSeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      REMINDER_LOCALSTORAGE_KEY,
      JSON.stringify(map)
    );
  } catch (err) {
    console.warn("[Header] Failed to save reminder seen map", err);
  }
}

// Use the same heuristic as LeadMessagesClient to label leads
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

  const lowerEntries = Object.entries(cv).map(([k, v]) => [k.toLowerCase(), v]);

  // 1) try preferred keys
  for (const pref of preferredKeys) {
    const match = lowerEntries.find(
      ([key, value]) =>
        key.includes(pref) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );
    if (match) return String(match[1]).trim();
  }

  // 2) otherwise any non-empty string field
  const anyField = lowerEntries.find(
    ([, value]) =>
      value !== null &&
      value !== undefined &&
      typeof value === "string" &&
      String(value).trim() !== ""
  );
  if (anyField) return String(anyField[1]).trim();

  // 3) final fallback – use stage instead of ugly id
  const stageLabel = lead.stage || "Pipeline";
  return `Lead in “${stageLabel}” stage`;
}

// role priority from lowest -> highest
const ROLE_PRIORITY: Record<string, number> = {
  prospector: 1,
  setter: 2,
  closer: 3,
  manager: 4,
  admin: 5,
};

// Takes the array from Supabase and returns the highest role
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

/** -------------------------------------------
 * NEW: Google Calendar reconnect banner (header)
 * ------------------------------------------ */
const GC_RECONNECT_FLAG_KEY = "faigatacrm.googleCalendarReconnectRequired";

function readGcReconnectFlag(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GC_RECONNECT_FLAG_KEY) === "1";
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { collapsed } = useSidebar();

  const section = getSectionName(pathname);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // notifications
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // NEW: gc reconnect banner state
  const [gcReconnectNeeded, setGcReconnectNeeded] = useState(false);

  const profileRef = useRef<HTMLDivElement | null>(null);

  const leftClass = collapsed ? "left-16" : "left-64";
  const teamId = searchParams.get("team");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  // NEW: listen for reconnect-required / cleared events + initial read
  useEffect(() => {
    setGcReconnectNeeded(readGcReconnectFlag());

    const onNeed = () => setGcReconnectNeeded(true);
    const onCleared = () => setGcReconnectNeeded(false);

    window.addEventListener("gc-reconnect-required", onNeed as EventListener);
    window.addEventListener("gc-reconnect-cleared", onCleared as EventListener);

    return () => {
      window.removeEventListener("gc-reconnect-required", onNeed as EventListener);
      window.removeEventListener("gc-reconnect-cleared", onCleared as EventListener);
    };
  }, []);

  // Turn stored avatar path into a signed URL (or use legacy full URL)
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
      console.error("[Header] createSignedUrl error", error);
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
        const { data: userRes, error: userError } = await supabase.auth.getUser();

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
          console.error("[Header] Failed to load profile", profileError);
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
          const highestRole = getHighestRole(profile?.role); // pick best one

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
          }
        }
      } catch (err) {
        console.error("[Header] Failed to load user/profile", err);
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
      if (!profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }

    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  // Close on route change
  useEffect(() => {
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);

    if (!pathname.startsWith("/leads") && !pathname.startsWith("/pipeline")) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (value.trim()) {
      params.set("q", value.trim());
    } else {
      params.delete("q");
    }

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;

    router.replace(url);
  }

  const initials = (() => {
    if (!user) return "U";
    const first = user.firstName?.trim()?.charAt(0).toUpperCase();
    const last = user.lastName?.trim()?.charAt(0).toUpperCase();
    if (first && last) return `${first}${last}`;
    if (first) return first;
    if (last) return last;
    return "U";
  })();

  const displayName =
    user && (user.firstName || user.lastName)
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : "You";

  const displayRole = (() => {
    const raw = user?.role;
    if (!raw || typeof raw !== "string") return "Member";

    const value = raw.toLowerCase();

    switch (value) {
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
    } catch (err) {
      console.error("[Header] signOut error", err);
    } finally {
      router.replace("/login");
    }
  }

  // --------- REMINDERS (auto follow-ups + stage stuck) ----------
  const computeReminders = useCallback(async () => {
    if (!user || !teamId) {
      setReminders([]);
      return;
    }

    setLoadingReminders(true);

    try {
      // 1) Load leads for this setter
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, team_id, setter_id, stage, custom_values, created_at")
        .eq("team_id", teamId)
        .eq("setter_id", user.id);

      if (leadsError) {
        console.error("[Header] leads error", leadsError);
        setReminders([]);
        return;
      }

      if (!leads || leads.length === 0) {
        setReminders([]);
        return;
      }

      const leadIds = leads.map((l) => l.id);

      // 2) Load all messages for those leads
      const { data: msgs, error: msgsError } = await supabase
        .from("lead_messages")
        .select("id, team_id, lead_id, direction, channel, sent_at")
        .eq("team_id", teamId)
        .in("lead_id", leadIds)
        .order("sent_at", { ascending: false });

      if (msgsError) {
        console.error("[Header] lead_messages error", msgsError);
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

      // thresholds in hours for no-inbound after outbound
      const followupThresholds = [
        { hours: 48, label: "No reply in 48 hours" },
        { hours: 96, label: "No reply in 4 days" },
        { hours: 168, label: "No reply in 1 week" },
      ];

      const stageThresholdHours = 72; // 3 days

      for (const lead of leads as HeaderLead[]) {
        const leadMsgs = byLead.get(lead.id) ?? [];

        // ----- no inbound after outbound -----
        const lastOutbound = leadMsgs.find((m) => m.direction === "outbound");
        const lastInbound = leadMsgs.find((m) => m.direction === "inbound");

        if (
          lastOutbound &&
          (!lastInbound ||
            new Date(lastInbound.sent_at) < new Date(lastOutbound.sent_at))
        ) {
          const hoursSince = diffHours(now, new Date(lastOutbound.sent_at));

          // pick highest threshold that is passed
          let followLabel: string | null = null;
          for (let i = followupThresholds.length - 1; i >= 0; i--) {
            if (hoursSince >= followupThresholds[i].hours) {
              followLabel = followupThresholds[i].label;
              break;
            }
          }

          if (followLabel) {
            const reminderId = `noinbound-${lead.id}-${lastOutbound.sent_at}`;

            candidateReminders.push({
              id: reminderId,
              type: "no_inbound",
              leadId: lead.id,
              leadName: leadDisplayName(lead),
              text: `${followLabel} after your last message.`,
            });
          }
        }

        // ----- stage stuck -----
        const stageMsgs = leadMsgs.filter(
          (m) => (m.channel ?? "").toLowerCase() === "pipeline"
        );
        const lastStageChange = stageMsgs.length
          ? new Date(stageMsgs[0].sent_at)
          : new Date(lead.created_at);

        const hoursInStage = diffHours(now, lastStageChange);

        if (hoursInStage >= stageThresholdHours) {
          const reminderId = `stage-${lead.id}-${lastStageChange.toISOString()}`;

          candidateReminders.push({
            id: reminderId,
            type: "stage_stuck",
            leadId: lead.id,
            leadName: leadDisplayName(lead),
            text: `In stage "${lead.stage}" for more than 3 days.`,
          });
        }
      }

      // apply 24h TTL per reminder instance
      const seenMap = loadReminderSeenMap();
      const ttlHours = REMINDER_TTL_HOURS;
      const filteredReminders: Reminder[] = [];

      const candidateIds = new Set(candidateReminders.map((r) => r.id));

      // Clean up any stored entries that are no longer relevant
      for (const key of Object.keys(seenMap)) {
        if (!candidateIds.has(key)) {
          delete seenMap[key];
        }
      }

      for (const r of candidateReminders) {
        const existing = seenMap[r.id];
        if (!existing) {
          seenMap[r.id] = now.toISOString();
          filteredReminders.push(r);
          continue;
        }

        const firstSeen = new Date(existing);
        const ageHours = diffHours(now, firstSeen);

        if (ageHours < ttlHours) {
          filteredReminders.push(r);
        } else {
          delete seenMap[r.id];
        }
      }

      saveReminderSeenMap(seenMap);
      setReminders(filteredReminders);
    } catch (err) {
      console.error("[Header] computeReminders error", err);
      setReminders([]);
    } finally {
      setLoadingReminders(false);
    }
  }, [user, teamId]);

  // initial & on user/team change
  useEffect(() => {
    if (!user || !teamId) {
      setReminders([]);
      return;
    }
    computeReminders();
  }, [user, teamId, computeReminders]);

  // re-run reminders when a message is logged for this team
  useEffect(() => {
    if (!user || !teamId) return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ teamId?: string; leadId?: string }>;
      if (custom.detail?.teamId && custom.detail.teamId !== teamId) {
        return;
      }
      computeReminders();
    };

    window.addEventListener("lead-message-logged", handler as EventListener);

    return () => {
      window.removeEventListener("lead-message-logged", handler as EventListener);
    };
  }, [user, teamId, computeReminders]);

  // optional – re-run when stage is updated
  useEffect(() => {
    if (!user || !teamId) return;

    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ teamId?: string; leadId?: string }>;
      if (custom.detail?.teamId && custom.detail.teamId !== teamId) {
        return;
      }
      computeReminders();
    };

    window.addEventListener("lead-stage-updated", handler as EventListener);

    return () => {
      window.removeEventListener("lead-stage-updated", handler as EventListener);
    };
  }, [user, teamId, computeReminders]);

  const unreadCount = reminders.length;

  return (
    <header
      className={`fixed top-0 right-0 ${leftClass}
        z-20 flex items-center justify-between
        border-b border-slate-200
        bg-white/80 px-6 py-3
        backdrop-blur transition-all duration-300`}
    >
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          FaigataCRM
        </span>
        <span className="text-sm font-semibold text-slate-900">{section}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-400 focus-within:ring-2 focus-within:ring-indigo-500">
          <MagnifyingGlassIcon className="h-4 w-4" />
          <input
            type="text"
            placeholder="Search leads, companies…"
            className="w-40 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        {/* NEW: Google Calendar reconnect banner "at the clock" */}
        {gcReconnectNeeded && (
          <button
            type="button"
            onClick={() => router.push("/settings/calendar")}
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition cursor-pointer"
            title="Reconnect Google Calendar to keep booking links working"
          >
            <ClockIcon className="h-4 w-4" />
            Reconnect Google Calendar
          </button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition cursor-pointer"
            aria-label="Notifications"
          >
            <BellIcon className="h-4 w-4" />

            {/* Badge */}
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

          {/* dropdown */}
          <div
            className={`absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg text-xs 
              transition-all duration-150 ease-out origin-top-right ${
                notificationsOpen
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 translate-y-1 scale-95 pointer-events-none"
              }`}
          >
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-800">Reminders</span>
              {loadingReminders ? (
                <span className="text-[11px] text-slate-400">Checking…</span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  {unreadCount} open
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {unreadCount === 0 ? (
                <p className="px-3 py-3 text-[11px] text-slate-500">
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
                          teamId ?? ""
                        )}`
                      )
                    }
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 cursor-pointer"
                  >
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full ${
                        r.type === "no_inbound"
                          ? "bg-amber-500"
                          : "bg-indigo-500"
                      }`}
                    />
                    <div>
                      <p className="text-[11px] font-semibold text-slate-800">
                        {r.leadName}
                      </p>
                      <p className="text-[11px] text-slate-600">{r.text}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Profile area with click-to-open menu */}
        <div ref={profileRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 cursor-pointer"
          >
            {loadingUser ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
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
              <span className="text-xs font-medium text-slate-900 cursor-pointer">
                {displayName}
              </span>
              <span className="text-[11px] text-slate-400 cursor-pointer">
                {displayRole}
              </span>
            </div>
          </button>

          {/* Dropdown menu */}
          {!loadingUser && (
            <div
              className={`absolute right-0 top-9 mt-2 w-44
                rounded-xl border border-slate-200 bg-white shadow-lg
                transition-all duration-150 ease-out origin-top-right ${
                  profileOpen
                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                    : "opacity-0 translate-y-1 scale-95 pointer-events-none"
                }`}
            >
              <div className="px-3 pt-2 pb-1 text-xs text-slate-500">
                <p className="font-medium text-slate-900">{displayName}</p>
                <p className="text-[11px] text-slate-400">{displayRole}</p>
              </div>
              <div className="border-t border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
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
