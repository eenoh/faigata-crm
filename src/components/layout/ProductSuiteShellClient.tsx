"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ProductSuiteSidebar } from "./ProductSuiteSidebar";
import { ProductSuiteHeader } from "./ProductSuiteHeader";
import { useTheme } from "next-themes";

type Props = { children: ReactNode };

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ProductSuiteShellInner({ children }: Props) {
  const { collapsed } = useSidebar();
  const offsetClass = collapsed ? "ml-16" : "ml-64";

  const { resolvedTheme } = useTheme();

  // ✅ gate render until theme is resolved (prevents flash / wrong bg)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <div
      className={cn(
        "min-h-screen flex",
        // ✅ background switches with light/dark theme via CSS vars
        "bg-[var(--background)]",
        // optional: keep text consistent with theme
        isDark ? "text-slate-100" : "text-slate-900",
      )}
    >
      <ProductSuiteSidebar />
      <ProductSuiteHeader />

      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300",
          offsetClass,
        )}
      >
        <main
          className={cn(
            "flex-1 px-6 pt-16 pb-6",
            // ✅ allow page scrolling (don’t trap content)
            "overflow-visible",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function ProductSuiteShellClient({ children }: Props) {
  return (
    <SidebarProvider>
      <ProductSuiteShellInner>{children}</ProductSuiteShellInner>
    </SidebarProvider>
  );
}
