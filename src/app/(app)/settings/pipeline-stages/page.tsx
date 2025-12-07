// src/app/(app)/settings/pipeline-stages/page.tsx
import type { Metadata } from "next";
import { PipelineStagesSettingsClient } from "@/modules/crm/components/PipelineStagesSettingsClient";

export const metadata: Metadata = {
  title: "Pipeline Stages",
  description: "Define and organize the stages of your team's sales pipeline.",
};


export default function PipelineStagesSettingsPage() {
  return (
    <div className="p-4 md:p-6">
      <PipelineStagesSettingsClient />
    </div>
  );
}
