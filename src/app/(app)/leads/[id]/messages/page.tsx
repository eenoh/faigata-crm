import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeadMessagesClient } from "@/features/crm/components/LeadMessagesClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LeadMessagesPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function LeadMessagesPage() {
  return <LeadMessagesClient />;
}
