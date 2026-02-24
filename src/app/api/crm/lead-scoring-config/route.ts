// src/app/api/crm/lead-scoring-config/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  ScoringRule,
  ScoreThresholds,
  LeadScoringConfig,
} from "@/modules/crm/scoring/types";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

type Body = {
  teamId?: string;
  action?: "get" | "save";
  rules?: ScoringRule[];
  thresholds?: ScoreThresholds;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const teamId = String(body.teamId ?? "").trim();
  const action = body.action;

  if (!teamId) return json({ error: "Missing teamId" }, 400);
  if (action !== "get" && action !== "save")
    return json({ error: "Unsupported action" }, 400);

  if (action === "get") {
    const { data, error } = await supabaseAdmin
      .from("lead_scoring_configs")
      .select("config")
      .eq("team_id", teamId)
      .maybeSingle();

    if (error) {
      console.error("[lead-scoring-config][get] error", error);
      return json({ error: "Failed to load config" }, 500);
    }

    const config = (data?.config ?? {}) as Partial<LeadScoringConfig>;

    return json({
      rules: Array.isArray(config.rules) ? config.rules : [],
      thresholds: (config.thresholds ?? undefined) as
        | ScoreThresholds
        | undefined,
    });
  }

  // action === "save"
  const config: LeadScoringConfig = {
    rules: Array.isArray(body.rules) ? body.rules : [],
    thresholds: body.thresholds ?? { low: 40, high: 70 },
  };

  const { error } = await supabaseAdmin
    .from("lead_scoring_configs")
    .upsert(
      { team_id: teamId, config, updated_at: new Date().toISOString() },
      { onConflict: "team_id" },
    );

  if (error) {
    console.error("[lead-scoring-config][save] error", error);
    return json({ error: "Failed to save config" }, 500);
  }

  return json({ ok: true });
}
