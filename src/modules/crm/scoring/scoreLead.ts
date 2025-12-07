// src/modules/crm/scoring/scoreLead.ts

import type { LeadScoringConfig, ScoreThresholds, ScoringRule } from "./types";

export type ScoreLevel = "low" | "medium" | "high";

type LeadInput = {
  stage: string;
  custom_values: Record<string, any> | null;
};

export type ScoreResult = {
  score: number;
  level: ScoreLevel | null; // null if no thresholds configured
};

/**
 * Pure field-based score from the lead + config.rules.
 * - Non-select fields: weight is added if the field has any value (or true for boolean).
 * - Select fields: per-option weights from optionWeights are used.
 * - Result is clamped to 0–100 and mapped to a level via thresholds.
 */
export function computeLeadScore(
  lead: LeadInput,
  config: LeadScoringConfig | null
): ScoreResult | null {
  if (!config || !config.rules || config.rules.length === 0) {
    return null;
  }

  const values = lead.custom_values ?? {};
  let total = 0;

  for (const rule of config.rules) {
    const value = values[rule.fieldKey];

    // nothing set → no points
    if (value === null || value === undefined || value === "") continue;

    const hasOptionWeights =
      rule.optionWeights && Object.keys(rule.optionWeights).length > 0;

    if (hasOptionWeights && typeof value === "string") {
      // SELECT field: use per-option weights
      const optWeight = rule.optionWeights![value];
      if (typeof optWeight === "number" && Number.isFinite(optWeight)) {
        total += optWeight;
      }
      continue;
    }

    const base = typeof rule.weight === "number" ? rule.weight : 0;

    // Non-select fields – treat weight as "points if the field is set"
    if (typeof value === "boolean") {
      if (value) total += base; // true → weight, false → 0
    } else {
      // text / number / link presence → weight
      total += base;
    }
  }

  if (!Number.isFinite(total)) {
    return null;
  }

  const clamped = clampScore(total);
  const level = computeLevel(clamped, config.thresholds);

  return { score: clamped, level };
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeLevel(
  score: number,
  thresholds?: ScoreThresholds
): ScoreLevel | null {
  if (!thresholds) return null;

  const { low, high } = thresholds;

  if (score < low) return "low";
  if (score >= high) return "high";
  return "medium";
}
