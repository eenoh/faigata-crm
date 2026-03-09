// src/app/api/crm/pipeline-stages/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: Request) {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

async function resolveUserIdFromToken(token: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return String(data.user.id);
}

async function resolveTeamIdForUser(
  userId: string,
  teamIdParam?: string | null,
) {
  const trimmed = typeof teamIdParam === "string" ? teamIdParam.trim() : "";
  if (trimmed) return trimmed;

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const teamId = profile?.team_id ? String(profile.team_id).trim() : "";
  return teamId || null;
}

async function assertMembership(userId: string, teamId: string) {
  const [
    { data: member, error: memberErr },
    { data: profile, error: profileErr },
  ] = await Promise.all([
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

  const ok = Boolean(member) || String(profile?.team_id ?? "") === teamId;
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Forbidden: not a member of this team" },
      { status: 403 },
    );
  }
  return null;
}

function normalizeIncomingStages(stagesRaw: unknown) {
  if (!Array.isArray(stagesRaw)) return [];

  return stagesRaw
    .map((s: any, idx: number) => {
      const id =
        typeof s?.id === "string" && s.id.trim().length > 0
          ? s.id.trim()
          : null;

      const name = String(s?.name ?? "").trim();

      const positionNum = Number(s?.position);
      const position = Number.isFinite(positionNum) ? positionNum : idx;

      const scorePointsNum = s?.score_points ?? s?.scorePoints;
      const score_points =
        scorePointsNum === undefined || scorePointsNum === null
          ? null
          : Number(scorePointsNum);

      const score_points_is_custom =
        s?.score_points_is_custom === undefined ||
        s?.score_points_is_custom === null
          ? null
          : Boolean(s.score_points_is_custom);

      return {
        id,
        name,
        position,
        score_points: Number.isFinite(score_points as number)
          ? (score_points as number)
          : null,
        score_points_is_custom,
      };
    })
    .filter((s) => s.name.length > 0);
}

function escapePostgrestCsvUuidList(ids: string[]) {
  return ids.join(",");
}

/** GET /api/crm/pipeline-stages?teamId=... */
export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: missing bearer token" },
        { status: 401 },
      );
    }

    const userId = await resolveUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: invalid session" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const teamIdParam = url.searchParams.get("teamId");
    const teamId = await resolveTeamIdForUser(userId, teamIdParam);

    if (!teamId)
      return NextResponse.json({ ok: true, stages: [] }, { status: 200 });

    const forbidden = await assertMembership(userId, teamId);
    if (forbidden) return forbidden;

    const { data, error } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) throw error;

    return NextResponse.json(
      { ok: true, stages: Array.isArray(data) ? data : [] },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("[pipeline-stages][GET] failed", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

/** PUT /api/crm/pipeline-stages?teamId=...  body: { stages: [{id?,name,position,score_points?,score_points_is_custom?}] } */
export async function PUT(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: missing bearer token" },
        { status: 401 },
      );
    }

    const userId = await resolveUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: invalid session" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const teamIdParam = url.searchParams.get("teamId");
    const teamId = await resolveTeamIdForUser(userId, teamIdParam);

    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "Missing teamId (and no default team on profile)" },
        { status: 400 },
      );
    }

    const forbidden = await assertMembership(userId, teamId);
    if (forbidden) return forbidden;

    const body = await req.json().catch(() => null);
    const incoming = normalizeIncomingStages(body?.stages);

    if (!incoming.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid payload: stages must be a non-empty array",
        },
        { status: 400 },
      );
    }

    // load existing stages WITH ids
    const { data: existingRaw, error: exErr } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", teamId);

    if (exErr) throw exErr;

    const existingList: Array<{
      id: string;
      name: string;
      position: number | null;
      score_points: number | null;
      score_points_is_custom: boolean | null;
    }> = Array.isArray(existingRaw) ? (existingRaw as any) : [];

    const existingByLower = new Map<string, (typeof existingList)[number]>();
    const existingById = new Map<string, (typeof existingList)[number]>();
    for (const s of existingList) {
      existingByLower.set(String(s.name ?? "").toLowerCase(), s);
      existingById.set(String(s.id), s);
    }

    const updates: Array<any> = [];
    const inserts: Array<any> = [];

    for (const s of incoming) {
      const byId = s.id ? existingById.get(s.id) : null;
      const byName = existingByLower.get(s.name.toLowerCase());

      const hit = byId ?? byName;

      const base = {
        team_id: teamId,
        name: s.name,
        position: s.position,
      };

      const scorePatch: any = {};
      if (s.score_points !== null) scorePatch.score_points = s.score_points;
      if (s.score_points_is_custom !== null)
        scorePatch.score_points_is_custom = s.score_points_is_custom;

      if (hit?.id) {
        updates.push({ id: String(hit.id), ...base, ...scorePatch });
      } else {
        inserts.push({ ...base, ...scorePatch });
      }
    }

    if (updates.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("pipeline_stages")
        .upsert(updates, { onConflict: "id" });

      if (upErr) throw upErr;
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("pipeline_stages")
        .insert(inserts);
      if (insErr) throw insErr;
    }

    // deletions: existing ids whose names are not in incoming
    const incomingLowerSet = new Set(incoming.map((s) => s.name.toLowerCase()));
    const toDelete = existingList.filter(
      (s) => !incomingLowerSet.has(String(s.name ?? "").toLowerCase()),
    );
    const toDeleteIds = toDelete.map((s) => String(s.id)).filter(Boolean);

    if (toDeleteIds.length > 0) {
      const csv = escapePostgrestCsvUuidList(toDeleteIds);

      // ✅ NEW: block deletion if ANY leads reference these stages
      const { data: leadRefs, error: leadRefErr } = await supabaseAdmin
        .from("leads")
        .select("id, stage_id")
        .eq("team_id", teamId)
        .in("stage_id", toDeleteIds)
        .limit(1);

      if (leadRefErr) throw leadRefErr;

      if ((Array.isArray(leadRefs) ? leadRefs : []).length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "You can’t delete a stage that is currently used by at least one lead. Move those leads to another stage first.",
          },
          { status: 409 },
        );
      }

      // existing conversion_metrics guard (keep)
      const { data: refsRaw, error: refErr } = await supabaseAdmin
        .from("conversion_metrics")
        .select("id, from_stage_id, to_stage_id")
        .eq("team_id", teamId)
        .or(`from_stage_id.in.(${csv}),to_stage_id.in.(${csv})`);

      if (refErr) throw refErr;

      const referenced = Array.isArray(refsRaw) ? refsRaw : [];
      if (referenced.length > 0) {
        const namesInUse = toDelete
          .filter((s) =>
            referenced.some(
              (r: any) =>
                String(r.from_stage_id) === String(s.id) ||
                String(r.to_stage_id) === String(s.id),
            ),
          )
          .map((s) => String(s.name ?? ""));

        return NextResponse.json(
          {
            ok: false,
            error:
              `You can’t delete stages that are used in conversion metrics: ` +
              namesInUse.join(", ") +
              `. Remove/update those conversion metrics first, then delete the stage.`,
          },
          { status: 409 },
        );
      }

      const { error: delErr } = await supabaseAdmin
        .from("pipeline_stages")
        .delete()
        .in("id", toDeleteIds);

      if (delErr) throw delErr;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("[pipeline-stages][PUT] failed", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Optional backwards-compatible POST
 * POST body: { teamId }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      teamId?: string;
    } | null;
    const teamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "Missing teamId" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) throw error;

    return NextResponse.json(Array.isArray(data) ? data : [], { status: 200 });
  } catch (err: any) {
    console.error("[pipeline-stages][POST] failed", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
