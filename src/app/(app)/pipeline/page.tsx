import type { Metadata } from "next";
import { PipelineClient } from "@/features/crm/components/PipelineClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PipelinePage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function PipelinePage() {
  return <PipelineClient />;
}
