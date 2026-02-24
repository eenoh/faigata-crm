// src/app/api/crm/lead-messages/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

const q = (req: Request) => new URL(req.url).searchParams;
const getTeamId = (req: Request) => q(req).get("teamId")?.trim() || "";
const getLeadId = (req: Request) => q(req).get("leadId")?.trim() || "";

/* ---------- GET: list messages for one lead ---------- */
export async function GET(req: Request) {
  const teamId = getTeamId(req);
  const leadId = getLeadId(req);

  if (!teamId || !leadId)
    return json({ error: "Missing teamId or leadId" }, 400);

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
    `,
    )
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("[lead-messages][GET] Failed to fetch lead_messages", error);
    return json({ error: "Failed to fetch messages" }, 500);
  }

  return json(Array.isArray(data) ? data : []);
}

/* ---------- POST: add message ---------- */
export async function POST(req: Request) {
  const teamId = getTeamId(req);
  const leadId = getLeadId(req);

  if (!teamId || !leadId)
    return json({ error: "Missing teamId or leadId" }, 400);

  const body = (await req.json().catch(() => null)) as any;
  if (!body) return json({ error: "Invalid JSON body" }, 400);

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
    `,
    )
    .single();

  if (error) {
    console.error("[lead-messages][POST] Failed to create lead_message", error);
    return json({ error: "Failed to create message" }, 500);
  }

  // 🔁 Recompute score after the new message (for inbound frequency / pipeline moves)
  try {
    await recomputeLeadScore(teamId, leadId);
  } catch (e) {
    console.error(
      "[lead-messages][POST] Failed to recompute score after message",
      e,
    );
    // scoring failure shouldn’t block UI
  }

  return json(data);
}
