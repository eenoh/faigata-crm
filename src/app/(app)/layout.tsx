// src/app/(app)/layout.tsx
"use client";

import React from "react";
import "../globals.css";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppShell>{children}</AppShell>
    </SidebarProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const marginClass = collapsed ? "ml-16" : "ml-64";

  return (
    // Full viewport height, no page scroll
    <div className="h-screen overflow-hidden bg-[#F1F5F9]">
      {/* Fixed sidebar (already fixed inside component) */}
      <AppSidebar />

      {/* Main area, shifted based on sidebar width, also full height */}
      <div
        className={`
          ${marginClass}
          flex h-screen flex-col overflow-hidden
          transition-all duration-300
        `}
      >
        {/* Fixed header – its own component is already position: fixed */}
        <AppHeader />

        {/* Page content: no scroll here, children like LeadsClient handle their own overflow */}
        <main className="flex-1 px-6 pt-16 pb-6 overflow-hidden mt-5">
          {children}
        </main>
      </div>
    </div>
  );
}
