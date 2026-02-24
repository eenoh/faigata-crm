// src/app/api/crm/bookings/[bookingId]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Next.js can pass params as Promise
type RouteContext = { params: Promise<{ bookingId: string }> };

const json = (data: any, status = 200) => NextResponse.json(data, { status });

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) throw new Error("missing_supabase_env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (v: string) => UUID_RE.test(v);

const clean = (v: unknown) => String(v ?? "").trim();
const isBadId = (v: unknown) => {
  const s = clean(v);
  return !s || s === "undefined" || s === "null" || !isUuid(s);
};

const bearer = (req: Request) => {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
};

export async function GET(req: Request, ctx: RouteContext) {
  const jwt = bearer(req);
  if (!jwt) return json({ error: "missing_token" }, 401);

  const sb = supabaseAdmin();

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;
  if (userErr || !userId) return json({ error: "invalid_session" }, 401);

  const { bookingId: rawBookingId } = await ctx.params;
  const bookingId = clean(rawBookingId);
  if (isBadId(bookingId)) return json({ error: "missing_bookingId" }, 400); // avoids supabase invalid uuid

  const teamId = clean(new URL(req.url).searchParams.get("teamId"));
  if (!teamId || teamId === "undefined" || teamId === "null")
    return json({ error: "missing_teamId" }, 400);

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) return json({ error: profileErr.message }, 400);
  if (!profile?.team_id || String(profile.team_id) !== teamId)
    return json({ error: "forbidden_team" }, 403);

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
        closed_on_call,
        notes,
        closer_user_id,
        updated_at,
        offer_product_id
      )
    `,
    )
    .eq("id", bookingId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) return json({ error: error.message }, 400);
  if (!data) return json({ error: "not_found" }, 404);

  return json({ booking: data });
}
