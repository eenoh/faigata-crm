import { NextResponse } from "next/server";
import {
  getBearerToken,
  isUuid,
  pickFirstRouteParam,
} from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string | string[] }>;
};

export async function GET(req: Request, ctx: RouteContext) {
  const jwt = getBearerToken(req);
  if (!jwt) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const sb = getCrmAdminClient();

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id ? String(userData.user.id) : null;
  if (userErr || !userId) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const leadId = pickFirstRouteParam(id);

  if (!leadId || leadId === "undefined" || leadId === "null") {
    return NextResponse.json({ error: "missing_leadId" }, { status: 400 });
  }
  if (!isUuid(leadId)) {
    return NextResponse.json({ error: "invalid_leadId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const teamId = (url.searchParams.get("teamId") || "").trim();
  if (!teamId) {
    return NextResponse.json({ error: "missing_teamId" }, { status: 400 });
  }
  if (!isUuid(teamId)) {
    return NextResponse.json({ error: "invalid_teamId" }, { status: 400 });
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

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

