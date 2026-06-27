import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type { Database };
export type AppSupabaseClient = SupabaseClient<Database>;
