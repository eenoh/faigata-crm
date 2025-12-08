"use client";

import { useEffect, useState } from "react";
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
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: ChartBarIcon },
  { href: "/leads", label: "Leads", icon: UsersIcon },
  { href: "/pipeline", label: "Pipeline", icon: Squares2X2Icon },
  { href: "/settings", label: "Settings", icon: Cog6ToothIcon },
  { href: "/product-suite", label: "Home", icon: HomeIcon },
];

type WorkspaceContext = {
  userId: string | null;
  teamId: string | null;
  teamName: string | null;
};

export function AppSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [ctx, setCtx] = useState<WorkspaceContext>({
    userId: null,
    teamId: null,
    teamName: null,
  });

  // Hydration-safe render
  useEffect(() => {
    setMounted(true);
  }, []);

  // Always load current user + current team from Supabase
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[Sidebar] No authenticated user", userError);
          if (!cancelled) {
            setCtx({ userId: null, teamId: null, teamName: null });
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        // 1) Try to get team from profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          // PGRST116 = no rows found
          console.error("[Sidebar] Failed to load profile", profileError);
        }

        let teamId: string | null = profile?.team_id ?? null;

        // 2) Fallback: if profile has no team yet, use auth metadata.primary_team_id
        if (!teamId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) {
            teamId = metaTeam;
          }
        }

        // 3) Load team name from teams table
        let teamName: string | null = null;

        if (teamId) {
          const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("name")
            .eq("id", teamId)
            .single();

          if (teamError) {
            console.error("[Sidebar] Failed to load team", teamError);
          } else {
            teamName = team?.name ?? null;
          }
        }

        if (!cancelled) {
          setCtx({ userId, teamId, teamName });
        }
      } catch (err) {
        console.error("[Sidebar] Failed to load workspace context", err);
        if (!cancelled) {
          setCtx({ userId: null, teamId: null, teamName: null });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) {
    return (
      <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-slate-200 bg-white shadow-sm" />
    );
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

      {/* Nav items (Home + Dashboard + others) */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");

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
            <span className="font-medium">
              {ctx.teamName ?? ctx.teamId ?? "Loading…"}
            </span>
          </p>
        )}
      </div>

      {/* Collapse/Expand Button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="group absolute right-[-18px] top-1/2 -translate-y-1/2 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
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
