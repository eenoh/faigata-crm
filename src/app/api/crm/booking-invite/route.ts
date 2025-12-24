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
    const token = String(searchParams.get("t") ?? "").trim();
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("booking_link_invites")
      .select("id, team_id, booking_link_id, lead_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[crm-booking-invite] query error:", error);
      return NextResponse.json({ error: "invite_query_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "invite_not_found" }, { status: 404 });

    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "invite_expired" }, { status: 410 });
    }

    return NextResponse.json({ ok: true, invite: data });
  } catch (e: any) {
    console.error("[crm-booking-invite] unexpected:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
