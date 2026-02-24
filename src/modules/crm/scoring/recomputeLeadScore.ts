// src/modules/crm/scoring/recomputeLeadScore.ts

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeLeadScore } from "./scoreLead";
import type { LeadScoringConfig } from "./types";

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const daysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

export async function recomputeLeadScore(
  teamId: string,
  leadId: string,
): Promise<void> {
  // 1) Load lead
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, stage, custom_values")
    .eq("team_id", teamId)
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    console.error("[Scoring] Failed to load lead for scoring", leadError);
    return;
  }

  // 2) Load scoring config JSON
  const { data: cfgRow, error: cfgError } = await supabaseAdmin
    .from("lead_scoring_configs")
    .select("config")
    .eq("team_id", teamId)
    .maybeSingle();

  if (cfgError && cfgError.code !== "PGRST116") {
    console.error("[Scoring] Failed to load scoring config", cfgError);
  }

  const config = (cfgRow?.config ?? null) as LeadScoringConfig | null;

  // 3) Base score from your existing rules (or 0 if no config)
  const baseScore =
    computeLeadScore(
      { stage: lead.stage, custom_values: lead.custom_values ?? {} },
      config,
    )?.score ?? 0;

  // 4) Activity-based bonuses (last 7 days of messages)
  const { data: recentMsgs, error: msgError } = await supabaseAdmin
    .from("lead_messages")
    .select("direction, channel, sent_at")
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .gte("sent_at", daysAgo(7).toISOString());

  if (msgError)
    console.error("[Scoring] Failed to load messages for scoring", msgError);

  const msgs =
    (recentMsgs as {
      direction: string;
      channel: string | null;
      sent_at: string;
    }[]) ?? [];

  const inboundCount = msgs.reduce(
    (n, m) => n + (m.direction === "inbound" ? 1 : 0),
    0,
  );
  const inboundBonus = inboundCount >= 5 ? 10 : inboundCount >= 3 ? 5 : 0;

  const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - twoDaysMs;
  const pipelineCount48h = msgs.reduce((n, m) => {
    const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
    const ts = Date.parse(m.sent_at);
    return n + (isPipeline && Number.isFinite(ts) && ts >= cutoff ? 1 : 0);
  }, 0);
  const pipelineBonus = pipelineCount48h >= 2 ? 5 : 0;

  const finalScore = clamp(
    Math.round(baseScore + inboundBonus + pipelineBonus),
    0,
    100,
  );

  // 5) Store
  const { error: updateError } = await supabaseAdmin
    .from("leads")
    .update({ score: finalScore, score_updated_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .eq("id", leadId);

  if (updateError)
    console.error("[Scoring] Failed to update lead score", updateError);
}
