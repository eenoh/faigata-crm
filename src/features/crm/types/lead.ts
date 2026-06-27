// CRM lead domain types

// Lead stages are team-configurable pipeline records, so they must stay dynamic.
export type LeadStage = string;

export type CustomFieldType = "text" | "number" | "select" | "boolean" | "link";

export type LeadType = "individual" | "business" | null;
export type LeadInputType = Exclude<LeadType, null>;

export type LeadGender = "male" | "female" | null;
export type LeadInputGender = Exclude<LeadGender, null>;

export type LeadContactType =
  | "email"
  | "phone"
  | "instagram"
  | "facebook"
  | "reddit"
  | "twitter_x"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "other"
  | null;

export type LeadInputContactType = Exclude<LeadContactType, null>;

export type LeadSourceCategory =
  | "inbound"
  | "outbound"
  | "referral"
  | "partner"
  | "purchased"
  | null;

export type LeadInputSourceCategory = Exclude<LeadSourceCategory, null>;

export type LeadSourceName =
  | "instagram"
  | "facebook"
  | "reddit"
  | "twitter_x"
  | "other"
  | null;

export type LeadInputSourceName = Exclude<LeadSourceName, null>;

export interface LeadFieldDefinition {
  id: string;
  team_id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  optionLabels?: string[];
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

