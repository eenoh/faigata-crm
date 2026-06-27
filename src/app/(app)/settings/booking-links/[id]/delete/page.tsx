import type { Metadata } from "next";
import DeleteSchedulePageClient from "@/features/crm/components/DeleteSchedulePageClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("DeleteSchedulePage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return <DeleteSchedulePageClient />;
}
