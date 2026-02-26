"use client";

import Link from "next/link";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useSidebar } from "@/context/SidebarContext";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ProductSuiteHeader() {
  const { collapsed } = useSidebar();

  // ✅ Standard theme logic (same as other pages)
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const baseClass = cn(
    "fixed top-0 right-0 z-20 flex items-center justify-between border-b px-6 py-3 transition-all duration-300",
    isDark
      ? "border-slate-800 bg-slate-950"
      : "border-slate-200 bg-white/80 backdrop-blur",
  );

  const leftClass = collapsed ? "left-16" : "left-64";

  return (
    <header className={cn(baseClass, leftClass)}>
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Faigata
        </span>
        <span
          className={cn(
            "text-sm font-semibold",
            isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          Lumo
        </span>
      </div>

      <Link
        href="/profile"
        title="Organization & account settings"
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border transition shadow-sm",
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-100 hover:border-slate-700"
            : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600",
        )}
      >
        <Cog6ToothIcon className="h-4 w-4" />
        <span className="sr-only">Organization & account settings</span>
      </Link>
    </header>
  );
}
