"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  BellIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useSidebar } from "@/context/SidebarContext";

function getSectionName(pathname: string): string {
  if (pathname.startsWith("/leads/new")) return "Add lead";
  if (pathname.startsWith("/leads")) return "Leads";
  if (pathname.startsWith("/pipeline")) return "Pipeline";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  return "FaigataCRM";
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const section = getSectionName(pathname);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const { collapsed } = useSidebar();

  const leftClass = collapsed ? "left-16" : "left-64";

  // Keep local state in sync if URL q changes
  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);

    // Only drive search via URL when we are on the Leads section
    if (!pathname.startsWith("/leads")) return;

    const params = new URLSearchParams(searchParams.toString());

    if (value.trim()) {
      params.set("q", value.trim());
    } else {
      params.delete("q");
    }

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;

    // Avoid scrolling to top when changing search
    router.replace(url);
  }


  return (
    <header
      className={`
        fixed
        top-0
        right-0
        ${leftClass}
        z-20
        flex items-center justify-between
        border-b border-slate-200
        bg-white/80
        px-6 py-3
        backdrop-blur
        transition-all duration-300
      `}
    >
      {/* Left: breadcrumb / context */}
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          FaigataCRM
        </span>
        <span className="text-sm font-semibold text-slate-900">
          {section}
        </span>
      </div>

      {/* Right: search + user */}
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

        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition"
          aria-label="Notifications"
        >
          <BellIcon className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            FB
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-medium text-slate-900">
              You
            </span>
            <span className="text-[11px] text-slate-400">Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
