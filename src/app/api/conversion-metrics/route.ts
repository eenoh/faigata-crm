import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

export async function GET(req: Request) {
  const teamId = getTeamIdFromRequest(req);

  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversion_metrics")
    .select("id, team_id, label, from_stage_id, to_stage_id, position")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[API] Failed to fetch conversion metrics", error);
    return NextResponse.json(
      { error: "Failed to fetch conversion metrics" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
