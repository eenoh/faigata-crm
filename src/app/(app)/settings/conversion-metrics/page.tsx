import type { Metadata } from "next";
import { ConversionMetricDefinitionsSettingsClient } from "@/features/crm/components/ConversionMetricDefinitionsSettingsClient";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ConversionMetricDefinitionsSettingsPage");

  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function ConversionMetricsSettingsPage() {
  return <ConversionMetricDefinitionsSettingsClient />;
}
