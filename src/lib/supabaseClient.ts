// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// If you have a generated Database type you can import and use it here.
// import type { Database } from "@/types/db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Export `supabase` – this is what you import in your components
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
  // <Database>  // add this generic if you have a Database type
);
