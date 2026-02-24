// src/modules/crm/scoring/scoreLead.ts

import type { LeadScoringConfig, ScoreThresholds } from "./types";

export type ScoreLevel = "low" | "medium" | "high";

type LeadInput = {
  stage: string;
  custom_values: Record<string, any> | null;
};

export type ScoreResult = {
  score: number;
  level: ScoreLevel | null; // null if no thresholds configured
};

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function computeLevel(
  score: number,
  thresholds?: ScoreThresholds,
): ScoreLevel | null {
  if (!thresholds) return null;
  const { low, high } = thresholds;
  return score < low ? "low" : score >= high ? "high" : "medium";
}

/**
 * Pure field-based score from the lead + config.rules.
 * - Non-select fields: weight is added if the field has any value (or true for boolean).
 * - Select fields: per-option weights from optionWeights are used.
 * - Result is clamped to 0–100 and mapped to a level via thresholds.
 */
export function computeLeadScore(
  lead: LeadInput,
  config: LeadScoringConfig | null,
): ScoreResult | null {
  const rules = config?.rules;
  if (!rules?.length) return null;

  const values = lead.custom_values ?? {};
  let total = 0;

  for (const rule of rules) {
    const value = values[rule.fieldKey];
    if (value == null || value === "") continue;

    const optWeights = rule.optionWeights;
    if (optWeights && typeof value === "string") {
      const w = optWeights[value];
      if (typeof w === "number" && Number.isFinite(w)) total += w;
      continue;
    }

    const base = typeof rule.weight === "number" ? rule.weight : 0;
    total += typeof value === "boolean" ? (value ? base : 0) : base;
  }

  if (!Number.isFinite(total)) return null;

  const score = clampScore(total);
  return { score, level: computeLevel(score, config?.thresholds) };
}
