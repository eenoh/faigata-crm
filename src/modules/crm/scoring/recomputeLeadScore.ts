// src/modules/crm/scoring/recomputeLeadScore.ts

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeLeadScore } from "./scoreLead";
import type { LeadScoringConfig } from "./types";

/**
 * Recompute a lead's score using:
 *  - your manual config (fields / dropdown weights) via computeLeadScore
 *  - activity: inbound message frequency + fast pipeline movement
 *
 * Writes the final numeric score + score_updated_at back to the leads table.
 */
export async function recomputeLeadScore(
  teamId: string,
  leadId: string
): Promise<void> {
  // 1) Load the lead we want to score
  const { data: leadRow, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("id, stage, custom_values")
    .eq("team_id", teamId)
    .eq("id", leadId)
    .single();

  if (leadError || !leadRow) {
    console.error("[Scoring] Failed to load lead for scoring", leadError);
    return;
  }

  const lead = leadRow as {
    id: string;
    stage: string;
    custom_values: Record<string, any> | null;
  };

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
  const baseResult = computeLeadScore(
    {
      stage: lead.stage,
      custom_values: lead.custom_values ?? {},
    },
    config
  );

  let score = baseResult?.score ?? 0;

  // 4) Activity-based bonuses
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - 2);

  const { data: recentMsgs, error: msgError } = await supabaseAdmin
    .from("lead_messages")
    .select("direction, channel, sent_at")
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .gte("sent_at", sevenDaysAgo.toISOString());

  if (msgError) {
    console.error("[Scoring] Failed to load messages for scoring", msgError);
  }

  const msgs =
    (recentMsgs as {
      direction: string;
      channel: string | null;
      sent_at: string;
    }[]) ?? [];

  // 4a) Inbound frequency bonus (last 7 days)
  const inboundCount = msgs.filter((m) => m.direction === "inbound").length;

  if (inboundCount >= 5) {
    score += 10;
  } else if (inboundCount >= 3) {
    score += 5;
  }

  // 4b) Fast stage movement bonus (pipeline events in last 48h)
  const pipelineEvents = msgs.filter((m) => {
    const ch = (m.channel ?? "").toLowerCase();
    const ts = new Date(m.sent_at);
    return ch === "pipeline" && ts.getTime() >= twoDaysAgo.getTime();
  });

  if (pipelineEvents.length >= 2) {
    score += 5;
  }

  // 5) Clamp to 0–100 and store
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  const { error: updateError } = await supabaseAdmin
    .from("leads")
    .update({
      score: finalScore,
      score_updated_at: new Date().toISOString(),
    })
    .eq("team_id", teamId)
    .eq("id", leadId);

  if (updateError) {
    console.error("[Scoring] Failed to update lead score", updateError);
  }
}
