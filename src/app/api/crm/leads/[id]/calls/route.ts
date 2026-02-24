// src/app/api/crm/leads/[id]/calls/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearer(req: Request) {
  const h =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

// ✅ IMPORTANT: Next's generated types in your build expect params to be a Promise.
type RouteContext = {
  params: Promise<{ id: string | string[] }>;
};

function pickParam(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

export async function GET(req: Request, ctx: RouteContext) {
  const jwt = getBearer(req);
  if (!jwt)
    return NextResponse.json({ error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id ? String(userData.user.id) : null;
  if (userErr || !userId) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  // ✅ unwrap params (Promise-based)
  const { id } = await ctx.params;
  const leadId = pickParam(id);

  // ✅ prevent "undefined" and bad UUIDs from ever hitting Supabase
  if (!leadId || leadId === "undefined" || leadId === "null") {
    return NextResponse.json({ error: "missing_leadId" }, { status: 400 });
  }
  if (!isUuid(leadId)) {
    return NextResponse.json({ error: "invalid_leadId" }, { status: 400 });
  }

  const url = new URL(req.url);
  // ✅ avoid `?? ""` warning (searchParams.get is string | null)
  const teamId = (url.searchParams.get("teamId") || "").trim();
  if (!teamId)
    return NextResponse.json({ error: "missing_teamId" }, { status: 400 });
  if (!isUuid(teamId))
    return NextResponse.json({ error: "invalid_teamId" }, { status: 400 });

  // Team check
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr)
    return NextResponse.json({ error: profileErr.message }, { status: 400 });

  if (!profile?.team_id || String(profile.team_id) !== teamId) {
    return NextResponse.json({ error: "forbidden_team" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("bookings")
    .select(
      `
      id,
      team_id,
      lead_id,
      owner_user_id,
      booking_link_id,
      start_at,
      end_at,
      timezone,
      event_id,
      created_at,
      booking_outcomes (
        attended_status,
        offer_made,
        offer_product_id,
        closed_on_call,
        notes,
        closer_user_id,
        updated_at
      )
    `,
    )
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .order("start_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ calls: Array.isArray(data) ? data : [] });
}
