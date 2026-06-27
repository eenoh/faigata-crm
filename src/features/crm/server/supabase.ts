import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppSupabaseClient, Database } from "@/lib/supabase/types";

export function getCrmAdminClient(): AppSupabaseClient {
  return getSupabaseAdminClient();
}

export function createCrmJwtClient(jwt: string): AppSupabaseClient {
  return createClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    },
  );
}