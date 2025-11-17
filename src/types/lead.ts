export type LeadStage = "new" | "contacted" | "replied" | "qualified" | "booked_call" | "showed_up" | "offer" | "closed";

export type CustomFieldType = "text" | "number" | "select" | "boolean" | "link";

export interface LeadFieldDefinition {
  key: string;          // "industry"
  label: string;        // "Industry"
  type: CustomFieldType;
  options?: string[];   // for select fields
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  stage: LeadStage;
  customValues?: Record<string, string | number | boolean | null>;
}

