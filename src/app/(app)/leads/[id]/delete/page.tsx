import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeleteLeadClient } from "@/features/crm/components/DeleteLeadClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("DeleteLeadPage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function DeleteLeadPage() {
  return <DeleteLeadClient />;
}
