import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function supabaseServer() {
  return createSupabaseServerClient();
}
