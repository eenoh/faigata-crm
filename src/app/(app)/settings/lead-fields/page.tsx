import type { Metadata } from "next";
import { LeadFieldsSettingsClient } from "@/features/crm/components/LeadFieldsSettingsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LeadFieldsSettingsPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function LeadFieldsPage() {
  return <LeadFieldsSettingsClient />;
}
