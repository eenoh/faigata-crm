"use client";

import { useSidebar } from "@/context/SidebarContext";

export function ProductSuiteHeader() {
  const { collapsed } = useSidebar();
  const leftClass = collapsed ? "left-16" : "left-64";

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
          Faigata
        </span>
        <span className="text-sm font-semibold text-slate-900">
          Product Suite
        </span>
      </div>
    </header>
  );
}
