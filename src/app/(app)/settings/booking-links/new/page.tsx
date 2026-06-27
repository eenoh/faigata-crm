import type { Metadata } from "next";
import CreateSchedulePageClient from "@/features/crm/components/CreateSchedulePageClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CreateSchedulePage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function NewSchedulePage() {
  return <CreateSchedulePageClient />;
}
