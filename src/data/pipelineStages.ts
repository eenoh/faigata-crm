// src/data/pipelineStages.ts

export interface PipelineStageDef {
  name: string;
  position: number;
}

export async function getPipelineStages(
  teamId: string | null
): Promise<PipelineStageDef[]> {
  if (!teamId) return [];

  const res = await fetch(
    `/api/pipeline-stages?teamId=${encodeURIComponent(teamId)}`
  );

  if (!res.ok) {
    console.error("Failed to fetch pipeline stages", await res.text());
    throw new Error("Failed to fetch pipeline stages");
  }

  return (await res.json()) as PipelineStageDef[];
}
