// src/app/(app)/layout.tsx
"use client";

import React from "react";
import "../globals.css";

import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";   // ✅ IMPORT
import { AppSidebar } from "@/modules/crm/components/layout/AppSidebar";
import { AppHeader } from "@/modules/crm/components/layout/AppHeader";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>    {/* ✅ WRAPPED HERE */}
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
    <div className="h-screen overflow-hidden bg-[#F1F5F9]">
      <AppSidebar />

      <div
        className={`
          ${marginClass}
          flex h-screen flex-col overflow-hidden
          transition-all duration-300
        `}
      >
        <AppHeader />

        <main className="flex-1 px-6 pt-16 pb-6 overflow-hidden mt-5">
          {children}
        </main>
      </div>
    </div>
  );
}
