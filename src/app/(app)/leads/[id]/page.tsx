import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadDetailClient } from "@/features/crm/components/LeadDetailClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LeadDetailPage.metadata");

  return {
    title: t("title"),
  };
}

export default async function LeadDetailPage() {
  return <LeadDetailClient />;
}
