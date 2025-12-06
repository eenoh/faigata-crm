// src/app/(app)/pipeline/page.tsx
import type { Metadata } from "next";
import { PipelineClient } from "../../../modules/crm/components/PipelineClient";

export const metadata: Metadata = {
  title: "Pipeline",
  description:
    "Visualize your sales pipeline and drag leads between stages on a Kanban board.",
};

export default function PipelinePage() {
  return <PipelineClient />;
}
