// src/app/api/crm/leads/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

function getLeadIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("id");
}

const LEAD_SELECT_COLUMNS =
  "id, team_id, stage, custom_values, prospector_id, score, score_updated_at, created_at";

/* ---------- CREATE lead ---------- */
export async function POST(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const body = await req.json().catch(() => ({} as any));

  const teamId: string | null = urlTeamId ?? body.teamId ?? null;

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const stage: string | undefined = body.stage;
  const customValues: Record<string, any> = body.customValues ?? {};
  const prospectorId: string | null = body.prospectorId ?? null;

  if (!stage) {
    return NextResponse.json({ error: "Missing stage" }, { status: 400 });
  }

  const insertPayload: any = {
    team_id: teamId,
    stage,
    custom_values: customValues,
    prospector_id: prospectorId,
  };

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert(insertPayload)
    .select(LEAD_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    console.error("Error creating lead", error);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }

  // 🔁 compute base + activity score right after creation
  try {
    await recomputeLeadScore(teamId, data.id);
  } catch (e) {
    console.error("[LeadsAPI] recomputeLeadScore after POST failed", e);
  }

  // fetch updated row with score
  const { data: updated, error: fetchError } = await supabaseAdmin
    .from("leads")
    .select(LEAD_SELECT_COLUMNS)
    .eq("team_id", teamId)
    .eq("id", data.id)
    .single();

  if (fetchError || !updated) {
    // fall back to original response if re-fetch fails
    return NextResponse.json(data);
  }

  return NextResponse.json(updated);
}

/* ---------- GET lead(s) ---------- */
export async function GET(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const teamId = urlTeamId;
  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const id = getLeadIdFromRequest(req);

  if (id) {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(LEAD_SELECT_COLUMNS)
      .eq("team_id", teamId)
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching lead", error);
      return NextResponse.json(
        { error: "Failed to fetch lead" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .select(LEAD_SELECT_COLUMNS)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching leads", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

/* ---------- UPDATE lead ---------- */
export async function PATCH(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const urlId = getLeadIdFromRequest(req);
  const body = await req.json().catch(() => ({} as any));

  const teamId: string | null = urlTeamId ?? body.teamId ?? null;
  const id: string | null = urlId ?? body.id ?? null;

  if (!teamId || !id) {
    return NextResponse.json(
      { error: "Missing teamId or id" },
      { status: 400 }
    );
  }

  const updates = body.updates ?? body;

  const payload: any = {};
  let shouldRecomputeScore = false;

  if (updates.stage !== undefined) {
    payload.stage = updates.stage;
    shouldRecomputeScore = true;
  }
  if (updates.customValues !== undefined) {
    payload.custom_values = updates.customValues;
    shouldRecomputeScore = true;
  }
  if (updates.prospectorId !== undefined) {
    payload.prospector_id = updates.prospectorId;
  }

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(payload)
    .eq("team_id", teamId)
    .eq("id", id)
    .select(LEAD_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    console.error("Error updating lead", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }

  if (shouldRecomputeScore) {
    try {
      await recomputeLeadScore(teamId, id);
    } catch (e) {
      console.error("[LeadsAPI] recomputeLeadScore after PATCH failed", e);
    }

    const { data: updated, error: fetchError } = await supabaseAdmin
      .from("leads")
      .select(LEAD_SELECT_COLUMNS)
      .eq("team_id", teamId)
      .eq("id", id)
      .single();

    if (!fetchError && updated) {
      return NextResponse.json(updated);
    }
  }

  return NextResponse.json(data);
}

/* ---------- DELETE lead ---------- */
export async function DELETE(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const urlId = getLeadIdFromRequest(req);
  const body = await req.json().catch(() => ({} as any));

  const teamId: string | null = urlTeamId ?? body.teamId ?? null;
  const id: string | null = urlId ?? body.id ?? null;

  if (!teamId || !id) {
    return NextResponse.json(
      { error: "Missing teamId or id" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);

  if (error) {
    console.error("Error deleting lead", error);
    return NextResponse.json(
      { error: "Failed to delete lead" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
