// CRM lead domain types

export type LeadStage =
  | "new"
  | "contacted"
  | "replied"
  | "qualified"
  | "booked_call"
  | "showed_up"
  | "offer"
  | "closed";

export type CustomFieldType = "text" | "number" | "select" | "boolean" | "link";

export interface LeadFieldDefinition {
  id: string;
  team_id: string;
  key: string;
  label: string;
  type: CustomFieldType; // tightened from string → union
  options?: string[]; // more specific than `any`
  position?: number;
}

export type LeadCustomValue = string | number | boolean | null;

export interface Lead {
  id: string;
  name: string;
  company: string;
  stage: LeadStage;

  customValues?: Record<string, LeadCustomValue>;

  score?: number | null;
  score_grade?: string | null;
  score_breakdown?: ScoreBreakdownItem[] | null;
}

export interface ScoreBreakdownItem {
  ruleId: string;
  label: string;
  points: number;
}
