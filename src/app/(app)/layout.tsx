import React from "react";
import "../globals.css";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#F1F5F9]">
      {/* Collapsible sidebar */}
      <AppSidebar />

      {/* Main area */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Global top header */}
        <AppHeader />

        {/* Page content */}
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
