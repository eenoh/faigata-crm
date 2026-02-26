// src/app/(app)/layout.tsx
"use client";

import React from "react";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AppSidebar } from "@/modules/crm/components/layout/AppSidebar";
import { AppHeader } from "@/modules/crm/components/layout/AppHeader";

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
  const marginClass = collapsed ? "ml-16" : "ml-64";

  return (
    <div className="min-h-screen overflow-y-auto bg-slate-50 text-slate-900 dark:bg-[rgb(2,6,23)] dark:text-slate-100">
      <AppSidebar />

      <div
        className={`${marginClass} flex min-h-screen flex-col transition-all duration-300`}
      >
        <AppHeader />

        <main className="flex-1 overflow-y-auto px-6 pb-6 pt-16 mt-5">
          {children}
        </main>
      </div>
    </div>
  );
}
