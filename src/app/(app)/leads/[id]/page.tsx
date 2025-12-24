import type { Metadata } from "next";
import { LeadDetailClient } from "@/modules/crm/components/LeadDetailClient";

export const metadata: Metadata = {
  title: "Lead Details",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // ✅ important in Next 16
  return <LeadDetailClient leadId={id} />;
}
