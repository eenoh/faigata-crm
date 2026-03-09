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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppSidebar />

      <div
        className={`${marginClass} flex min-h-screen flex-col transition-all duration-300`}
      >
        <AppHeader />

        {/* Header is fixed, so give content enough top padding */}
        <main className="flex-1 px-6 pb-6 pt-16 overflow-y-auto">
          {/* if you want extra spacing below header, use padding not margin */}
          <div className="pt-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
