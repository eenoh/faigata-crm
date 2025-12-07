import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeadScoringConfig } from "@/modules/crm/scoring/types";

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

// GET → read config
export async function GET(req: Request) {
  const teamId = getTeamIdFromRequest(req);
  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("lead_scoring_configs")
    .select("config")
    .eq("team_id", teamId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[LeadScoring] GET error", error);
    return NextResponse.json(
      { error: "Failed to load scoring config" },
      { status: 500 }
    );
  }

  const cfg = (data?.config ?? null) as LeadScoringConfig | null;
  return NextResponse.json(cfg);
}

// POST → upsert config
export async function POST(req: Request) {
  const teamIdQuery = getTeamIdFromRequest(req);
  const body = await req.json().catch(() => ({} as any));
  const teamId: string | null = teamIdQuery ?? body.teamId ?? null;

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const config = body.config as LeadScoringConfig | undefined;
  if (!config) {
    return NextResponse.json({ error: "Missing config" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("lead_scoring_configs")
    .upsert(
      { team_id: teamId, config, updated_at: new Date().toISOString() },
      { onConflict: "team_id" }
    );

  if (error) {
    console.error("[LeadScoring] POST error", error);
    return NextResponse.json(
      { error: "Failed to save scoring config" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
