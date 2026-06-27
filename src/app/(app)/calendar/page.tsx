import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CalendarClient from "@/features/crm/components/CalendarClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CalendarPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function CalendarPage() {
  return <CalendarClient />;
}
