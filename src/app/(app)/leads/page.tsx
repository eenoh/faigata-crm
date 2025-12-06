// src/app/(app)/leads/page.tsx
import type { Metadata } from "next";
import { LeadsClient } from "../../../modules/crm/components/LeadsClient";

export const metadata: Metadata = {
  title: "Leads",
};

export default function LeadsPage() {
  return <LeadsClient />;
}
