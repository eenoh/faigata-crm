import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewLeadClient } from "@/features/crm/components/NewLeadClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("NewLeadPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function NewLeadPage() {
  return <NewLeadClient />;
}
