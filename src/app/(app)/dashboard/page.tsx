// src/app/(app)/dashboard/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <p className="text-slate-600">
        Welcome to FaigataCRM. Here we’ll show your team performance and stats.
      </p>
    </>
  );
}