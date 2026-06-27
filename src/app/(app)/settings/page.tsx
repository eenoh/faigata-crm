import type { Metadata } from "next";
import SettingsPageClient from "@/features/crm/components/SettingsPageClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SettingsPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function SettingsPage() {
  return <SettingsPageClient />;
}
