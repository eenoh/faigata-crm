import type { Metadata } from "next";
import { LeadScoringSettingsClient } from "@/features/crm/components/LeadScoringSettingsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LeadScoringSettingsPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function LeadScoringPage() {
  return <LeadScoringSettingsClient />;
}
