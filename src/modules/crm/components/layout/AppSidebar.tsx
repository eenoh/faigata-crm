// src/components/layout/AppSidebar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import {
  HomeIcon,
  UsersIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  CreditCardIcon, // ✅ Billing icon
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

type NavItem = { href: string; label: string; icon: any };

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: ChartBarIcon },
  { href: "/leads", label: "Leads", icon: UsersIcon },
  // Settings injected conditionally
  { href: "/crm", label: "Home", icon: HomeIcon },
];

type WorkspaceContext = {
  userId: string | null;
  teamId: string | null;
  teamName: string | null;
};

const PRIVILEGED_ROLES = new Set(["closer", "manager", "admin"]);

function hasPrivilegedAccess(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.some(
    (r) => typeof r === "string" && PRIVILEGED_ROLES.has(r.toLowerCase())
  );
}

function SidebarSkeleton() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
      {/* Brand row skeleton */}
      <div className="flex items-center px-3 pt-4 pb-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-slate-200/70" />
          <div className="h-5 w-24 rounded bg-slate-200/60" />
        </div>
      </div>

      {/* Nav skeleton */}
      <nav className="flex-1 space-y-2 px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="h-5 w-5 rounded bg-slate-200/70" />
            <div className="h-3 w-24 rounded bg-slate-200/50" />
          </div>
        ))}
      </nav>

      {/* Footer skeleton */}
      <div className="ml-5 border-t border-slate-100 py-3">
        <div className="h-3 w-40 rounded bg-slate-200/50" />
      </div>
    </aside>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const [mounted, setMounted] = useState(false);

  const [ctx, setCtx] = useState<WorkspaceContext>({
    userId: null,
    teamId: null,
    teamName: null,
  });

  // ✅ permissions
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canSeeCalendar, setCanSeeCalendar] = useState(false);
  const [canSeePipeline, setCanSeePipeline] = useState(false); // ✅ start false => no flash
  const [canSeeSettings, setCanSeeSettings] = useState(false);
  const [canSeeBilling, setCanSeeBilling] = useState(false); // ✅ new

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (!cancelled) {
            setCtx({ userId: null, teamId: null, teamName: null });
            setCanSeeCalendar(false);
            setCanSeePipeline(false);
            setCanSeeSettings(false);
            setCanSeeBilling(false);
            setPermissionsLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id, role")
          .eq("id", userId)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[Sidebar] Failed to load profile", profileError);
        }

        let teamId: string | null = profile?.team_id ?? null;

        if (!teamId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) teamId = metaTeam;
        }

        // normalize roles
        const roles = Array.isArray(profile?.role) ? (profile?.role as string[]) : [];
        const normRoles = roles.map((r) => String(r).trim().toLowerCase());

        // privileged: closer/manager/admin
        const privilegedAllowed = hasPrivilegedAccess(profile?.role);

        // ✅ pipeline: hide ONLY if role array is exactly ["prospector"]
        const onlyProspector = normRoles.length === 1 && normRoles[0] === "prospector";
        const pipelineAllowed = !onlyProspector;

        if (!cancelled) {
          setCanSeeCalendar(privilegedAllowed);
          setCanSeeSettings(privilegedAllowed);
          setCanSeeBilling(privilegedAllowed); // ✅ everyone privileged sees Billing
          setCanSeePipeline(pipelineAllowed);
          setPermissionsLoaded(true);
        }

        let teamName: string | null = null;
        if (teamId) {
          const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("name")
            .eq("id", teamId)
            .single();

          if (teamError) console.error("[Sidebar] Failed to load team", teamError);
          else teamName = team?.name ?? null;
        }

        if (!cancelled) setCtx({ userId, teamId, teamName });
      } catch (err) {
        console.error("[Sidebar] Failed to load workspace context", err);
        if (!cancelled) {
          setCtx({ userId: null, teamId: null, teamName: null });
          setCanSeeCalendar(false);
          setCanSeePipeline(false);
          setCanSeeSettings(false);
          setCanSeeBilling(false);
          setPermissionsLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = useMemo(() => {
    let items = [...BASE_NAV_ITEMS];

    // ✅ Insert Pipeline after Leads (only if allowed)
    if (canSeePipeline) {
      const leadsIdx = items.findIndex((i) => i.href === "/leads");
      const pipelineItem: NavItem = {
        href: "/pipeline",
        label: "Pipeline",
        icon: Squares2X2Icon,
      };

      if (leadsIdx === -1) items = [...items, pipelineItem];
      else items = [...items.slice(0, leadsIdx + 1), pipelineItem, ...items.slice(leadsIdx + 1)];
    }

    // ✅ Insert Settings before Home (only if allowed)
    if (canSeeSettings) {
      const homeIdx = items.findIndex((i) => i.href === "/crm");
      const settingsItem: NavItem = {
        href: "/settings",
        label: "Settings",
        icon: Cog6ToothIcon,
      };

      if (homeIdx === -1) items = [...items, settingsItem];
      else items = [...items.slice(0, homeIdx), settingsItem, ...items.slice(homeIdx)];
    }

    // ✅ Insert Calendar right before Settings (or before Home if Settings not present)
    if (canSeeCalendar) {
      const settingsIdx = items.findIndex((i) => i.href === "/settings");
      const homeIdx = items.findIndex((i) => i.href === "/crm");

      const calendarItem: NavItem = {
        href: "/calendar",
        label: "Calendar",
        icon: CalendarDaysIcon,
      };

      if (settingsIdx !== -1) {
        items = [...items.slice(0, settingsIdx), calendarItem, ...items.slice(settingsIdx)];
      } else if (homeIdx !== -1) {
        items = [...items.slice(0, homeIdx), calendarItem, ...items.slice(homeIdx)];
      } else {
        items = [...items, calendarItem];
      }
    }

    // ✅ Insert Billing right above Settings (and above Calendar if Calendar exists)
    if (canSeeBilling) {
      const calendarIdx = items.findIndex((i) => i.href === "/calendar");
      const settingsIdx = items.findIndex((i) => i.href === "/settings");
      const homeIdx = items.findIndex((i) => i.href === "/crm");

      const billingItem: NavItem = {
        href: "/billing",
        label: "Billing",
        icon: CreditCardIcon,
      };

      // Prefer: insert before Calendar (so it appears above calendar)
      if (calendarIdx !== -1) {
        items = [...items.slice(0, calendarIdx), billingItem, ...items.slice(calendarIdx)];
      }
      // else: insert before Settings
      else if (settingsIdx !== -1) {
        items = [...items.slice(0, settingsIdx), billingItem, ...items.slice(settingsIdx)];
      }
      // else: insert before Home
      else if (homeIdx !== -1) {
        items = [...items.slice(0, homeIdx), billingItem, ...items.slice(homeIdx)];
      } else {
        items = [...items, billingItem];
      }
    }

    return items;
  }, [canSeeBilling, canSeeCalendar, canSeePipeline, canSeeSettings]);

  // ✅ Loading state for sidebar (prevents flashing tabs)
  if (!mounted || !permissionsLoaded) {
    return <SidebarSkeleton />;
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand row */}
      <div className="flex items-center px-3 pt-4 pb-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/icons/icon-crm.svg"
            alt="Faigata CRM"
            width={36}
            height={36}
            className="rounded-lg shadow-sm"
            priority
          />

          <div
            className={`overflow-hidden transition-all duration-300 ${
              collapsed ? "w-0 opacity-0" : "w-36 opacity-100"
            }`}
          >
            <span
              className={`block truncate text-lg font-semibold text-slate-900 transform transition-transform duration-300 ${
                collapsed ? "-translate-x-3" : "translate-x-0"
              }`}
            >
              FaigataCRM
            </span>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer mini section – workspace info */}
      <div
        className={`ml-5 border-t border-slate-100 text-[11px] text-slate-400 overflow-hidden transition-all duration-300 ${
          collapsed ? "max-h-0 opacity-0 py-0" : "max-h-12 opacity-100 py-3"
        }`}
      >
        {!collapsed && (
          <p>
            Workspace:{" "}
            <span className="font-medium">{ctx.teamName ?? ctx.teamId ?? "Loading…"}</span>
          </p>
        )}
      </div>

      {/* Collapse/Expand Button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="group absolute right-[-18px] top-1/2 -translate-y-1/2 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer"
      >
        <ChevronLeftIcon
          className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
            collapsed ? "rotate-180" : ""
          }`}
        />
      </button>
    </aside>
  );
}
