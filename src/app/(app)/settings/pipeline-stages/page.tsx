import type { Metadata } from "next";
import { PipelineStagesSettingsClient } from "@/features/crm/components/PipelineStagesSettingsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("PipelineStagesSettingsPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function PipelineStagesSettingsPage() {
  return <PipelineStagesSettingsClient />;
}
