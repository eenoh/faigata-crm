import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import { resolveUserTeamMembership } from "@/features/organizations/server/team-membership.service";
import { resolveEnabledLeadNiche } from "@/features/crm/server/niches.service";
import {
  applyEntityTranslations,
  deleteEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { normalizeLeadKey } from "@/features/crm/utils/lead";
import type { CustomFieldType } from "@/features/crm/types/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdminClient();

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

function getLeadIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("id");
}

async function resolveAuthorizedLeadContext(
  req: Request,
  requestedTeamId?: string | null,
) {
  const auth = await getRequestUser(req);
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const membership = await resolveUserTeamMembership({
      admin: supabaseAdmin,
      userId: auth.user.id,
      request: req,
      requestedTeamId,
    });

    return {
      ok: true as const,
      teamId: membership.teamId,
      userId: auth.user.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "not_a_member_of_team") {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }

    if (message === "missing_team") {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Missing team context" },
          { status: 400 },
        ),
      };
    }

    console.error("[LeadsAPI] auth/team resolution failed", error);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Failed to resolve lead context" },
        { status: 500 },
      ),
    };
  }
}

const LEAD_SELECT_COLUMNS = `
id, team_id,
stage, stage_id,
lead_name,
niche_id, niche,
lead_type, gender,
country, region, city, postal_code,
primary_contact_type, primary_contact_value,
source_category, source_name,
custom_values, prospector_id, setter_id, closer_id, notes,
score, score_updated_at,
created_at, updated_at
` as const;

type StageRow = { id: string; name: string };
type NicheRow = { id: string; name: string };

type LeadApiRow = {
  id: string;
  team_id: string;
  stage: string | null;
  stage_id: string | null;
  lead_name: string | null;
  niche_id: string | null;
  niche: string | null;
  lead_type: string | null;
  gender: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  primary_contact_type: string | null;
  primary_contact_value: string | null;
  source_category: string | null;
  source_name: string | null;
  custom_values: Record<string, unknown> | null;
  prospector_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  notes: string | null;
  score: number | null;
  score_updated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  display_values?: Record<string, string | null> | null;
};

type LeadFieldTypeRow = {
  key: string;
  type: CustomFieldType;
};

type SystemFields = Partial<{
  lead_name: string | null;
  niche_id: string | null;
  niche: string | null;
  lead_type: "individual" | "business" | null;
  gender: "male" | "female" | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  primary_contact_type: string | null;
  primary_contact_value: string | null;
  source_category: string | null;
  source_name: string | null;
}>;

type LeadDisplayTranslationRow = {
  id: string;
  lead_name: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  notes: string | null;
  source_name: string | null;
  custom_values: Record<string, unknown> | null;
  display_values: Record<string, string | null>;
};

const RESERVED_SYSTEM_KEYS = new Set([
  "lead_name",
  "niche",
  "lead_type",
  "gender",
  "country",
  "region",
  "city",
  "postal_code",
  "primary_contact_type",
  "primary_contact_value",
  "source_category",
  "source_name",
]);

function normalizeNullish(v: any) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

function splitSystemAndCustom(input: any) {
  const system: Record<string, any> = {};
  const custom: Record<string, any> = {};

  const obj = input && typeof input === "object" ? input : {};
  for (const [k, v] of Object.entries(obj)) {
    if (RESERVED_SYSTEM_KEYS.has(k)) system[k] = v;
    else custom[k] = v;
  }

  return { system, custom };
}

function inferPrimaryContactType(
  primary_contact_type: any,
  primary_contact_value: any,
  source_name: any,
): string | null {
  const pct = normalizeNullish(primary_contact_type);
  if (typeof pct === "string" && pct.trim() !== "") return pct;

  const snRaw = normalizeNullish(source_name);
  const sn = typeof snRaw === "string" ? snRaw.trim().toLowerCase() : "";
  if (
    sn === "instagram" ||
    sn === "facebook" ||
    sn === "reddit" ||
    sn === "twitter_x"
  ) {
    return sn;
  }

  const vRaw = normalizeNullish(primary_contact_value);
  const v = typeof vRaw === "string" ? vRaw.trim().toLowerCase() : "";

  if (v.includes("instagram.com") || v.startsWith("@")) return "instagram";
  if (v.includes("facebook.com")) return "facebook";
  if (v.includes("reddit.com")) return "reddit";
  if (v.includes("twitter.com") || v.includes("x.com")) return "twitter_x";
  if (v.startsWith("http://") || v.startsWith("https://")) return "other";
  if (v.includes("@") && v.includes(".")) return "email";
  if (v.replace(/[^\d+]/g, "").length >= 7) return "phone";
  if (v.length > 0) return "other";

  return null;
}

function toTranslatableLeadText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return "";
}

function getLeadCustomValueByNormalizedKey(
  row:
    | Pick<LeadApiRow, "custom_values">
    | Pick<LeadDisplayTranslationRow, "custom_values">,
  normalizedKey: string,
): unknown {
  for (const [rawKey, value] of Object.entries(row.custom_values ?? {})) {
    if (normalizeLeadKey(rawKey) === normalizedKey) {
      return value;
    }
  }

  return null;
}

function isProbablyTextCustomFieldType(
  fieldType: CustomFieldType | null | undefined,
): boolean {
  if (!fieldType) {
    return false;
  }

  const normalized = String(fieldType).trim().toLowerCase();

  return (
    normalized === "text" ||
    normalized === "textarea" ||
    normalized === "long_text" ||
    normalized === "rich_text" ||
    normalized.includes("text")
  );
}

function buildLeadTranslationFields(row: LeadApiRow) {
  const fields: Array<{
    fieldKey: string | ((lead: LeadApiRow) => string);
    sourceText: (lead: LeadApiRow) => string;
  }> = [
    {
      fieldKey: "country",
      sourceText: (lead) => lead.country ?? "",
    },
    {
      fieldKey: "region",
      sourceText: (lead) => lead.region ?? "",
    },
    {
      fieldKey: "city",
      sourceText: (lead) => lead.city ?? "",
    },
    {
      fieldKey: "notes",
      sourceText: (lead) => lead.notes ?? "",
    },
    {
      fieldKey: "source_name",
      sourceText: (lead) => lead.source_name ?? "",
    },
  ];

  for (const [rawKey, rawValue] of Object.entries(row.custom_values ?? {})) {
    const normalizedKey = normalizeLeadKey(rawKey);
    if (!normalizedKey) {
      continue;
    }

    if (typeof rawValue !== "string") {
      continue;
    }

    fields.push({
      fieldKey: normalizedKey,
      sourceText: (lead) =>
        toTranslatableLeadText(
          getLeadCustomValueByNormalizedKey(lead, normalizedKey),
        ),
    });
  }

  return fields;
}

function buildLeadDisplayTranslationRows(
  rows: LeadApiRow[],
): LeadDisplayTranslationRow[] {
  return rows.map((row) => ({
    id: row.id,
    lead_name: row.lead_name ?? null,
    country: row.country ?? null,
    region: row.region ?? null,
    city: row.city ?? null,
    notes: row.notes ?? null,
    source_name: row.source_name ?? null,
    custom_values: row.custom_values ?? null,
    display_values: {},
  }));
}

function buildLeadDisplayTranslationFields(args: {
  rows: LeadApiRow[];
  leadFieldTypeByKey: Map<string, CustomFieldType>;
}) {
  const { rows, leadFieldTypeByKey } = args;

  const fields: Array<{
    fieldKey: string | ((row: LeadDisplayTranslationRow) => string);
    sourceText: (row: LeadDisplayTranslationRow) => string;
    assign: (row: LeadDisplayTranslationRow, value: string) => void;
  }> = [
    {
      fieldKey: "country",
      sourceText: (row) => row.country ?? "",
      assign: (row, value) => {
        row.display_values.country = value;
      },
    },
    {
      fieldKey: "region",
      sourceText: (row) => row.region ?? "",
      assign: (row, value) => {
        row.display_values.region = value;
      },
    },
    {
      fieldKey: "city",
      sourceText: (row) => row.city ?? "",
      assign: (row, value) => {
        row.display_values.city = value;
      },
    },
    {
      fieldKey: "notes",
      sourceText: (row) => row.notes ?? "",
      assign: (row, value) => {
        row.display_values.notes = value;
      },
    },
    {
      fieldKey: "source_name",
      sourceText: (row) => row.source_name ?? "",
      assign: (row, value) => {
        row.display_values.source_name = value;
      },
    },
  ];

  const candidateCustomKeys = new Set<string>();

  for (const row of rows) {
    for (const [rawKey, rawValue] of Object.entries(row.custom_values ?? {})) {
      const normalizedKey = normalizeLeadKey(rawKey);
      if (!normalizedKey) {
        continue;
      }

      if (typeof rawValue !== "string") {
        continue;
      }

      const fieldType = leadFieldTypeByKey.get(normalizedKey);
      if (fieldType && !isProbablyTextCustomFieldType(fieldType)) {
        continue;
      }

      candidateCustomKeys.add(normalizedKey);
    }
  }

  for (const normalizedKey of candidateCustomKeys) {
    fields.push({
      fieldKey: normalizedKey,
      sourceText: (row) =>
        toTranslatableLeadText(
          getLeadCustomValueByNormalizedKey(row, normalizedKey),
        ),
      assign: (row, value) => {
        row.display_values[normalizedKey] = value;
      },
    });
  }

  return fields;
}

async function syncLeadTranslationSources(args: {
  teamId: string;
  row: LeadApiRow;
  sourceLocale: string;
}) {
  await syncEntityTranslationSources({
    admin: supabaseAdmin as any,
    teamId: args.teamId,
    entityTable: "leads",
    rows: [args.row],
    fields: buildLeadTranslationFields(args.row),
    sourceLocale: args.sourceLocale,
  });
}

type LeadTimelineEventType =
  | "lead_created"
  | "lead_stage_changed"
  | "lead_assignment_changed"
  | "lead_updated";

function buildLeadCreatedFallbackBody(row: LeadApiRow) {
  return row.lead_name?.trim()
    ? `LEAD_CREATED|${row.lead_name.trim()}`
    : "LEAD_CREATED|";
}

function buildLeadStageChangedFallbackBody(args: {
  previousStageName: string | null;
  nextStageName: string | null;
}) {
  return `LEAD_STAGE_CHANGED|${args.previousStageName ?? ""}|${args.nextStageName ?? ""}`;
}

function buildLeadAssignmentChangedFallbackBody(args: {
  previousSetterId: string | null;
  nextSetterId: string | null;
  previousCloserId: string | null;
  nextCloserId: string | null;
}) {
  return `LEAD_ASSIGNMENT_CHANGED|${args.previousSetterId ?? ""}|${args.nextSetterId ?? ""}|${args.previousCloserId ?? ""}|${args.nextCloserId ?? ""}`;
}

function buildLeadUpdatedFallbackBody(changedKeys: string[]) {
  return `LEAD_UPDATED|${changedKeys.join(",")}`;
}

async function insertLeadTimelineEvent(args: {
  teamId: string;
  leadId: string;
  senderProfileId: string | null;
  eventType: LeadTimelineEventType;
  eventData: Record<string, unknown>;
  fallbackBody: string | null;
  sentAt?: string;
}) {
  const sentAt = args.sentAt ?? new Date().toISOString();

  const { error } = await supabaseAdmin.from("lead_messages").insert({
    team_id: args.teamId,
    lead_id: args.leadId,
    direction: "internal",
    channel: "pipeline",
    body: args.fallbackBody,
    sender_profile_id: args.senderProfileId,
    user_id: args.senderProfileId,
    sent_at: sentAt,
    created_at: sentAt,
    event_type: args.eventType,
    event_data: args.eventData,
  } as any);

  if (error) {
    throw error;
  }
}

async function getStageById(teamId: string, stageId: string) {
  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name")
    .eq("team_id", teamId)
    .eq("id", stageId)
    .maybeSingle();

  if (error) {
    console.error("[LeadsAPI] getStageById error", error);
    return null;
  }
  return (data as StageRow | null) ?? null;
}

async function getStageByName(teamId: string, stageName: string) {
  const name = String(stageName ?? "").trim();
  if (!name) return null;

  const { data, error } = await supabaseAdmin
    .from("pipeline_stages")
    .select("id, name")
    .eq("team_id", teamId)
    .ilike("name", name)
    .maybeSingle();

  if (error) {
    console.error("[LeadsAPI] getStageByName error", error);
    return null;
  }
  return (data as StageRow | null) ?? null;
}

async function localizeLeadRows(args: {
  request: Request;
  teamId: string;
  userId: string;
  rows: LeadApiRow[];
}): Promise<LeadApiRow[]> {
  const { request, teamId, userId, rows } = args;

  if (!rows.length) {
    return rows;
  }

  const requestedLocale = await resolveRequestLocale({
    request,
    admin: supabaseAdmin,
    userId,
  });

  const { data: leadFieldData, error: leadFieldError } = await supabaseAdmin
    .from("lead_fields")
    .select("key, type")
    .eq("team_id", teamId);

  if (leadFieldError) {
    console.error("[LeadsAPI] failed to load lead field types", leadFieldError);
  }

  const leadFieldTypeByKey = new Map<string, CustomFieldType>();
  for (const row of (Array.isArray(leadFieldData)
    ? leadFieldData
    : []) as LeadFieldTypeRow[]) {
    const normalizedKey = normalizeLeadKey(row.key);
    if (!normalizedKey) continue;
    leadFieldTypeByKey.set(normalizedKey, row.type);
  }

  const stageIds = Array.from(
    new Set(
      rows
        .map((row) =>
          typeof row.stage_id === "string" ? row.stage_id.trim() : "",
        )
        .filter(Boolean),
    ),
  );

  if (stageIds.length > 0) {
    const { data: stageData, error: stageError } = await supabaseAdmin
      .from("pipeline_stages")
      .select("id, name")
      .eq("team_id", teamId)
      .in("id", stageIds);

    if (stageError) {
      console.error("[LeadsAPI] failed to load stage translations", stageError);
    } else {
      const stages = (Array.isArray(stageData) ? stageData : []) as StageRow[];

      try {
        await applyEntityTranslations({
          admin: supabaseAdmin as any,
          teamId,
          entityTable: "pipeline_stages",
          rows: stages,
          requestedLocale,
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
          "[LeadsAPI] stage translation failed, using source values",
          error,
        );
      }

      const stageNameById = new Map(
        stages.map((stage) => [String(stage.id), String(stage.name)]),
      );

      for (const row of rows) {
        const translatedName =
          typeof row.stage_id === "string"
            ? stageNameById.get(row.stage_id)
            : undefined;
        if (translatedName) {
          row.stage = translatedName;
        }
      }
    }
  }

  const nicheIds = Array.from(
    new Set(
      rows
        .map((row) =>
          typeof row.niche_id === "string" ? row.niche_id.trim() : "",
        )
        .filter(Boolean),
    ),
  );

  if (nicheIds.length > 0) {
    const { data: nicheData, error: nicheError } = await supabaseAdmin
      .from("niches")
      .select("id, name")
      .in("id", nicheIds);

    if (nicheError) {
      console.error("[LeadsAPI] failed to load niche translations", nicheError);
    } else {
      const niches = (Array.isArray(nicheData) ? nicheData : []) as NicheRow[];

      try {
        await applyEntityTranslations({
          admin: supabaseAdmin as any,
          teamId,
          entityTable: "niches",
          rows: niches,
          requestedLocale,
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
          "[LeadsAPI] niche translation failed, using source values",
          error,
        );
      }

      const nicheNameById = new Map(
        niches.map((niche) => [String(niche.id), String(niche.name)]),
      );

      for (const row of rows) {
        const translatedName =
          typeof row.niche_id === "string"
            ? nicheNameById.get(row.niche_id)
            : undefined;
        if (translatedName) {
          row.niche = translatedName;
        }
      }
    }
  }

  try {
    const displayTranslationRows = buildLeadDisplayTranslationRows(rows);

    await applyEntityTranslations({
      admin: supabaseAdmin as any,
      teamId,
      entityTable: "leads",
      rows: displayTranslationRows,
      requestedLocale,
      fields: buildLeadDisplayTranslationFields({
        rows,
        leadFieldTypeByKey,
      }),
    });

    for (let index = 0; index < rows.length; index += 1) {
      const localizedRow = displayTranslationRows[index];
      const nextDisplayValues = localizedRow?.display_values ?? {};

      rows[index].display_values =
        Object.keys(nextDisplayValues).length > 0 ? nextDisplayValues : null;
    }
  } catch (error) {
    console.warn(
      "[LeadsAPI] lead display translation failed, using source values",
      error,
    );

    for (const row of rows) {
      row.display_values = null;
    }
  }

  return rows;
}

type NewLeadBody = {
  teamId?: string;
  stageId?: string;
  stage?: string;
  customValues?: Record<string, any>;
  systemFields?: SystemFields;
  prospectorId?: string | null;
  notes?: string | null;
};

export async function POST(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as NewLeadBody;

  const requestedTeamId: string | null = urlTeamId ?? body.teamId ?? null;
  const auth = await resolveAuthorizedLeadContext(req, requestedTeamId);
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;
  const locale = await resolveRequestLocale({
    request: req,
    admin: supabaseAdmin,
    userId: auth.userId,
  });

  const incomingStageId =
    typeof body.stageId === "string" ? body.stageId : null;
  const incomingStageName = typeof body.stage === "string" ? body.stage : null;

  const rawCustomValues: Record<string, any> = body.customValues ?? {};
  const rawSystemFields: Record<string, any> = body.systemFields ?? {};

  const { system: sysFromCustom, custom: safeCustomValues } =
    splitSystemAndCustom(rawCustomValues);

  const system = { ...sysFromCustom, ...rawSystemFields };

  const prospectorId: string | null = body.prospectorId ?? null;
  const notes: string | null =
    typeof body.notes === "string" && body.notes.trim() !== ""
      ? body.notes.trim()
      : null;

  let stage_id: string | null = null;
  let stage: string | null = null;

  if (incomingStageId) {
    const st = await getStageById(teamId, incomingStageId);
    if (!st) {
      return NextResponse.json(
        { error: "Invalid stageId for this team" },
        { status: 400 },
      );
    }
    stage_id = st.id;
    stage = st.name;
  } else if (incomingStageName) {
    const st = await getStageByName(teamId, incomingStageName);
    if (!st) {
      return NextResponse.json(
        { error: "Invalid stage name for this team" },
        { status: 400 },
      );
    }
    stage_id = st.id;
    stage = st.name;
  } else {
    return NextResponse.json(
      { error: "Missing stageId/stage" },
      { status: 400 },
    );
  }

  const primaryContactType = inferPrimaryContactType(
    (system as any).primary_contact_type,
    (system as any).primary_contact_value,
    (system as any).source_name,
  );

  if (!primaryContactType) {
    return NextResponse.json(
      {
        error:
          "Missing primary_contact_type (required). Please select a Primary Contact Type.",
      },
      { status: 400 },
    );
  }

  let setterId: string | null = null;
  try {
    setterId = await assignSetterId(teamId, prospectorId);
  } catch (err) {
    console.error(
      "[LeadsAPI] assignSetterId failed – continuing without setter",
      err,
    );
    setterId = null;
  }

  let nicheId: string | null = null;
  let nicheName: string | null = normalizeNullish((system as any).niche);

  if ((system as any).niche_id) {
    const resolvedNiche = await resolveEnabledLeadNiche({
      admin: supabaseAdmin,
      teamId,
      nicheId: String((system as any).niche_id),
    });

    if (!resolvedNiche) {
      return NextResponse.json(
        { error: "Invalid or disabled niche for this team" },
        { status: 400 },
      );
    }

    nicheId = resolvedNiche.id;
    nicheName = resolvedNiche.name;
  }

  const insertPayload: any = {
    team_id: teamId,
    stage,
    stage_id,
    lead_name: normalizeNullish((system as any).lead_name),
    custom_values: safeCustomValues,
    niche_id: nicheId,
    niche: nicheName,
    lead_type: normalizeNullish((system as any).lead_type),
    gender: normalizeNullish((system as any).gender),
    country: normalizeNullish((system as any).country),
    region: normalizeNullish((system as any).region),
    city: normalizeNullish((system as any).city),
    postal_code: normalizeNullish((system as any).postal_code),
    primary_contact_type: primaryContactType,
    primary_contact_value: normalizeNullish(
      (system as any).primary_contact_value,
    ),
    source_category: normalizeNullish((system as any).source_category),
    source_name: normalizeNullish((system as any).source_name),
    prospector_id: prospectorId,
    setter_id: setterId,
    notes,
  };

  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert(insertPayload)
    .select(LEAD_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[LeadsAPI] Error creating lead", error);
    return NextResponse.json(
      {
        error: error?.message ?? "Failed to create lead",
        details: error ?? null,
      },
      { status: 500 },
    );
  }

  const createdLeadId = (data as any)?.id ?? null;

  try {
    await syncLeadTranslationSources({
      teamId,
      row: data as LeadApiRow,
      sourceLocale: locale,
    });
  } catch (translationError) {
    console.error(
      "[LeadsAPI] translation source sync failed after POST",
      translationError,
    );
  }

  try {
    if (createdLeadId) {
      await insertLeadTimelineEvent({
        teamId,
        leadId: createdLeadId,
        senderProfileId: prospectorId,
        eventType: "lead_created",
        fallbackBody: buildLeadCreatedFallbackBody(data as LeadApiRow),
        eventData: {
          lead_id: createdLeadId,
          team_id: teamId,
          stage: (data as any).stage ?? stage ?? null,
          stage_id: (data as any).stage_id ?? stage_id ?? null,
          prospector_id: (data as any).prospector_id ?? prospectorId ?? null,
          setter_id: (data as any).setter_id ?? setterId ?? null,
          closer_id: (data as any).closer_id ?? null,
          lead_name: (data as any).lead_name ?? null,
          primary_contact_type: (data as any).primary_contact_type ?? null,
          primary_contact_value: (data as any).primary_contact_value ?? null,
          source_category: (data as any).source_category ?? null,
          source_name: (data as any).source_name ?? null,
          niche: (data as any).niche ?? null,
          niche_id: (data as any).niche_id ?? null,
          lead_type: (data as any).lead_type ?? null,
          gender: (data as any).gender ?? null,
        },
      });
    }
  } catch (e) {
    console.error("[LeadsAPI] lead_messages insert failed (non-fatal):", e);
  }

  if (createdLeadId) {
    try {
      await recomputeLeadScore(teamId, createdLeadId);
    } catch (e) {
      console.error("[LeadsAPI] recomputeLeadScore after POST failed", e);
    }

    const { data: updated, error: fetchError } = await supabaseAdmin
      .from("leads")
      .select(LEAD_SELECT_COLUMNS)
      .eq("team_id", teamId)
      .eq("id", createdLeadId)
      .single();

    if (!fetchError && updated) {
      const localized = await localizeLeadRows({
        request: req,
        teamId,
        userId: auth.userId,
        rows: [updated as LeadApiRow],
      });
      return NextResponse.json(localized[0] ?? updated);
    }
  }

  const localized = await localizeLeadRows({
    request: req,
    teamId,
    userId: auth.userId,
    rows: [data as LeadApiRow],
  });

  return NextResponse.json(localized[0] ?? data);
}

export async function GET(req: Request) {
  const requestedTeamId = getTeamIdFromRequest(req);
  const auth = await resolveAuthorizedLeadContext(req, requestedTeamId);
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

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
        { error: error.message ?? "Failed to fetch lead", details: error },
        { status: 500 },
      );
    }

    const localized = await localizeLeadRows({
      request: req,
      teamId,
      userId: auth.userId,
      rows: [data as LeadApiRow],
    });

    return NextResponse.json(localized[0] ?? data);
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .select(LEAD_SELECT_COLUMNS)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[LeadsAPI] Error fetching leads", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to fetch leads", details: error },
      { status: 500 },
    );
  }

  const localized = await localizeLeadRows({
    request: req,
    teamId,
    userId: auth.userId,
    rows: (Array.isArray(data) ? data : []) as LeadApiRow[],
  });

  return NextResponse.json(localized);
}

export async function PATCH(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const urlId = getLeadIdFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as any;

  const requestedTeamId: string | null = urlTeamId ?? body.teamId ?? null;
  const id: string | null = urlId ?? body.id ?? null;
  const auth = await resolveAuthorizedLeadContext(req, requestedTeamId);
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;
  const locale = await resolveRequestLocale({
    request: req,
    admin: supabaseAdmin,
    userId: auth.userId,
  });

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data: existingLead, error: existingLeadError } = await supabaseAdmin
    .from("leads")
    .select(LEAD_SELECT_COLUMNS)
    .eq("team_id", teamId)
    .eq("id", id)
    .single();

  if (existingLeadError || !existingLead) {
    console.error(
      "[LeadsAPI] Error fetching existing lead before PATCH",
      existingLeadError,
    );
    return NextResponse.json(
      {
        error: existingLeadError?.message ?? "Failed to load existing lead",
        details: existingLeadError ?? null,
      },
      { status: 500 },
    );
  }

  const previousLead = existingLead as LeadApiRow;
  const updates = body.updates ?? body;
  const payload: any = {};
  let shouldRecomputeScore = false;

  if (updates.stage_id !== undefined || updates.stage !== undefined) {
    const incomingStageId =
      typeof updates.stage_id === "string" ? updates.stage_id : null;
    const incomingStageName =
      typeof updates.stage === "string" ? updates.stage : null;

    let stage_id: string | null = null;
    let stage: string | null = null;

    if (incomingStageId) {
      const st = await getStageById(teamId, incomingStageId);
      if (!st) {
        return NextResponse.json(
          { error: "Invalid stage_id for this team" },
          { status: 400 },
        );
      }
      stage_id = st.id;
      stage = st.name;
    } else if (incomingStageName) {
      const st = await getStageByName(teamId, incomingStageName);
      if (!st) {
        return NextResponse.json(
          { error: "Invalid stage name for this team" },
          { status: 400 },
        );
      }
      stage_id = st.id;
      stage = st.name;
    } else {
      stage_id = null;
      stage = null;
    }

    if (stage_id !== null) payload.stage_id = stage_id;
    payload.stage = stage;
  }

  if (updates.customValues !== undefined) {
    const { system: sysFromCustom, custom: safeCustomValues } =
      splitSystemAndCustom(updates.customValues);

    payload.custom_values = safeCustomValues;

    if ("lead_name" in sysFromCustom) {
      payload.lead_name = normalizeNullish(sysFromCustom.lead_name);
    }

    if ("niche" in sysFromCustom) {
      payload.niche = normalizeNullish(sysFromCustom.niche);
    }
    if ("lead_type" in sysFromCustom) {
      payload.lead_type = normalizeNullish(sysFromCustom.lead_type);
    }
    if ("gender" in sysFromCustom) {
      payload.gender = normalizeNullish(sysFromCustom.gender);
    }

    if ("country" in sysFromCustom) {
      payload.country = normalizeNullish(sysFromCustom.country);
    }
    if ("region" in sysFromCustom) {
      payload.region = normalizeNullish(sysFromCustom.region);
    }
    if ("city" in sysFromCustom) {
      payload.city = normalizeNullish(sysFromCustom.city);
    }
    if ("postal_code" in sysFromCustom) {
      payload.postal_code = normalizeNullish(sysFromCustom.postal_code);
    }

    if ("primary_contact_type" in sysFromCustom) {
      const pct = inferPrimaryContactType(
        sysFromCustom.primary_contact_type,
        sysFromCustom.primary_contact_value,
        sysFromCustom.source_name,
      );
      if (pct) payload.primary_contact_type = pct;
    }
    if ("primary_contact_value" in sysFromCustom) {
      payload.primary_contact_value = normalizeNullish(
        sysFromCustom.primary_contact_value,
      );
    }

    if ("source_category" in sysFromCustom) {
      payload.source_category = normalizeNullish(sysFromCustom.source_category);
    }
    if ("source_name" in sysFromCustom) {
      payload.source_name = normalizeNullish(sysFromCustom.source_name);
    }

    shouldRecomputeScore = true;
  }

  if (updates.systemFields !== undefined) {
    const sf = updates.systemFields ?? {};

    if ("lead_name" in sf) {
      payload.lead_name = normalizeNullish(sf.lead_name);
    }

    if ("niche_id" in sf) {
      const nextNicheId = normalizeNullish(sf.niche_id);

      if (nextNicheId) {
        const resolvedNiche = await resolveEnabledLeadNiche({
          admin: supabaseAdmin,
          teamId,
          nicheId: String(nextNicheId),
        });

        if (!resolvedNiche) {
          return NextResponse.json(
            { error: "Invalid or disabled niche for this team" },
            { status: 400 },
          );
        }

        payload.niche_id = resolvedNiche.id;
        payload.niche = resolvedNiche.name;
      } else {
        payload.niche_id = null;
        payload.niche = null;
      }
    } else if ("niche" in sf) {
      payload.niche = normalizeNullish(sf.niche);
    }

    if ("lead_type" in sf) {
      payload.lead_type = normalizeNullish(sf.lead_type);
    }
    if ("gender" in sf) {
      payload.gender = normalizeNullish(sf.gender);
    }

    if ("country" in sf) {
      payload.country = normalizeNullish(sf.country);
    }
    if ("region" in sf) {
      payload.region = normalizeNullish(sf.region);
    }
    if ("city" in sf) {
      payload.city = normalizeNullish(sf.city);
    }
    if ("postal_code" in sf) {
      payload.postal_code = normalizeNullish(sf.postal_code);
    }

    if (
      "primary_contact_type" in sf ||
      "primary_contact_value" in sf ||
      "source_name" in sf
    ) {
      const pct = inferPrimaryContactType(
        sf.primary_contact_type,
        sf.primary_contact_value,
        sf.source_name,
      );
      if (pct) payload.primary_contact_type = pct;
    }
    if ("primary_contact_value" in sf) {
      payload.primary_contact_value = normalizeNullish(
        sf.primary_contact_value,
      );
    }

    if ("source_category" in sf) {
      payload.source_category = normalizeNullish(sf.source_category);
    }
    if ("source_name" in sf) {
      payload.source_name = normalizeNullish(sf.source_name);
    }

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
    .update(payload as never)
    .eq("team_id", teamId)
    .eq("id", id)
    .select(LEAD_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[LeadsAPI] Error updating lead", error);
    return NextResponse.json(
      {
        error: error?.message ?? "Failed to update lead",
        details: error ?? null,
      },
      { status: 500 },
    );
  }

  const updatedLead = data as LeadApiRow;

  try {
    await syncLeadTranslationSources({
      teamId,
      row: updatedLead,
      sourceLocale: locale,
    });
  } catch (translationError) {
    console.error(
      "[LeadsAPI] translation source sync failed after PATCH",
      translationError,
    );
  }

  try {
    const stageChanged =
      String(previousLead.stage_id ?? "") !==
        String(updatedLead.stage_id ?? "") ||
      String(previousLead.stage ?? "") !== String(updatedLead.stage ?? "");

    const assignmentChanged =
      String(previousLead.setter_id ?? "") !==
        String(updatedLead.setter_id ?? "") ||
      String(previousLead.closer_id ?? "") !==
        String(updatedLead.closer_id ?? "");

    const changedKeys = Object.keys(payload).filter(
      (key) => key !== "updated_at" && key !== "stage" && key !== "stage_id",
    );

    if (stageChanged) {
      await insertLeadTimelineEvent({
        teamId,
        leadId: id,
        senderProfileId: auth.userId,
        eventType: "lead_stage_changed",
        fallbackBody: buildLeadStageChangedFallbackBody({
          previousStageName: previousLead.stage ?? null,
          nextStageName: updatedLead.stage ?? null,
        }),
        eventData: {
          lead_id: id,
          team_id: teamId,
          previous_stage_id: previousLead.stage_id ?? null,
          previous_stage: previousLead.stage ?? null,
          next_stage_id: updatedLead.stage_id ?? null,
          next_stage: updatedLead.stage ?? null,
          actor_profile_id: auth.userId,
        },
      });
    }

    if (assignmentChanged) {
      await insertLeadTimelineEvent({
        teamId,
        leadId: id,
        senderProfileId: auth.userId,
        eventType: "lead_assignment_changed",
        fallbackBody: buildLeadAssignmentChangedFallbackBody({
          previousSetterId: previousLead.setter_id ?? null,
          nextSetterId: updatedLead.setter_id ?? null,
          previousCloserId: previousLead.closer_id ?? null,
          nextCloserId: updatedLead.closer_id ?? null,
        }),
        eventData: {
          lead_id: id,
          team_id: teamId,
          previous_setter_id: previousLead.setter_id ?? null,
          next_setter_id: updatedLead.setter_id ?? null,
          previous_closer_id: previousLead.closer_id ?? null,
          next_closer_id: updatedLead.closer_id ?? null,
          actor_profile_id: auth.userId,
        },
      });
    }

    if (!stageChanged && !assignmentChanged && changedKeys.length > 0) {
      await insertLeadTimelineEvent({
        teamId,
        leadId: id,
        senderProfileId: auth.userId,
        eventType: "lead_updated",
        fallbackBody: buildLeadUpdatedFallbackBody(changedKeys),
        eventData: {
          lead_id: id,
          team_id: teamId,
          changed_fields: changedKeys,
          actor_profile_id: auth.userId,
        },
      });
    }
  } catch (timelineError) {
    console.error(
      "[LeadsAPI] lead timeline event insert failed after PATCH",
      timelineError,
    );
  }

  if (shouldRecomputeScore) {
    try {
      await recomputeLeadScore(teamId, id);
    } catch (e) {
      console.error("[LeadsAPI] recomputeLeadScore after PATCH failed", e);
    }

    const { data: refreshedLead, error: fetchError } = await supabaseAdmin
      .from("leads")
      .select(LEAD_SELECT_COLUMNS)
      .eq("team_id", teamId)
      .eq("id", id)
      .single();

    if (!fetchError && refreshedLead) {
      const localized = await localizeLeadRows({
        request: req,
        teamId,
        userId: auth.userId,
        rows: [refreshedLead as LeadApiRow],
      });
      return NextResponse.json(localized[0] ?? refreshedLead);
    }
  }

  const localized = await localizeLeadRows({
    request: req,
    teamId,
    userId: auth.userId,
    rows: [updatedLead],
  });

  return NextResponse.json(localized[0] ?? updatedLead);
}

export async function DELETE(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const urlId = getLeadIdFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as any;

  const requestedTeamId: string | null = urlTeamId ?? body.teamId ?? null;
  const id: string | null = urlId ?? body.id ?? null;
  const auth = await resolveAuthorizedLeadContext(req, requestedTeamId);
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);

  if (error) {
    console.error("[LeadsAPI] Error deleting lead", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to delete lead", details: error },
      { status: 500 },
    );
  }

  try {
    await deleteEntityTranslations({
      admin: supabaseAdmin as any,
      entityTable: "leads",
      entityIds: [id],
    });
  } catch (translationDeleteError) {
    console.error(
      "[LeadsAPI] translation source cleanup failed after DELETE",
      translationDeleteError,
    );
  }

  return NextResponse.json({ ok: true });
}

function normalizeTeamMemberRoleNames(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : value == null ? [] : [value];
  const roles = rawValues
    .map((entry) =>
      String(entry ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  return Array.from(new Set(roles));
}

async function assignSetterId(
  teamId: string,
  prospectorId: string | null,
): Promise<string | null> {
  if (!prospectorId) return null;

  const { data: prospectorMemberships, error: prospectorMembershipsError } =
    await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", prospectorId)
      .eq("team_id", teamId);

  if (prospectorMembershipsError) {
    console.error(
      "[LeadsAPI] Failed to load team membership for setter assignment",
      prospectorMembershipsError,
    );
    return null;
  }

  const prospectorRoles = Array.from(
    new Set(
      (Array.isArray(prospectorMemberships)
        ? prospectorMemberships
        : []
      ).flatMap((membership: any) =>
        normalizeTeamMemberRoleNames(membership?.role),
      ),
    ),
  );

  const isProspector = prospectorRoles.includes("prospector");
  const isSetter = prospectorRoles.includes("setter");

  if (isProspector && isSetter) return prospectorId;
  if (!isProspector) return null;

  const { data: teamMemberships, error: teamMembershipsError } =
    await supabaseAdmin
      .from("team_members")
      .select("user_id, role")
      .eq("team_id", teamId);

  if (teamMembershipsError) {
    console.error(
      "[LeadsAPI] Failed to load team memberships",
      teamMembershipsError,
    );
    return null;
  }

  const rolesByUserId = new Map<string, Set<string>>();
  for (const membership of Array.isArray(teamMemberships)
    ? teamMemberships
    : []) {
    const userId = String((membership as any)?.user_id ?? "").trim();
    if (!userId) continue;

    const currentRoles = rolesByUserId.get(userId) ?? new Set<string>();
    for (const role of normalizeTeamMemberRoleNames(
      (membership as any)?.role,
    )) {
      currentRoles.add(role);
    }
    rolesByUserId.set(userId, currentRoles);
  }

  const setterIds = Array.from(rolesByUserId.entries())
    .filter(([, roles]) => roles.has("setter"))
    .map(([userId]) => userId);

  if (setterIds.length === 0) return null;

  const now = new Date();
  const firstOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
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
      leadsError,
    );
    return setterIds[0] ?? null;
  }

  const counts: Record<string, number> = {};
  setterIds.forEach((setterId) => {
    counts[setterId] = 0;
  });

  for (const row of Array.isArray(leadsThisMonth) ? leadsThisMonth : []) {
    const sid = (row as any).setter_id as string | null;
    if (!sid) continue;
    counts[sid] = (counts[sid] ?? 0) + 1;
  }

  let bestId: string | null = null;
  let bestCount = Infinity;

  for (const sid of setterIds) {
    const c = counts[sid] ?? 0;
    if (c < bestCount) {
      bestCount = c;
      bestId = sid;
    }
  }

  return bestId;
}
