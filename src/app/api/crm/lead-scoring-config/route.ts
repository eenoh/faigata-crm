// src/app/api/crm/lead-scoring-config/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";
import type {
  ScoringRule,
  ScoreThresholds,
  LeadScoringConfig,
} from "@/modules/crm/scoring/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

type Body = {
  teamId?: string;
  action?: "get" | "save";
  rules?: ScoringRule[];
  thresholds?: ScoreThresholds;

  /**
   * Optional escape hatch:
   * if you ever want to save config without recomputing immediately
   */
  recomputeAll?: boolean;
};

const MAX_RULE_WEIGHT = 20;
const MIN_THRESHOLD_GAP = 5;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeThresholds(thresholds?: ScoreThresholds): ScoreThresholds {
  const rawLow = sanitizeNumber(thresholds?.low, 40);
  const rawHigh = sanitizeNumber(thresholds?.high, 70);

  let low = clamp(Math.round(rawLow), 0, 95);
  let high = clamp(Math.round(rawHigh), 0, 100);

  if (high <= low) {
    high = clamp(low + MIN_THRESHOLD_GAP, 0, 100);
  }

  if (high - low < MIN_THRESHOLD_GAP) {
    high = clamp(low + MIN_THRESHOLD_GAP, 0, 100);
    if (high - low < MIN_THRESHOLD_GAP) {
      low = clamp(high - MIN_THRESHOLD_GAP, 0, 95);
    }
  }

  return { low, high };
}

function sanitizeOptionWeights(optionWeights: unknown) {
  if (!optionWeights || typeof optionWeights !== "object") return undefined;

  const entries = Object.entries(optionWeights as Record<string, unknown>)
    .map(
      ([key, value]) =>
        [
          String(key),
          clamp(
            Math.round(sanitizeNumber(value, 0)),
            -MAX_RULE_WEIGHT,
            MAX_RULE_WEIGHT,
          ),
        ] as const,
    )
    .filter(([key]) => key.trim() !== "");

  if (!entries.length) return undefined;

  return Object.fromEntries(entries) as Record<string, number>;
}

function sanitizeRules(rules?: ScoringRule[]): ScoringRule[] {
  if (!Array.isArray(rules)) return [];

  return rules
    .map((rule) => {
      const fieldKey = String((rule as any)?.fieldKey ?? "").trim();
      const label = String((rule as any)?.label ?? "").trim();
      const type = (rule as any)?.type;
      const weight = clamp(
        Math.round(sanitizeNumber((rule as any)?.weight, 0)),
        -MAX_RULE_WEIGHT,
        MAX_RULE_WEIGHT,
      );
      const optionWeights = sanitizeOptionWeights((rule as any)?.optionWeights);

      if (!fieldKey) return null;

      return {
        ...(rule as any),
        fieldKey,
        label,
        type,
        weight,
        ...(optionWeights ? { optionWeights } : {}),
      } as ScoringRule;
    })
    .filter((rule): rule is ScoringRule => Boolean(rule));
}

/**
 * Recompute scores for all leads in a team in safe chunks.
 * - chunkSize: number of leads per batch
 * - concurrency: how many recomputes run in parallel within a batch
 */
async function recomputeAllLeadsForTeam(teamId: string) {
  const { data: leadsRaw, error: leadsErr } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("team_id", teamId);

  if (leadsErr) throw leadsErr;

  const leadIds = (Array.isArray(leadsRaw) ? leadsRaw : [])
    .map((r: any) => String(r?.id ?? "").trim())
    .filter(Boolean);

  let recomputed = 0;
  let failed = 0;

  const chunkSize = 50;
  const concurrency = 10;

  for (const batch of chunk(leadIds, chunkSize)) {
    for (let i = 0; i < batch.length; i += concurrency) {
      const slice = batch.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        slice.map((leadId) => recomputeLeadScore(teamId, leadId)),
      );

      for (const r of results) {
        if (r.status === "fulfilled") recomputed += 1;
        else {
          failed += 1;
          console.error("[lead-scoring-config][recompute] failed", r.reason);
        }
      }
    }
  }

  return { total: leadIds.length, recomputed, failed };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const teamId = String(body.teamId ?? "").trim();
  const action = body.action;

  if (!teamId) return json({ error: "Missing teamId" }, 400);
  if (action !== "get" && action !== "save") {
    return json({ error: "Unsupported action" }, 400);
  }

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
    rules: sanitizeRules(body.rules),
    thresholds: sanitizeThresholds(body.thresholds),
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

  const shouldRecompute = body.recomputeAll !== false;

  if (!shouldRecompute) {
    return json({ ok: true, recompute: "skipped", config });
  }

  try {
    const stats = await recomputeAllLeadsForTeam(teamId);
    return json({ ok: true, ...stats, config });
  } catch (e: any) {
    console.error("[lead-scoring-config][save] recomputeAll failed", e);
    return json({
      ok: true,
      warning: "Config saved but recompute failed",
      error: e?.message ?? "Unknown error",
      config,
    });
  }
}
