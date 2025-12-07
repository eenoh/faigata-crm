// src/app/api/crm/lead-messages/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

function getTeamId(req: Request) {
  return new URL(req.url).searchParams.get("teamId");
}

function getLeadId(req: Request) {
  return new URL(req.url).searchParams.get("leadId");
}

/* ---------- GET: list messages for one lead ---------- */
export async function GET(req: Request) {
  const teamId = getTeamId(req);
  const leadId = getLeadId(req);

  if (!teamId || !leadId) {
    return NextResponse.json(
      { error: "Missing teamId or leadId" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("lead_messages")
    .select(
      `
      id,
      team_id,
      lead_id,
      sender_profile_id,
      direction,
      channel,
      body,
      sent_at,
      created_at,
      sender:profiles!lead_messages_sender_profile_id_fkey (
        id,
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("[API] Failed to fetch lead_messages", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

/* ---------- POST: add message ---------- */
export async function POST(req: Request) {
  const teamId = getTeamId(req);
  const leadId = getLeadId(req);

  if (!teamId || !leadId) {
    return NextResponse.json(
      { error: "Missing teamId or leadId" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const payload = {
    team_id: teamId,
    lead_id: leadId,
    direction: body.direction, // 'inbound' | 'outbound'
    channel: body.channel ?? null,
    body: body.body,
    sent_at: body.sent_at ?? new Date().toISOString(),
    sender_profile_id: body.sender_profile_id ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("lead_messages")
    .insert(payload)
    .select(
      `
      id,
      team_id,
      lead_id,
      sender_profile_id,
      direction,
      channel,
      body,
      sent_at,
      created_at
    `
    )
    .single();

  if (error) {
    console.error("[API] Failed to create lead_message", error);
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 }
    );
  }

  // 🔁 Recompute score after the new message (for inbound frequency / pipeline moves)
  try {
    await recomputeLeadScore(teamId, leadId);
  } catch (e) {
    console.error("[API] Failed to recompute score after message", e);
    // we still return 201 for the message; scoring failure shouldn’t block UI
  }

  return NextResponse.json(data);
}
