// src/app/(app)/settings/conversion-metrics/page.tsx
import type { Metadata } from "next";
import { ConversionMetricDefinitionsSettingsClient } from "@/modules/crm/components/ConversionMetricDefinitionsSettingsClient";

export const metadata: Metadata = {
  title: "Conversion Metrics",
  description:
    "Define the conversion metrics you track between pipeline stages.",
};

export default function ConversionMetricsSettingsPage() {
  return <ConversionMetricDefinitionsSettingsClient />;
}
