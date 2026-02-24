// src/lib/supabaseClient.ts

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// import type { Database } from "@/types/db";

let _client: SupabaseClient | null = null;

function createBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
    // <Database>
  );
}

export const supabase: SupabaseClient = (() => {
  if (!_client) {
    _client = createBrowserClient();
  }
  return _client;
})();
