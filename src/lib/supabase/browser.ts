import { createBrowserClient } from "@supabase/ssr";
import type { AppSupabaseClient, Database } from "@/lib/supabase/types";
import { publicEnv } from "@/lib/env/public";

let browserClient: AppSupabaseClient | null = null;

export function getSupabaseBrowserClient(): AppSupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey,
    );
  }

  return browserClient;
}
