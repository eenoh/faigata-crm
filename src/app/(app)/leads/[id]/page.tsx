import type { Metadata } from "next";
import { LeadDetailClient } from "@/modules/crm/components/LeadDetailClient";

export const metadata: Metadata = {
  title: "Lead Details",
};

export default async function LeadDetailPage() {
  return <LeadDetailClient />;
}
