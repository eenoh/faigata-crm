import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

function getLeadIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("id");
}

/* ---------- CREATE lead ---------- */
export async function POST(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const body = await req.json().catch(() => ({} as any));

  // allow teamId from URL or from JSON body (for compatibility)
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

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert({
      team_id: teamId,
      stage,
      custom_values: customValues,
      prospector_id: prospectorId, // <— NEW
    })
    .select("id, team_id, stage, custom_values, prospector_id, created_at")
    .single();

  if (error) {
    console.error("Error creating lead", error);
    return NextResponse.json(
      { error: "Failed to create lead" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
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
      .select("id, team_id, stage, custom_values, prospector_id, created_at")
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
    .select("id, team_id, stage, custom_values, prospector_id, created_at")
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
  if (updates.stage !== undefined) payload.stage = updates.stage;
  if (updates.customValues !== undefined)
    payload.custom_values = updates.customValues;
  if (updates.prospectorId !== undefined)
    payload.prospector_id = updates.prospectorId;

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(payload)
    .eq("team_id", teamId)
    .eq("id", id)
    .select("id, team_id, stage, custom_values, prospector_id, created_at")
    .single();

  if (error) {
    console.error("Error updating lead", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
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
