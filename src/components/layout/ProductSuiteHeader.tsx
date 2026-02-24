"use client";

import Link from "next/link";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useSidebar } from "@/context/SidebarContext";

export function ProductSuiteHeader() {
  const { collapsed } = useSidebar();

  const baseClass =
    "fixed top-0 right-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur transition-all duration-300";

  const leftClass = collapsed ? "left-16" : "left-64";

  return (
    <header className={`${baseClass} ${leftClass}`}>
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          Faigata
        </span>
        <span className="text-sm font-semibold text-slate-900">Lumo</span>
      </div>

      <Link
        href="/profile"
        title="Organization & account settings"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 hover:shadow-md"
      >
        <Cog6ToothIcon className="h-4 w-4" />
        <span className="sr-only">Organization & account settings</span>
      </Link>
    </header>
  );
}
