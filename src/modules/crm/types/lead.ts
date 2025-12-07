  export type LeadStage = "new" | "contacted" | "replied" | "qualified" | "booked_call" | "showed_up" | "offer" | "closed";

  export type CustomFieldType = "text" | "number" | "select" | "boolean" | "link";

  export interface LeadFieldDefinition {
    key: string;          
    label: string;        
    type: CustomFieldType;
    options?: string[];   
  }

  export interface Lead {
    id: string;
    name: string;
    company: string;
    stage: LeadStage;
    customValues?: Record<string, string | number | boolean | null>;

    score?: number | null;
    score_grade?: string | null;
    score_breakdown?: ScoreBreakdownItem[] | null;
  }

  export interface ScoreBreakdownItem {
    ruleId: string;
    label: string;
    points: number;
}
