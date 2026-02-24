// src/components/layout/AppSidebar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  HomeIcon,
  UsersIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

type NavItem = { href: string; baseHref: string; label: string; icon: any };

const PRIVILEGED_ROLES = new Set(["closer", "manager", "admin"]);

function hasPrivilegedAccess(roles: unknown): boolean {
  return (
    Array.isArray(roles) &&
    roles.some(
      (r) => typeof r === "string" && PRIVILEGED_ROLES.has(r.toLowerCase()),
    )
  );
}

function SidebarSkeleton() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
      <div className="flex items-center px-3 pt-4 pb-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-slate-200/70" />
          <div className="h-5 w-24 rounded bg-slate-200/60" />
        </div>
      </div>

      <nav className="flex-1 space-y-2 px-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="h-5 w-5 rounded bg-slate-200/70" />
            <div className="h-3 w-24 rounded bg-slate-200/50" />
          </div>
        ))}
      </nav>

      <div className="ml-5 border-t border-slate-100 py-3">
        <div className="h-3 w-40 rounded bg-slate-200/50" />
      </div>
    </aside>
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function teamIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;

  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (!parts.length) return null;

  const dashIdx = parts.indexOf("dashboard");
  if (dashIdx !== -1) {
    const candidate = parts[dashIdx + 1] ?? null;
    if (candidate && UUID_RE.test(candidate)) return candidate;
  }

  for (const seg of parts) {
    if (UUID_RE.test(seg)) return seg;
  }

  return null;
}

/** Always carry workspace context as ?teamId=... */
function withTeamId(href: string, teamId: string | null) {
  if (!teamId) return href;

  const [baseAndQuery, hash] = href.split("#");
  const [base, query = ""] = baseAndQuery.split("?");

  const params = new URLSearchParams(query);
  params.set("teamId", teamId);

  const next = `${base}?${params.toString()}`;
  return hash ? `${next}#${hash}` : next;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const {
    userId,
    teamId: ctxTeamId,
    teamName: ctxTeamName,
    loading: workspaceLoading,
  } = useWorkspace();

  const [mounted, setMounted] = useState(false);

  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canSeeCalendar, setCanSeeCalendar] = useState(false);
  const [canSeePipeline, setCanSeePipeline] = useState(false);
  const [canSeeSettings, setCanSeeSettings] = useState(false);
  const [canSeeBilling, setCanSeeBilling] = useState(false);

  useEffect(() => setMounted(true), []);

  const routeTeamId = useMemo(() => teamIdFromPathname(pathname), [pathname]);
  const effectiveTeamId = routeTeamId ?? ctxTeamId ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (workspaceLoading) return;

      if (!userId) {
        if (!cancelled) {
          setCanSeeCalendar(false);
          setCanSeePipeline(false);
          setCanSeeSettings(false);
          setCanSeeBilling(false);
          setPermissionsLoaded(true);
        }
        return;
      }

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        const roles = Array.isArray((profile as any)?.role)
          ? (((profile as any).role as unknown[]) ?? [])
          : [];

        const normRoles = roles
          .filter((r) => typeof r === "string")
          .map((r) => r.trim().toLowerCase());

        const privilegedAllowed = hasPrivilegedAccess((profile as any)?.role);

        // pipeline: hide ONLY if role array is exactly ["prospector"]
        const onlyProspector =
          normRoles.length === 1 && normRoles[0] === "prospector";
        const pipelineAllowed = !onlyProspector;

        if (!cancelled) {
          setCanSeeCalendar(privilegedAllowed);
          setCanSeeSettings(privilegedAllowed);
          setCanSeeBilling(privilegedAllowed);
          setCanSeePipeline(pipelineAllowed);
          setPermissionsLoaded(true);
        }
      } catch {
        if (!cancelled) {
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
  }, [userId, workspaceLoading]);

  const dashboardBaseHref = "/dashboard";

  const navItems = useMemo(() => {
    const href = (p: string) => withTeamId(p, effectiveTeamId);

    let items: NavItem[] = [
      {
        href: href(dashboardBaseHref),
        baseHref: dashboardBaseHref,
        label: "Dashboard",
        icon: ChartBarIcon,
      },
      {
        href: href("/leads"),
        baseHref: "/leads",
        label: "Leads",
        icon: UsersIcon,
      },
      { href: href("/crm"), baseHref: "/crm", label: "Home", icon: HomeIcon },
    ];

    if (canSeePipeline) {
      const leadsIdx = items.findIndex((i) => i.baseHref === "/leads");
      const pipelineItem: NavItem = {
        href: href("/pipeline"),
        baseHref: "/pipeline",
        label: "Pipeline",
        icon: Squares2X2Icon,
      };
      items =
        leadsIdx === -1
          ? [...items, pipelineItem]
          : [
              ...items.slice(0, leadsIdx + 1),
              pipelineItem,
              ...items.slice(leadsIdx + 1),
            ];
    }

    if (canSeeSettings) {
      const homeIdx = items.findIndex((i) => i.baseHref === "/crm");
      const settingsItem: NavItem = {
        href: href("/settings"),
        baseHref: "/settings",
        label: "Settings",
        icon: Cog6ToothIcon,
      };
      items =
        homeIdx === -1
          ? [...items, settingsItem]
          : [...items.slice(0, homeIdx), settingsItem, ...items.slice(homeIdx)];
    }

    if (canSeeCalendar) {
      const settingsIdx = items.findIndex((i) => i.baseHref === "/settings");
      const homeIdx = items.findIndex((i) => i.baseHref === "/crm");
      const calendarItem: NavItem = {
        href: href("/calendar"),
        baseHref: "/calendar",
        label: "Calendar",
        icon: CalendarDaysIcon,
      };

      if (settingsIdx !== -1)
        items = [
          ...items.slice(0, settingsIdx),
          calendarItem,
          ...items.slice(settingsIdx),
        ];
      else if (homeIdx !== -1)
        items = [
          ...items.slice(0, homeIdx),
          calendarItem,
          ...items.slice(homeIdx),
        ];
      else items = [...items, calendarItem];
    }

    if (canSeeBilling) {
      const calendarIdx = items.findIndex((i) => i.baseHref === "/calendar");
      const settingsIdx = items.findIndex((i) => i.baseHref === "/settings");
      const homeIdx = items.findIndex((i) => i.baseHref === "/crm");

      const billingItem: NavItem = {
        href: href("/billing"),
        baseHref: "/billing",
        label: "Billing",
        icon: CreditCardIcon,
      };

      if (calendarIdx !== -1)
        items = [
          ...items.slice(0, calendarIdx),
          billingItem,
          ...items.slice(calendarIdx),
        ];
      else if (settingsIdx !== -1)
        items = [
          ...items.slice(0, settingsIdx),
          billingItem,
          ...items.slice(settingsIdx),
        ];
      else if (homeIdx !== -1)
        items = [
          ...items.slice(0, homeIdx),
          billingItem,
          ...items.slice(homeIdx),
        ];
      else items = [...items, billingItem];
    }

    return items;
  }, [
    effectiveTeamId,
    canSeeBilling,
    canSeeCalendar,
    canSeePipeline,
    canSeeSettings,
  ]);

  if (!mounted || workspaceLoading || !permissionsLoaded) {
    return <SidebarSkeleton />;
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center px-3 pt-4 pb-6">
        <Link
          href={withTeamId(dashboardBaseHref, effectiveTeamId)}
          className="flex items-center gap-2"
        >
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
              Lumo
            </span>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;

          const active =
            item.baseHref === "/dashboard"
              ? pathname === "/dashboard" || pathname.startsWith("/dashboard/")
              : pathname === item.baseHref ||
                pathname.startsWith(item.baseHref + "/");

          return (
            <Link
              key={item.baseHref}
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

      <div
        className={`ml-5 border-t border-slate-100 text-[11px] text-slate-400 overflow-hidden transition-all duration-300 ${
          collapsed ? "max-h-0 opacity-0 py-0" : "max-h-12 opacity-100 py-3"
        }`}
      >
        {!collapsed && (
          <p>
            Workspace:{" "}
            <span className="font-medium">
              {ctxTeamName ?? effectiveTeamId ?? "—"}
            </span>
          </p>
        )}
      </div>

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
