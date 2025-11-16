// src/components/layout/AppSidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  UsersIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/leads", label: "Leads", icon: UsersIcon },
  { href: "/pipeline", label: "Pipeline", icon: Squares2X2Icon },
  { href: "/settings/lead-fields", label: "Lead Fields", icon: Cog6ToothIcon },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 🔧 Hydration-safe: only render the real sidebar after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // While not mounted, render a minimal placeholder sidebar
  if (!mounted) {
    return (
      <aside className="relative flex flex-col border-r border-slate-200 bg-white shadow-sm w-16" />
    );
  }

  return (
    <aside
      className={`relative flex flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand row */}
      <div className="flex items-center px-3 pt-4 pb-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          {/* Fixed CRM icon */}
          <Image
            src="/icons/icon-crm.svg"
            alt="Faigata CRM"
            width={36}
            height={36}
            className="rounded-lg shadow-sm"
            priority
          />

          {/* Animated brand text */}
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

      {/* Footer mini section – animated */}
      <div
        className={`ml-5 border-t border-slate-100 text-[11px] text-slate-400 overflow-hidden transition-all duration-300 ${
          collapsed ? "max-h-0 opacity-0 py-0" : "max-h-12 opacity-100 py-3"
        }`}
      >
        {!collapsed && <p>Workspace: Default team</p>}
      </div>

      {/* Collapse/Expand Button */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="group absolute right-[-18px] top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
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
