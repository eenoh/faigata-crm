import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function jsonError(error: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function supabaseAdmin() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !serviceKey) throw new Error("missing_supabase_env");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = String(searchParams.get("slug") ?? "").trim();
    if (!slug) return jsonError("missing_slug", 400);

    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("booking_links")
      .select("id, slug, name, duration_minutes")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[crm-booking-link] query error:", error);
      return jsonError("booking_link_query_failed", 500);
    }
    if (!data) return jsonError("booking_link_not_found", 404);

    return NextResponse.json({ ok: true, link: data });
  } catch (e: any) {
    console.error("[crm-booking-link] unexpected:", e);
    return jsonError(String(e?.message ?? e), 500);
  }
}
