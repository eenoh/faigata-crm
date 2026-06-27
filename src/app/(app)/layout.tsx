"use client";

import React from "react";
import { useAppLocale } from "@/context/LocaleContext";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AppSidebar } from "@/features/crm/components/layout/AppSidebar";
import { AppHeader } from "@/features/crm/components/layout/AppHeader";
import { getHtmlTextDirection } from "@/i18n/config";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <SidebarProvider>
        <AppShell>{children}</AppShell>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { locale } = useAppLocale();
  const marginClass = collapsed ? "ml-16" : "ml-64";
  const localeDirection = getHtmlTextDirection(locale);

  return (
    <div
      dir="ltr"
      data-app-shell="stable"
      className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"
    >
      <AppSidebar />

      <div
        className={`${marginClass} flex min-h-screen flex-col transition-all duration-300`}
      >
        <AppHeader />

        <main className="flex-1 overflow-y-auto px-6 pb-6 pt-16">
          <div
            className="pt-5"
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
