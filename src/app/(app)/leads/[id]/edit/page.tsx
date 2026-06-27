import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditLeadClient } from "@/features/crm/components/EditLeadClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("EditLeadPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function EditLeadPage() {
  return <EditLeadClient />;
}
