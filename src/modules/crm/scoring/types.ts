// src/modules/crm/scoring/types.ts (for example)
export type ScoreThresholds = {
  low: number;   // score < low   => "low" (red)
  high: number;  // score >= high => "high" (green)
                 // between low & high => "medium" (yellow)
};

export type ScoringRule = {
  fieldKey: string;
  label: string;
  weight: number;
  optionWeights?: Record<string, number>;
};

export type LeadScoringConfig = {
  rules: ScoringRule[];
  thresholds: ScoreThresholds;
};
