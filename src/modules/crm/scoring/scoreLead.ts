// src/modules/crm/scoring/scoreLead.ts

import type { LeadScoringConfig, ScoreThresholds } from "./types";

export type ScoreLevel = "low" | "medium" | "high";

type LeadInput = {
  stage: string; // kept for backwards compatibility (rules may use stage later)
  custom_values: Record<string, any> | null;
};

export type ScoreResult = {
  score: number;
  level: ScoreLevel | null; // null if no thresholds configured
};

/**
 * Field-based scoring should never be able to dominate the full lead score.
 * A lead can still reach 100, but only with strong downstream behavior
 * (replies, booking activity, call outcomes, etc.).
 */
const FIELD_SCORE_MAX = 35;

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function computeLevel(
  score: number,
  thresholds?: ScoreThresholds,
): ScoreLevel | null {
  if (!thresholds) return null;

  const low = Number(thresholds.low);
  const high = Number(thresholds.high);
  const lo = Number.isFinite(low) ? low : 40;
  const hi = Number.isFinite(high) ? high : 70;

  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);

  return score < a ? "low" : score >= b ? "high" : "medium";
}

function isFilledValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function getRuleRawContribution(rule: any, value: unknown): number {
  if (!isFilledValue(value)) return 0;

  const optWeights = rule?.optionWeights;
  if (
    optWeights &&
    typeof optWeights === "object" &&
    typeof value === "string"
  ) {
    const w = optWeights[value];
    return typeof w === "number" && Number.isFinite(w) ? w : 0;
  }

  const base =
    typeof rule?.weight === "number" && Number.isFinite(rule.weight)
      ? rule.weight
      : 0;

  if (typeof value === "boolean") return value ? base : 0;
  return base;
}

function getRuleMaxPossibleContribution(rule: any): number {
  const optWeights = rule?.optionWeights;

  if (optWeights && typeof optWeights === "object") {
    const optionValues = Object.values(optWeights).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );

    if (optionValues.length === 0) return 0;

    // only positive upside counts toward the "max possible"
    return Math.max(0, ...optionValues);
  }

  const base =
    typeof rule?.weight === "number" && Number.isFinite(rule.weight)
      ? rule.weight
      : 0;

  return Math.max(0, base);
}

/**
 * Pure field-based score from the lead + config.rules.
 * - Non-select fields: weight is added if the field has any value (or true for boolean).
 * - Select fields: per-option weights from optionWeights are used.
 * - Raw rule points are normalized into a capped field-score bucket so field data
 *   alone cannot produce an excessively high total score.
 *
 * NOTE: Stage / activity / booking / call points are handled in recomputeLeadScore()
 * (separation of concerns).
 */
export function computeLeadScore(
  lead: LeadInput,
  config: LeadScoringConfig | null,
): ScoreResult | null {
  const rules = config?.rules;
  if (!rules?.length) return null;

  const values = lead.custom_values ?? {};

  let rawTotal = 0;
  let rawMaxPossible = 0;

  for (const rule of rules) {
    const key = String(rule?.fieldKey ?? "").trim();
    if (!key) continue;

    const value = values[key];

    rawTotal += getRuleRawContribution(rule, value);
    rawMaxPossible += getRuleMaxPossibleContribution(rule);
  }

  if (!Number.isFinite(rawTotal) || !Number.isFinite(rawMaxPossible)) {
    return null;
  }

  // field-only score should never go negative
  const safeRawTotal = Math.max(0, rawTotal);

  // if there is no positive upside in config, field score is 0
  const normalizedFieldScore =
    rawMaxPossible > 0 ? (safeRawTotal / rawMaxPossible) * FIELD_SCORE_MAX : 0;

  const score = clampScore(normalizedFieldScore);

  return {
    score,
    level: computeLevel(score, config?.thresholds),
  };
}
