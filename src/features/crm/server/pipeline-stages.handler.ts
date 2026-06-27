import { NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import {
  applyEntityTranslations,
  deleteEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import { isUuid } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import type { Database } from "@/types/database";

type PipelineStageRow = {
  id: string;
  name: string;
  position: number | null;
  score_points: number | null;
  score_points_is_custom: boolean | null;
};

type PipelineStageInsert =
  Database["public"]["Tables"]["pipeline_stages"]["Insert"];

type PipelineStageUpdate =
  Database["public"]["Tables"]["pipeline_stages"]["Update"];

type NormalizedIncomingStage = {
  id: string | null;
  name: string;
  position: number;
  score_points: number | null;
  score_points_is_custom: boolean | null;
};

function jsonError(error: string, status = 500) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalizeIncomingStages(
  stagesRaw: unknown,
): NormalizedIncomingStage[] {
  if (!Array.isArray(stagesRaw)) return [];

  return stagesRaw
    .map((stage, index): NormalizedIncomingStage => {
      const value = stage as Record<string, unknown>;
      const id =
        typeof value?.id === "string" && value.id.trim().length > 0
          ? value.id.trim()
          : null;
      const name = String(value?.name ?? "").trim();
      const positionNum = Number(value?.position);
      const scorePointsNum = value?.score_points ?? value?.scorePoints;
      const parsedScorePoints =
        scorePointsNum === undefined || scorePointsNum === null
          ? null
          : Number(scorePointsNum);

      return {
        id,
        name,
        position: Number.isFinite(positionNum) ? positionNum : index,
        score_points: Number.isFinite(parsedScorePoints)
          ? parsedScorePoints
          : null,
        score_points_is_custom:
          value?.score_points_is_custom == null
            ? null
            : Boolean(value.score_points_is_custom),
      };
    })
    .filter((stage) => stage.name.length > 0);
}

function escapePostgrestCsvUuidList(ids: string[]) {
  return ids.join(",");
}

async function resolveRequestedTeamId(request: Request, required = false) {
  const admin = getCrmAdminClient();
  const auth = await getCrmRequestUser(request, admin);

  if (!auth.ok) {
    return {
      ok: false as const,
      response: jsonError(
        auth.reason === "missing_auth" ? "missing_auth" : "invalid_session",
        401,
      ),
    };
  }

  try {
    const teamContext = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request,
    });

    return {
      ok: true as const,
      admin,
      userId: auth.userId,
      teamId: teamContext.teamId,
    };
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (!required && message === "missing_team") {
      return { ok: true as const, admin, teamId: null };
    }

    if (message === "not_a_member_of_team") {
      return {
        ok: false as const,
        response: jsonError("forbidden", 403),
      };
    }

    if (message === "missing_team") {
      return {
        ok: false as const,
        response: jsonError("missing_team", 400),
      };
    }

    return {
      ok: false as const,
      response: jsonError(message, 500),
    };
  }
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveRequestedTeamId(request, false);
    if (!resolved.ok) {
      return resolved.response;
    }

    const locale = await resolveRequestLocale({
      request,
      admin: resolved.admin,
      userId: "userId" in resolved ? resolved.userId : null,
    });

    if (!resolved.teamId) {
      return NextResponse.json({ ok: true, stages: [] }, { status: 200 });
    }

    const { data, error } = await resolved.admin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", resolved.teamId)
      .order("position", { ascending: true });

    if (error) {
      throw error;
    }

    const stages = (Array.isArray(data) ? data : []) as PipelineStageRow[];

    try {
      await applyEntityTranslations({
        admin: resolved.admin,
        teamId: resolved.teamId,
        entityTable: "pipeline_stages",
        rows: stages,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "name",
            sourceText: (row) => row.name,
            assign: (row, value) => {
              row.name = value;
            },
          },
        ],
      });
    } catch (error) {
      console.warn(
        "[pipeline-stages][GET] translation failed, using source values",
        error,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        stages,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[pipeline-stages][GET] failed", error);
    return jsonError(error?.message ?? "Unknown error", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const resolved = await resolveRequestedTeamId(request, true);
    if (!resolved.ok) {
      return resolved.response;
    }

    const locale = await resolveRequestLocale({
      request,
      admin: resolved.admin,
      userId: "userId" in resolved ? resolved.userId : null,
    });

    if (!resolved.teamId) {
      return jsonError("missing_team", 400);
    }

    const body = await request.json().catch(() => null);
    const incoming = normalizeIncomingStages(
      (body as { stages?: unknown } | null)?.stages,
    );

    if (!incoming.length) {
      return jsonError(
        "Invalid payload: stages must be a non-empty array",
        400,
      );
    }

    const { data: existingRaw, error: existingError } = await resolved.admin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", resolved.teamId);

    if (existingError) {
      throw existingError;
    }

    const existingStages: PipelineStageRow[] = Array.isArray(existingRaw)
      ? (existingRaw as PipelineStageRow[])
      : [];

    const existingByLower = new Map<string, PipelineStageRow>();
    const existingById = new Map<string, PipelineStageRow>();

    for (const stage of existingStages) {
      existingByLower.set(String(stage.name ?? "").toLowerCase(), stage);
      existingById.set(String(stage.id), stage);
    }

    const updates: PipelineStageInsert[] = [];
    const inserts: PipelineStageInsert[] = [];

    for (const stage of incoming) {
      const match =
        (stage.id ? existingById.get(stage.id) : null) ??
        existingByLower.get(stage.name.toLowerCase());

      const base: Pick<PipelineStageInsert, "team_id" | "name" | "position"> = {
        team_id: resolved.teamId,
        name: stage.name,
        position: stage.position,
      };

      const scorePatch: Partial<
        Pick<PipelineStageUpdate, "score_points" | "score_points_is_custom">
      > = {};

      if (stage.score_points !== null) {
        scorePatch.score_points = stage.score_points;
      }

      if (stage.score_points_is_custom !== null) {
        scorePatch.score_points_is_custom = stage.score_points_is_custom;
      }

      if (match?.id) {
        const updateRow: PipelineStageInsert = {
          id: String(match.id),
          ...base,
          ...scorePatch,
        };

        updates.push(updateRow);
      } else {
        const insertRow: PipelineStageInsert = {
          ...base,
          ...scorePatch,
        };

        inserts.push(insertRow);
      }
    }

    if (updates.length > 0) {
      const { error } = await resolved.admin
        .from("pipeline_stages")
        .upsert(updates, { onConflict: "id" });

      if (error) {
        throw error;
      }
    }

    if (inserts.length > 0) {
      const { error } = await resolved.admin
        .from("pipeline_stages")
        .insert(inserts);

      if (error) {
        throw error;
      }
    }

    const incomingLowerSet = new Set(
      incoming.map((stage) => stage.name.toLowerCase()),
    );

    const toDelete = existingStages.filter(
      (stage) => !incomingLowerSet.has(String(stage.name ?? "").toLowerCase()),
    );

    const toDeleteIds = toDelete
      .map((stage) => String(stage.id))
      .filter(isUuid);

    if (toDeleteIds.length > 0) {
      const { data: leadRefs, error: leadRefError } = await resolved.admin
        .from("leads")
        .select("id, stage_id")
        .eq("team_id", resolved.teamId)
        .in("stage_id", toDeleteIds)
        .limit(1);

      if (leadRefError) {
        throw leadRefError;
      }

      if ((leadRefs ?? []).length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "You can't delete a stage that is currently used by at least one lead. Move those leads to another stage first.",
          },
          { status: 409 },
        );
      }

      const csv = escapePostgrestCsvUuidList(toDeleteIds);

      const { data: refsRaw, error: refsError } = await resolved.admin
        .from("conversion_metrics")
        .select("id, from_stage_id, to_stage_id")
        .eq("team_id", resolved.teamId)
        .or(`from_stage_id.in.(${csv}),to_stage_id.in.(${csv})`);

      if (refsError) {
        throw refsError;
      }

      const referenced = Array.isArray(refsRaw) ? refsRaw : [];

      if (referenced.length > 0) {
        const namesInUse = toDelete
          .filter((stage) =>
            referenced.some(
              (row: any) =>
                String(row.from_stage_id) === String(stage.id) ||
                String(row.to_stage_id) === String(stage.id),
            ),
          )
          .map((stage) => String(stage.name ?? ""));

        return NextResponse.json(
          {
            ok: false,
            error:
              "You can't delete stages that are used in conversion metrics: " +
              namesInUse.join(", ") +
              ". Remove or update those conversion metrics first.",
          },
          { status: 409 },
        );
      }

      const { error } = await resolved.admin
        .from("pipeline_stages")
        .delete()
        .in("id", toDeleteIds);

      if (error) {
        throw error;
      }

      try {
        await deleteEntityTranslations({
          admin: resolved.admin,
          entityTable: "pipeline_stages",
          entityIds: toDeleteIds,
        });
      } catch (error) {
        console.warn(
          "[pipeline-stages][PUT] delete translations failed",
          error,
        );
      }
    }

    const { data: savedRaw, error: savedError } = await resolved.admin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", resolved.teamId);

    if (savedError) {
      throw savedError;
    }

    try {
      await syncEntityTranslationSources({
        admin: resolved.admin,
        teamId: resolved.teamId,
        entityTable: "pipeline_stages",
        rows: (Array.isArray(savedRaw) ? savedRaw : []) as PipelineStageRow[],
        fields: [{ fieldKey: "name", sourceText: (row) => row.name }],
        sourceLocale: locale,
      });
    } catch (error) {
      console.warn("[pipeline-stages][PUT] sync translations failed", error);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    console.error("[pipeline-stages][PUT] failed", error);
    return jsonError(error?.message ?? "Unknown error", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      teamId?: string;
    } | null;

    const teamId = String(body?.teamId ?? "").trim();

    if (!teamId) {
      return jsonError("Missing teamId", 400);
    }

    const admin = getCrmAdminClient();
    const locale = await resolveRequestLocale({ request, admin });

    const { data, error } = await admin
      .from("pipeline_stages")
      .select("id, name, position, score_points, score_points_is_custom")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) {
      throw error;
    }

    const stages = (Array.isArray(data) ? data : []) as PipelineStageRow[];

    try {
      await applyEntityTranslations({
        admin,
        teamId,
        entityTable: "pipeline_stages",
        rows: stages,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "name",
            sourceText: (row) => row.name,
            assign: (row, value) => {
              row.name = value;
            },
          },
        ],
      });
    } catch (error) {
      console.warn(
        "[pipeline-stages][POST] translation failed, using source values",
        error,
      );
    }

    return NextResponse.json(stages, { status: 200 });
  } catch (error: any) {
    console.error("[pipeline-stages][POST] failed", error);
    return jsonError(error?.message ?? "Unknown error", 500);
  }
}
