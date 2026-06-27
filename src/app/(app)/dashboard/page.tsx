import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import DashboardClient from "@/features/crm/components/DashboardClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard.metadata");

  return {
    title: t("title"),
  };
}

export default function DashboardPage() {
  return <DashboardClient />;
}
