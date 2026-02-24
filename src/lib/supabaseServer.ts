import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseServer(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseServer() must only be called on the server.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!anon && !service) {
    throw new Error(
      "Missing environment variables: provide SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  // Prefer service role for server-side RLS bypass (e.g. public booking pages)
  const key = service ?? anon!;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
