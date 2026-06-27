"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAppLocale } from "@/context/LocaleContext";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ProductSuiteSidebar } from "./ProductSuiteSidebar";
import { ProductSuiteHeader } from "./ProductSuiteHeader";
import { useTheme } from "@/components/providers/ThemeProvider";
import { getHtmlTextDirection } from "@/i18n/config";

type Props = { children: ReactNode };

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function ProductSuiteShellInner({ children }: Props) {
  const { collapsed } = useSidebar();
  const { locale } = useAppLocale();
  const offsetClass = collapsed ? "ml-16" : "ml-64";
  const localeDirection = getHtmlTextDirection(locale);

  const { resolvedTheme } = useTheme();

  // ✅ gate render until theme is resolved (prevents flash / wrong bg)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  return (
    <div
      dir="ltr"
      data-app-shell="stable"
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
          <div
            data-locale-surface="content"
            data-locale-direction={localeDirection}
          >
            {children}
          </div>
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
