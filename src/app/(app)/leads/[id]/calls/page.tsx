// src/app/leads/[id]/calls/page.tsx
import CallsListClient from "@/modules/crm/components/CallsListClient";
import type { Metadata } from "next";


type PageProps =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: "Call List",
  description: "Overview of all the Calls that where made with this Lead",
};

export default async function LeadCallsPage(props: PageProps) {
  // ✅ Next.js can provide params as a Promise in newer versions
  const { id } = await Promise.resolve((props as any).params);

  const leadId = decodeURIComponent(String(id ?? "")).trim();

  return <CallsListClient leadId={leadId} />;
}
