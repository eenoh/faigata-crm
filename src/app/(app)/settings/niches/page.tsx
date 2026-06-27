import type { Metadata } from "next";
import { NicheSettingsClient } from "@/features/crm/components/NicheSettingsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("NicheSettingsPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function NicheSettingsPage() {
  return <NicheSettingsClient />;
}
