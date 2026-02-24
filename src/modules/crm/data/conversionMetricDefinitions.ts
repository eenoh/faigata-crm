// src/modules/crm/data/conversionMetricDefinitions.ts

export interface ConversionMetricDefinition {
  id?: string;
  label: string;
  fromStage: string;
  toStage: string;
  position: number;

  /** Maps to conversation_metrics.target_rate (int4) */
  targetRate?: number | null;
}

const ENDPOINT = "/api/crm/conversion-metrics";

async function postCRM<T>(body: unknown): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("CRM conversion metrics request failed", text);
    throw new Error("Failed to fetch conversion metric definitions");
  }

  return res.json() as Promise<T>;
}

function toIntOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? ((Math.round(n) | 0) as number) : null;
}

export async function getConversionMetricDefinitions(
  teamId: string | null,
): Promise<ConversionMetricDefinition[]> {
  if (!teamId) return [];

  // Accept either { definitions } or raw array (future-proof)
  const json = await postCRM<unknown>({ teamId, action: "get" });
  const raw = (
    Array.isArray(json) ? json : (json as any)?.definitions
  ) as any[];

  const defs = (Array.isArray(raw) ? raw : []).map(
    (d): ConversionMetricDefinition => ({
      id: d.id,
      label: d.label,
      fromStage: d.fromStage,
      toStage: d.toStage,
      position: Number(d.position ?? 0),
      // Normalize from either targetRate (camel) or target_rate (snake)
      targetRate: toIntOrNull(d?.targetRate ?? d?.target_rate),
    }),
  );

  return defs.sort((a, b) => a.position - b.position);
}

export async function saveConversionMetricDefinitions(
  teamId: string,
  defs: ConversionMetricDefinition[],
): Promise<void> {
  if (!teamId)
    throw new Error("Missing teamId when saving conversion metric definitions");

  const normalized = defs.map((d, index) => ({
    id: d.id, // keep if API uses it (safe to include)
    label: String(d.label ?? "").trim(),
    fromStage: d.fromStage,
    toStage: d.toStage,
    position: index,
    targetRate: d.targetRate == null ? null : toIntOrNull(d.targetRate),
  }));

  await postCRM<void>({
    teamId,
    action: "save",
    definitions: normalized,
  });
}
