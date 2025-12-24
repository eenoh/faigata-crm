"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import {
  ChevronLeftIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { supabase } from "@/lib/supabaseClient";

const navItems = [
  {
    href: "/crm",
    label: "FaigataCRM",
    iconSrc: "/icons/icon-crm.svg",
  },
];

export function ProductSuiteSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Hydration-safe render
  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      console.error("[ProductSuiteSidebar] logout failed", err);
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

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
        <Link href="/crm" className="flex items-center gap-2">
          <Image
            src="/icons/icon-faigata.svg"
            alt="Faigata"
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
              Faigata
            </span>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
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
              <Image
                src={item.iconSrc}
                alt={item.label}
                width={20}
                height={20}
                className="flex-shrink-0"
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logout button at bottom */}
      <div className="px-2 pb-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
          title={collapsed ? "Log out" : undefined}
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4 flex-shrink-0" />

          {/* Smooth text reveal/hide, icon stays fixed */}
          <div
            className={`ml-1 overflow-hidden transition-[width,opacity] duration-300 ${
              collapsed ? "w-0 opacity-0" : "w-[60px] opacity-100"
            }`}
          >
            <span className="whitespace-nowrap">
              {loggingOut ? "Logging out…" : "Log out"}
            </span>
          </div>
        </button>
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
