// src/modules/crm/data/conversionMetricDefinitions.ts

export interface ConversionMetricDefinition {
  id?: string;
  label: string;
  fromStage: string;
  toStage: string;
  position: number;
}

/**
 * Load conversion metric definitions for a team.
 * Uses /api/crm/conversion-metrics with action: "get".
 */
export async function getConversionMetricDefinitions(
  teamId: string | null
): Promise<ConversionMetricDefinition[]> {
  if (!teamId) return [];

  const res = await fetch("/api/crm/conversion-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ teamId, action: "get" }),
  });

  if (!res.ok) {
    console.error(
      "Failed to fetch conversion metric definitions",
      await res.text()
    );
    throw new Error("Failed to fetch conversion metric definitions");
  }

  const defs = (await res.json()) as ConversionMetricDefinition[] | null;
  if (!defs) return [];

  return [...defs].sort((a, b) => a.position - b.position);
}

/**
 * Save conversion metric definitions for a team.
 * Expects /api/crm/conversion-metrics to handle action: "save".
 */
export async function saveConversionMetricDefinitions(
  teamId: string,
  defs: ConversionMetricDefinition[]
): Promise<void> {
  if (!teamId) {
    throw new Error("Missing teamId when saving conversion metric definitions");
  }

  const normalized = defs.map((d, index) => ({
    label: d.label.trim(),
    fromStage: d.fromStage,
    toStage: d.toStage,
    position: index,
  }));

  const res = await fetch("/api/crm/conversion-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      teamId,
      action: "save",
      definitions: normalized,
    }),
  });

  if (!res.ok) {
    console.error(
      "Failed to save conversion metric definitions",
      await res.text()
    );
    throw new Error("Failed to save conversion metric definitions");
  }
}
