import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = String(searchParams.get("slug") ?? "").trim();
    if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("booking_links")
      .select("id, slug, name, duration_minutes")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[crm-booking-link] query error:", error);
      return NextResponse.json({ error: "booking_link_query_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "booking_link_not_found" }, { status: 404 });

    return NextResponse.json({ ok: true, link: data });
  } catch (e: any) {
    console.error("[crm-booking-link] unexpected:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}