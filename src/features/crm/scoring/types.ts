// src/features/crm/scoring/types.ts

export type ScoreLevel = "low" | "medium" | "high";

export interface ScoreThresholds {
  /** score < low   => "low" */
  low: number;

  /** score >= high => "high" */
  high: number;
  /** between low & high => "medium" */
}

export interface ScoringRule {
  fieldKey: string;
  label: string;

  /** Base weight added when field is considered "set" */
  weight: number;

  /**
   * Optional per-option weights (used for select fields).
   * If present and the value matches a key here,
   * that weight is used instead of the base weight.
   */
  optionWeights?: Record<string, number>;
}

export interface LeadScoringConfig {
  rules: ScoringRule[];
  thresholds: ScoreThresholds;
}
