// src/modules/crm/data/pipelineStages.ts

export interface PipelineStageDef {
  name: string;
  position: number;
}

/**
 * Load pipeline stages for a team.
 * Uses the /api/crm/pipeline-stages endpoint with action: "get".
 */
export async function getPipelineStages(
  teamId: string | null
): Promise<PipelineStageDef[]> {
  if (!teamId) return [];

  const res = await fetch("/api/crm/pipeline-stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ teamId, action: "get" }),
  });

  if (!res.ok) {
    console.error("Failed to fetch pipeline stages", await res.text());
    throw new Error("Failed to fetch pipeline stages");
  }

  const stages = (await res.json()) as PipelineStageDef[] | null;

  if (!stages) return [];

  // Make sure they are ordered by position ascending
  return [...stages].sort((a, b) => a.position - b.position);
}

/**
 * Save pipeline stages for a team.
 * Expects your API route /api/crm/pipeline-stages to handle action: "save".
 * We normalize `position` to the current array order on save.
 */
export async function savePipelineStages(
  teamId: string,
  stages: PipelineStageDef[]
): Promise<void> {
  if (!teamId) {
    throw new Error("Missing teamId when saving pipeline stages");
  }

  // Normalize positions to match the current order in the array
  const normalizedStages = stages.map((stage, index) => ({
    name: stage.name,
    position: index,
  }));

  const res = await fetch("/api/crm/pipeline-stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      teamId,
      action: "save",
      stages: normalizedStages,
    }),
  });

  if (!res.ok) {
    console.error("Failed to save pipeline stages", await res.text());
    throw new Error("Failed to save pipeline stages");
  }
}
