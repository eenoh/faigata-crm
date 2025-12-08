"use client";

import type { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ProductSuiteSidebar } from "./ProductSuiteSidebar";
import { ProductSuiteHeader } from "./ProductSuiteHeader";

type Props = {
  children: ReactNode;
};

function ProductSuiteShellInner({ children }: Props) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* fixed UI pieces */}
      <ProductSuiteSidebar />
      <ProductSuiteHeader />

      {/* content column – shifts with sidebar width */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          collapsed ? "ml-16" : "ml-64"
        }`}
      >
        <main className="flex-1 overflow-hidden px-6 pt-16 pb-6">
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
