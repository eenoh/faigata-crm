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
    console.error("Failed to fetch conversion metric definitions", await res.text());
    throw new Error("Failed to fetch conversion metric definitions");
  }

  // Accept either { definitions } or raw array (future-proof)
  const json = await res.json();
  const defsRaw = Array.isArray(json) ? json : json?.definitions;

  const defs = (Array.isArray(defsRaw) ? defsRaw : []) as any[];

  // Normalize targetRate from either targetRate (camel) or target_rate (snake)
  const normalized: ConversionMetricDefinition[] = defs.map((d) => ({
    id: d.id,
    label: d.label,
    fromStage: d.fromStage,
    toStage: d.toStage,
    position: Number(d.position ?? 0),
    targetRate:
      typeof d?.targetRate === "number"
        ? (Number.isFinite(d.targetRate) ? (d.targetRate | 0) : null)
        : typeof d?.target_rate === "number"
        ? (Number.isFinite(d.target_rate) ? (d.target_rate | 0) : null)
        : null,
  }));

  return normalized.sort((a, b) => a.position - b.position);
}

export async function saveConversionMetricDefinitions(
  teamId: string,
  defs: ConversionMetricDefinition[]
): Promise<void> {
  if (!teamId) {
    throw new Error("Missing teamId when saving conversion metric definitions");
  }

  const normalized = defs.map((d, index) => ({
    id: d.id, // keep if API uses it (safe to include)
    label: String(d.label ?? "").trim(),
    fromStage: d.fromStage,
    toStage: d.toStage,
    position: index,

    // ✅ THE IMPORTANT PART:
    targetRate:
      d.targetRate == null
        ? null
        : Number.isFinite(Number(d.targetRate))
        ? (Math.round(Number(d.targetRate)) | 0)
        : null,
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
    console.error("Failed to save conversion metric definitions", await res.text());
    throw new Error("Failed to save conversion metric definitions");
  }
}
