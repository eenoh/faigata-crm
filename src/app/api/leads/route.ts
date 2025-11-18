// src/app/api/leads/route.ts
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
  const teamId = getTeamIdFromRequest(req);
  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert({
      team_id: teamId,
      stage: body.stage,
      custom_values: body.customValues ?? {},
    })
    .select("id, team_id, stage, custom_values, created_at")
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
  const teamId = getTeamIdFromRequest(req);
  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  const id = getLeadIdFromRequest(req);

  if (id) {
    // Single lead
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("id, team_id, stage, custom_values, created_at")
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

  // List leads
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id, team_id, stage, custom_values, created_at")
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
  const teamId = getTeamIdFromRequest(req);
  const id = getLeadIdFromRequest(req);

  if (!teamId || !id) {
    return NextResponse.json(
      { error: "Missing teamId or id" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const payload: any = {};
  if (body.stage !== undefined) payload.stage = body.stage;
  if (body.customValues !== undefined)
    payload.custom_values = body.customValues;

  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(payload)
    .eq("team_id", teamId)
    .eq("id", id)
    .select("id, team_id, stage, custom_values, created_at")
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
  const teamId = getTeamIdFromRequest(req);
  const id = getLeadIdFromRequest(req);

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
