import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { AppSupabaseClient, Database } from "@/lib/supabase/types";
import { publicEnv } from "@/lib/env/public";

export async function createSupabaseServerClient(): Promise<AppSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can read but not always mutate cookies.
          }
        },
      },
    },
  );
}
