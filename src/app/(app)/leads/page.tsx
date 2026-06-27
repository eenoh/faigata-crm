import type { Metadata } from "next";
import { LeadsClient } from "@/features/crm/components/LeadsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("LeadsPage");

  return {
    title: t("metadata.title"),
  };
}

export default function LeadsPage() {
  return <LeadsClient />;
}
