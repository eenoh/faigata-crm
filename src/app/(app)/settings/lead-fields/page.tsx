import type { Metadata } from "next";
import { LeadFieldsSettingsClient } from "./LeadFieldsSettingsClient";

export const metadata: Metadata = {
  title: "Lead Fields",
  description: "Configure which custom fields you want to track for your leads.",
};

export default function LeadFieldsPage() {
  return <LeadFieldsSettingsClient />;
}
