import type { Metadata } from "next";
import { LeadDetailClient } from "../../../../modules/crm/components/LeadDetailClient";

export const metadata: Metadata = {
  title: "Lead Details",
  description:
    "View lead information and track inbound/outbound conversations with this lead.",
};

export default function LeadDetailPage() {
  return <LeadDetailClient />;
}
