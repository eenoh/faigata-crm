// src/app/api/crm/pipeline-stages/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = { teamId?: string } | null;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body;
  const teamId = body?.teamId;

  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("name, position")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[pipeline-stages] fetch error", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline stages" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
