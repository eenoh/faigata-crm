// src/app/api/crm/leads/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

export const dynamic = "force-dynamic";

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

function getLeadIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("id");
}

// Keep this in sync with your leads table schema
const LEAD_SELECT_COLUMNS =
  "id, team_id, stage, custom_values, prospector_id, setter_id, closer_id, notes, score, score_updated_at, created_at";

type NewLeadBody = {
  teamId?: string;
  stage?: string;
  customValues?: Record<string, any>;
  prospectorId?: string | null;
  notes?: string | null;
};

/* ---------- CREATE lead ---------- */
export async function POST(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as NewLeadBody;

  const teamId: string | null = urlTeamId ?? body.teamId ?? null;
  const stage: string | undefined = body.stage;
  const customValues: Record<string, any> = body.customValues ?? {};
  const prospectorId: string | null = body.prospectorId ?? null;
  const notes: string | null =
    typeof body.notes === "string" && body.notes.trim() !== ""
      ? body.notes.trim()
      : null;

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  if (!stage) {
    return NextResponse.json({ error: "Missing stage" }, { status: 400 });
  }

  // Decide setter_id based on prospector + team roles
  let setterId: string | null = null;
  try {
    setterId = await assignSetterId(teamId, prospectorId);
  } catch (err) {
    console.error(
      "[LeadsAPI] assignSetterId failed – continuing without setter",
      err
    );
    setterId = null;
  }

  const insertPayload: any = {
    team_id: teamId,
    stage,
    custom_values: customValues,
    prospector_id: prospectorId,
    setter_id: setterId,
    notes, // <-- NEW
  };

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert(insertPayload)
    .select(LEAD_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[LeadsAPI] Error creating lead", error);
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

  // fetch updated row with score (if score function changed it)
  const { data: updated, error: fetchError } = await supabaseAdmin
    .from("leads")
    .select(LEAD_SELECT_COLUMNS)
    .eq("team_id", teamId)
    .eq("id", data.id)
    .single();

  if (fetchError || !updated) {
    // fall back to original row if re-fetch fails
    return NextResponse.json(data);
  }

  return NextResponse.json(updated);
}

/* ---------- GET lead(s) ---------- */
export async function GET(req: Request) {
  const teamId = getTeamIdFromRequest(req);

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
      console.error("[LeadsAPI] Error fetching single lead", error);
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
    console.error("[LeadsAPI] Error fetching leads", error);
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
  const body = (await req.json().catch(() => ({}))) as any;

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
  if (updates.setterId !== undefined) {
    payload.setter_id = updates.setterId;
  }
  if (updates.closerId !== undefined) {
    payload.closer_id = updates.closerId;
  }
  if (updates.notes !== undefined) {
    payload.notes =
      typeof updates.notes === "string" && updates.notes.trim() !== ""
        ? updates.notes.trim()
        : null;
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
    console.error("[LeadsAPI] Error updating lead", error);
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
  const body = (await req.json().catch(() => ({}))) as any;

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
    console.error("[LeadsAPI] Error deleting lead", error);
    return NextResponse.json(
      { error: "Failed to delete lead" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

/* ---------- setter assignment helper ---------- */
/**
 * Decide which setter_id to use for a new lead.
 *
 * Rules:
 * 1) If current user (prospectorId) has BOTH Prospector + Setter roles
 *    → setter_id = prospectorId
 * 2) Else if user has Prospector but not Setter
 *    → distribute leads as evenly as possible between all Setters on this team
 *      (based on leads created this month).
 * 3) Otherwise → no setter assigned (null).
 */
async function assignSetterId(
  teamId: string,
  prospectorId: string | null
): Promise<string | null> {
  if (!prospectorId) return null;

  // Load current user's profile + roles
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, team_id, role")
    .eq("id", prospectorId)
    .single();

  if (profileError || !profile) {
    console.error(
      "[LeadsAPI] Failed to load profile for setter assignment",
      profileError
    );
    return null;
  }

  const roles: string[] = Array.isArray(profile.role) ? profile.role : [];
  const isProspector = roles.includes("Prospector");
  const isSetter = roles.includes("Setter");

  // Rule 1: user is both Prospector and Setter -> assign to themselves
  if (isProspector && isSetter) {
    return prospectorId;
  }

  // If user is not a Prospector, don't auto-assign a setter
  if (!isProspector) {
    return null;
  }

  // Rule 2: user is Prospector but NOT Setter
  // → find all setters in this team and balance load between them.

  const { data: setterProfiles, error: settersError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("team_id", teamId)
    .contains("role", ["Setter"]); // role is a text[] / enum[] containing "Setter"

  if (settersError) {
    console.error("[LeadsAPI] Failed to load setters", settersError);
    return null;
  }

  const setterIds = (setterProfiles ?? [])
    .map((p: any) => p.id as string | null)
    .filter((id): id is string => Boolean(id));

  if (setterIds.length === 0) {
    // No setters configured for this team → no setter assignment
    return null;
  }

  // Count leads per setter for the current month, so we can pick the least-loaded one.
  const now = new Date();
  const firstOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  const { data: leadsThisMonth, error: leadsError } = await supabaseAdmin
    .from("leads")
    .select("setter_id, created_at")
    .eq("team_id", teamId)
    .in("setter_id", setterIds)
    .gte("created_at", firstOfMonth.toISOString());

  if (leadsError) {
    console.error(
      "[LeadsAPI] Failed to load leads for setter balancing",
      leadsError
    );
    // fallback: just give it to the first setter
    return setterIds[0] ?? null;
  }

  const counts: Record<string, number> = {};
  setterIds.forEach((id) => {
    counts[id] = 0;
  });

  for (const row of leadsThisMonth ?? []) {
    const id = (row as any).setter_id as string | null;
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }

  // Pick setter with the smallest count (ties broken by order in setterIds)
  let bestId: string | null = null;
  let bestCount = Infinity;

  for (const id of setterIds) {
    const c = counts[id] ?? 0;
    if (c < bestCount) {
      bestCount = c;
      bestId = id;
    }
  }

  return bestId;
}
