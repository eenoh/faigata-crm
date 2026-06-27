import { NextResponse } from "next/server";
import {
  getBearerToken,
  isUuid,
  normalizeString,
  pickFirstRouteParam,
} from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ bookingId: string }> };

const json = (data: any, status = 200) => NextResponse.json(data, { status });

function isBadId(value: unknown) {
  const normalized = normalizeString(value);
  return !normalized || normalized === "undefined" || normalized === "null" || !isUuid(normalized);
}

export async function GET(req: Request, ctx: RouteContext) {
  const jwt = getBearerToken(req);
  if (!jwt) return json({ error: "missing_token" }, 401);

  const sb = getCrmAdminClient();

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id ?? null;
  if (userErr || !userId) return json({ error: "invalid_session" }, 401);

  const { bookingId: rawBookingId } = await ctx.params;
  const bookingId = pickFirstRouteParam(rawBookingId);
  if (isBadId(bookingId)) return json({ error: "missing_bookingId" }, 400);

  const teamId = normalizeString(new URL(req.url).searchParams.get("teamId"));
  if (!teamId || teamId === "undefined" || teamId === "null") {
    return json({ error: "missing_teamId" }, 400);
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) return json({ error: profileErr.message }, 400);
  if (!profile?.team_id || String(profile.team_id) !== teamId) {
    return json({ error: "forbidden_team" }, 403);
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

