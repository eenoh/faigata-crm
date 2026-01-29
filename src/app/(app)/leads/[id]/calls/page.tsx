// src/app/(app)/leads/[id]/calls/page.tsx
import CallsListClient from "@/modules/crm/components/CallsListClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Call List",
  description: "Overview of all the Calls that where made with this Lead",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LeadCallsPage({ params }: Props) {
  // Next.js provides `params` as a Promise in this setup
  const { id } = await params;

  const leadId = decodeURIComponent(String(id ?? "")).trim();

  return <CallsListClient leadId={leadId} />;
}
