import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import type { AppSupabaseClient, Database } from "@/lib/supabase/types";

let adminClient: AppSupabaseClient | null = null;

export function getSupabaseAdminClient(): AppSupabaseClient {
  if (!adminClient) {
    adminClient = createClient<Database>(
      publicEnv.supabaseUrl,
      serverEnv.supabase.serviceRoleKey(),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return adminClient;
}
