// src/app/api/crm/lead-scoring-config/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // your service client
import type {
  ScoringRule,
  ScoreThresholds,
  LeadScoringConfig,
} from "@/modules/crm/scoring/types";

export async function POST(req: Request) {
  const body = await req.json();
  const { teamId, action, rules, thresholds } = body as {
    teamId?: string;
    action: "get" | "save";
    rules?: ScoringRule[];
    thresholds?: ScoreThresholds;
  };

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  if (action === "get") {
    const { data, error } = await supabaseAdmin
      .from("lead_scoring_configs")
      .select("config")
      .eq("team_id", teamId)
      .maybeSingle();

    if (error) {
      console.error("[lead-scoring-config] get error", error);
      return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
    }

    const config = (data?.config ?? {}) as Partial<LeadScoringConfig>;

    return NextResponse.json({
      rules: config.rules ?? [],
      thresholds: config.thresholds ?? undefined,
    });
  }

  if (action === "save") {
    const config: LeadScoringConfig = {
      rules: rules ?? [],
      thresholds: thresholds ?? { low: 40, high: 70 },
    };

    const { error } = await supabaseAdmin
      .from("lead_scoring_configs")
      .upsert(
        {
          team_id: teamId,
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "team_id" }
      );

    if (error) {
      console.error("[lead-scoring-config] save error", error);
      return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
