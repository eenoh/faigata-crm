"use client";

import type { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { ProductSuiteSidebar } from "./ProductSuiteSidebar";
import { ProductSuiteHeader } from "./ProductSuiteHeader";

type Props = { children: ReactNode };

function ProductSuiteShellInner({ children }: Props) {
  const { collapsed } = useSidebar();
  const offsetClass = collapsed ? "ml-16" : "ml-64";

  return (
    <div className="min-h-screen flex bg-slate-50">
      <ProductSuiteSidebar />
      <ProductSuiteHeader />

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${offsetClass}`}
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
