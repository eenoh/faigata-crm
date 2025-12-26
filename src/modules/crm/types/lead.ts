  export type LeadStage = "new" | "contacted" | "replied" | "qualified" | "booked_call" | "showed_up" | "offer" | "closed";

  export type CustomFieldType = "text" | "number" | "select" | "boolean" | "link";

  export type LeadFieldDefinition = {
    id: string;
    team_id: string;
    key: string;
    label: string;
    type: string;
    options?: any;
    position?: number;
  };

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
