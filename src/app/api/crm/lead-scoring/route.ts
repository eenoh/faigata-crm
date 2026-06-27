// src/app/api/crm/lead-scoring/route.ts
import { NextResponse } from "next/server";
import {
  loadLeadScoringConfig,
  saveLeadScoringConfig,
} from "@/features/crm/server/normalized-crm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeadScoringConfig } from "@/features/crm/scoring/types";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

const getTeamId = (req: Request) =>
  new URL(req.url).searchParams.get("teamId")?.trim() || "";

// GET → read config
export async function GET(req: Request) {
  const teamId = getTeamId(req);
  if (!teamId) return json({ error: "Missing teamId" }, 400);

  try {
    const config = await loadLeadScoringConfig(supabaseAdmin as any, teamId);
    return json(config);
  } catch (error) {
    console.error("[LeadScoring][GET] error", error);
    return json({ error: "Failed to load scoring config" }, 500);
  }
}

// POST → upsert config
export async function POST(req: Request) {
  const teamIdQuery = getTeamId(req);
  const body = (await req.json().catch(() => null)) as any;

  const teamId =
    teamIdQuery ||
    (typeof body?.teamId === "string" ? body.teamId.trim() : "") ||
    "";

  if (!teamId) return json({ error: "Missing teamId" }, 400);

  const config = (body?.config ?? null) as LeadScoringConfig | null;
  if (!config) return json({ error: "Missing config" }, 400);

  try {
    await saveLeadScoringConfig({
      admin: supabaseAdmin as any,
      teamId,
      config,
    });
  } catch (error) {
    console.error("[LeadScoring][POST] error", error);
    return json({ error: "Failed to save scoring config" }, 500);
  }

  return json({ ok: true });
}

