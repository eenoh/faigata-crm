// src/app/api/crm/pipeline-stages/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function resolveUserIdFromToken(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function resolveTeamIdForUser(userId: string, teamIdParam?: string | null) {
  if (teamIdParam && teamIdParam.trim().length > 0) return teamIdParam.trim();

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return profile?.team_id ?? null;
}

async function assertMembership(userId: string, teamId: string) {
  const [{ data: member, error: memberErr }, { data: profile, error: profileErr }] =
    await Promise.all([
      supabaseAdmin
        .from("team_members")
        .select("team_id,user_id")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("team_id")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (memberErr) throw memberErr;
  if (profileErr) throw profileErr;

  const ok = Boolean(member) || profile?.team_id === teamId;
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Forbidden: not a member of this team" }, { status: 403 });
  }

  return null;
}

/** GET /api/crm/pipeline-stages?teamId=... */
export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized: missing bearer token" }, { status: 401 });
    }

    const userId = await resolveUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized: invalid session" }, { status: 401 });
    }

    const url = new URL(req.url);
    const teamIdParam = url.searchParams.get("teamId");

    const teamId = await resolveTeamIdForUser(userId, teamIdParam);
    if (!teamId) {
      return NextResponse.json({ ok: true, stages: [] }, { status: 200 });
    }

    const forbidden = await assertMembership(userId, teamId);
    if (forbidden) return forbidden;

    const { data: stages, error } = await supabaseAdmin
      .from("pipeline_stages")
      .select("name, position")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, stages: stages ?? [] }, { status: 200 });
  } catch (err: any) {
    console.error("[pipeline-stages][GET] failed", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

/** PUT /api/crm/pipeline-stages?teamId=...  body: { stages: [{name, position}] } */
export async function PUT(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized: missing bearer token" }, { status: 401 });
    }

    const userId = await resolveUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized: invalid session" }, { status: 401 });
    }

    const url = new URL(req.url);
    const teamIdParam = url.searchParams.get("teamId");

    const teamId = await resolveTeamIdForUser(userId, teamIdParam);
    if (!teamId) {
      return NextResponse.json({ ok: false, error: "Missing teamId (and no default team on profile)" }, { status: 400 });
    }

    const forbidden = await assertMembership(userId, teamId);
    if (forbidden) return forbidden;

    const body = await req.json().catch(() => null);
    const stagesRaw = body?.stages;

    if (!Array.isArray(stagesRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid payload: stages must be an array" }, { status: 400 });
    }

    const stages = stagesRaw
      .map((s: any, idx: number) => ({
        team_id: teamId,
        name: String(s?.name ?? "").trim(),
        position: Number.isFinite(Number(s?.position)) ? Number(s.position) : idx,
      }))
      .filter((s: any) => s.name.length > 0);

    // Replace strategy
    const { error: delErr } = await supabaseAdmin.from("pipeline_stages").delete().eq("team_id", teamId);
    if (delErr) throw delErr;

    if (stages.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("pipeline_stages").insert(stages);
      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("[pipeline-stages][PUT] failed", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

/**
 * Optional backwards-compatible POST (your old version)
 * POST body: { teamId }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as { teamId?: string } | null;
    const teamId = body?.teamId ?? null;
    if (!teamId) return NextResponse.json({ ok: false, error: "Missing teamId" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("pipeline_stages")
      .select("name, position")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? [], { status: 200 });
  } catch (err: any) {
    console.error("[pipeline-stages][POST] failed", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
