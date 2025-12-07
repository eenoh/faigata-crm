// src/app/(app)/settings/lead-scoring/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lead Scoring",
  description: "Define your Lead Scoring Criteria",
};

import { LeadScoringSettingsClient } from "@/modules/crm/components/LeadScoringSettingsClient";

export default function LeadScoringPage() {
  return <LeadScoringSettingsClient />;
}
