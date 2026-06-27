export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          role: string | string[] | null;
          avatar_url: string | null;
          company_id: string | null;
          team_id: string | null;
          preferred_language: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | string[] | null;
          avatar_url?: string | null;
          company_id?: string | null;
          team_id?: string | null;
          preferred_language?: string | null;
          [key: string]: unknown;
        };
        Update: {
          first_name?: string | null;
          last_name?: string | null;
          role?: string | string[] | null;
          avatar_url?: string | null;
          company_id?: string | null;
          team_id?: string | null;
          preferred_language?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string | null;
          logo_url: string | null;
          primary_color: string | null;
          [key: string]: unknown;
        };
        Insert: {
          id?: string;
          name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          [key: string]: unknown;
        };
        Update: {
          name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          [key: string]: unknown;
        };
        Relationships: [];
      };
      teams: GenericTable;
      team_members: GenericTable;
      team_invites: GenericTable;
      team_invite_roles: GenericTable;
      organization_stripe_accounts: GenericTable;
      organization_stripe_products: GenericTable;
      organization_stripe_prices: GenericTable;
      organization_stripe_catalog_activity: GenericTable;
      custom_value_translation_sources: GenericTable;
      custom_value_translations: GenericTable;
      pipeline_stages: GenericTable;
      lead_messages: GenericTable;
      [key: string]: GenericTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
