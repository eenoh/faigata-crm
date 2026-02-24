// src/app/api/crm/leads/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/modules/crm/scoring/recomputeLeadScore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

function getLeadIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("id");
}

/**
 * IMPORTANT:
 * Your `leads` table DOES have:
 * - lead_name (real column)
 *
 * Your previous PostgREST error 42703 happens only when selecting columns
 * that do not exist (ex: score_grade, score_breakdown).
 */
const LEAD_SELECT_COLUMNS = `
id, team_id, stage,
lead_name,
niche, lead_type, gender,
country, region, city, postal_code,
primary_contact_type, primary_contact_value,
source_category, source_name,
custom_values, prospector_id, setter_id, closer_id, notes,
score, score_updated_at,
created_at, updated_at
` as const;

/* -------------------- system/custom separation -------------------- */

type SystemFields = Partial<{
  lead_name: string | null;

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

/**
 * DB requires leads.primary_contact_type NOT NULL in your schema.
 * This helper ensures we never insert null even if the UI forgets it.
 */
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
  )
    return sn;

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

/* -------------------- types -------------------- */

type NewLeadBody = {
  teamId?: string;
  stage?: string;
  customValues?: Record<string, any>;
  systemFields?: SystemFields;

  prospectorId?: string | null;
  notes?: string | null;
};

function hasLeadId(x: unknown): x is { id: string } {
  return Boolean(x) && typeof (x as any).id === "string";
}

/* ---------- CREATE lead ---------- */
export async function POST(req: Request) {
  const urlTeamId = getTeamIdFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as NewLeadBody;

  const teamId: string | null = urlTeamId ?? body.teamId ?? null;
  const stage: string | undefined = body.stage;

  // accept both custom + system fields
  const rawCustomValues: Record<string, any> = body.customValues ?? {};
  const rawSystemFields: Record<string, any> = body.systemFields ?? {};

  // if someone accidentally put system keys into customValues, strip them
  const { system: sysFromCustom, custom: safeCustomValues } =
    splitSystemAndCustom(rawCustomValues);

  // explicit systemFields wins
  const system = { ...sysFromCustom, ...rawSystemFields };

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

  // ✅ enforce NOT NULL primary_contact_type (with inference fallback)
  const primaryContactType = inferPrimaryContactType(
    (system as any).primary_contact_type,
    (system as any).primary_contact_value,
    (system as any).source_name,
  );

  // If still missing, fail fast with 400 (better than a 500 constraint error)
  if (!primaryContactType) {
    return NextResponse.json(
      {
        error:
          "Missing primary_contact_type (required). Please select a Primary Contact Type.",
      },
      { status: 400 },
    );
  }

  // Decide setter_id based on prospector + team roles
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

  const insertPayload: any = {
    team_id: teamId,
    stage,

    // ✅ lead_name stored in real column
    lead_name: normalizeNullish((system as any).lead_name),

    // only truly custom values go here
    custom_values: safeCustomValues,

    // core/system fields stored in real columns
    niche: normalizeNullish((system as any).niche),
    lead_type: normalizeNullish((system as any).lead_type),
    gender: normalizeNullish((system as any).gender),

    country: normalizeNullish((system as any).country),
    region: normalizeNullish((system as any).region),
    city: normalizeNullish((system as any).city),
    postal_code: normalizeNullish((system as any).postal_code),

    // ✅ never null (DB constraint)
    primary_contact_type: primaryContactType,
    primary_contact_value: normalizeNullish(
      (system as any).primary_contact_value,
    ),

    source_category: normalizeNullish((system as any).source_category),
    source_name: normalizeNullish((system as any).source_name),

    // RBAC + notes
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

  const createdLeadId = hasLeadId(data) ? data.id : null;

  /**
   * ✅ log lead creation event in lead_messages (non-fatal)
   * - event_type: "lead_created"
   * - event_data: jsonb NOT NULL in your schema -> ALWAYS provide an object
   */
  try {
    if (createdLeadId) {
      const nowISO = new Date().toISOString();

      const event_type = "lead_created";
      const event_data: Record<string, any> = {
        lead_id: createdLeadId,
        team_id: teamId,

        stage: (data as any).stage ?? stage ?? null,
        prospector_id: (data as any).prospector_id ?? prospectorId ?? null,
        setter_id: (data as any).setter_id ?? setterId ?? null,
        closer_id: (data as any).closer_id ?? null,

        // useful snapshot fields
        lead_name: (data as any).lead_name ?? null,
        primary_contact_type: (data as any).primary_contact_type ?? null,
        primary_contact_value: (data as any).primary_contact_value ?? null,
        source_category: (data as any).source_category ?? null,
        source_name: (data as any).source_name ?? null,
        niche: (data as any).niche ?? null,
        lead_type: (data as any).lead_type ?? null,
        gender: (data as any).gender ?? null,
      };

      const { error: msgErr } = await supabaseAdmin
        .from("lead_messages")
        .insert({
          team_id: teamId,
          lead_id: createdLeadId,

          // required by your table
          direction: "internal",
          channel: "crm",
          body: `Lead created${(data as any).lead_name ? `: ${(data as any).lead_name}` : ""}.`,
          sender_profile_id: prospectorId, // nullable
          user_id: prospectorId, // nullable

          sent_at: nowISO,
          created_at: nowISO,

          event_type,
          event_data, // jsonb NOT NULL
        });

      if (msgErr) {
        console.error(
          "[LeadsAPI] lead_messages insert error (non-fatal):",
          msgErr,
        );
      }
    }
  } catch (e) {
    console.error("[LeadsAPI] lead_messages insert failed (non-fatal):", e);
  }

  // compute base + activity score right after creation
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
      return NextResponse.json(updated);
    }
  }

  return NextResponse.json(data);
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
        { error: error.message ?? "Failed to fetch lead", details: error },
        { status: 500 },
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
      { error: error.message ?? "Failed to fetch leads", details: error },
      { status: 500 },
    );
  }

  // ✅ avoids any TS “?? unreachable” setups by normalizing explicitly
  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json(rows);
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
      { status: 400 },
    );
  }

  const updates = body.updates ?? body;

  const payload: any = {};
  let shouldRecomputeScore = false;

  if (updates.stage !== undefined) {
    payload.stage = updates.stage;
    shouldRecomputeScore = true;
  }

  // customValues: strip system keys, but still apply them to real columns
  if (updates.customValues !== undefined) {
    const { system: sysFromCustom, custom: safeCustomValues } =
      splitSystemAndCustom(updates.customValues);

    payload.custom_values = safeCustomValues;

    // apply system keys if present in customValues
    if ("lead_name" in sysFromCustom)
      payload.lead_name = normalizeNullish(sysFromCustom.lead_name);

    if ("niche" in sysFromCustom)
      payload.niche = normalizeNullish(sysFromCustom.niche);
    if ("lead_type" in sysFromCustom)
      payload.lead_type = normalizeNullish(sysFromCustom.lead_type);
    if ("gender" in sysFromCustom)
      payload.gender = normalizeNullish(sysFromCustom.gender);

    if ("country" in sysFromCustom)
      payload.country = normalizeNullish(sysFromCustom.country);
    if ("region" in sysFromCustom)
      payload.region = normalizeNullish(sysFromCustom.region);
    if ("city" in sysFromCustom)
      payload.city = normalizeNullish(sysFromCustom.city);
    if ("postal_code" in sysFromCustom)
      payload.postal_code = normalizeNullish(sysFromCustom.postal_code);

    // ✅ Only update contact_type if provided. (Avoid overwriting with null.)
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

    if ("source_category" in sysFromCustom)
      payload.source_category = normalizeNullish(sysFromCustom.source_category);
    if ("source_name" in sysFromCustom)
      payload.source_name = normalizeNullish(sysFromCustom.source_name);

    shouldRecomputeScore = true;
  }

  // explicit systemFields update
  if (updates.systemFields !== undefined) {
    const sf = updates.systemFields ?? {};

    if ("lead_name" in sf) payload.lead_name = normalizeNullish(sf.lead_name);

    if ("niche" in sf) payload.niche = normalizeNullish(sf.niche);
    if ("lead_type" in sf) payload.lead_type = normalizeNullish(sf.lead_type);
    if ("gender" in sf) payload.gender = normalizeNullish(sf.gender);

    if ("country" in sf) payload.country = normalizeNullish(sf.country);
    if ("region" in sf) payload.region = normalizeNullish(sf.region);
    if ("city" in sf) payload.city = normalizeNullish(sf.city);
    if ("postal_code" in sf)
      payload.postal_code = normalizeNullish(sf.postal_code);

    // ✅ Only update contact_type if provided. (Avoid overwriting with null.)
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
    if ("primary_contact_value" in sf)
      payload.primary_contact_value = normalizeNullish(
        sf.primary_contact_value,
      );

    if ("source_category" in sf)
      payload.source_category = normalizeNullish(sf.source_category);
    if ("source_name" in sf)
      payload.source_name = normalizeNullish(sf.source_name);

    shouldRecomputeScore = true;
  }

  if (updates.prospectorId !== undefined)
    payload.prospector_id = updates.prospectorId;
  if (updates.setterId !== undefined) payload.setter_id = updates.setterId;
  if (updates.closerId !== undefined) payload.closer_id = updates.closerId;
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
      {
        error: error?.message ?? "Failed to update lead",
        details: error ?? null,
      },
      { status: 500 },
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
      { status: 400 },
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
      { error: error.message ?? "Failed to delete lead", details: error },
      { status: 500 },
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
  prospectorId: string | null,
): Promise<string | null> {
  if (!prospectorId) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, team_id, role")
    .eq("id", prospectorId)
    .single();

  if (profileError || !profile) {
    console.error(
      "[LeadsAPI] Failed to load profile for setter assignment",
      profileError,
    );
    return null;
  }

  // ✅ normalize roles (case-insensitive)
  const rawRoles: string[] = Array.isArray((profile as any).role)
    ? (profile as any).role
    : [];
  const normRoles = rawRoles.map((r) => String(r).trim().toLowerCase());

  const isProspector = normRoles.includes("prospector");
  const isSetter = normRoles.includes("setter");

  // Rule 1: Prospector + Setter -> assign to self
  if (isProspector && isSetter) return prospectorId;

  // Rule 3: if not Prospector -> no setter
  if (!isProspector) return null;

  // ✅ load all team profiles, filter setters in code (avoids case-sensitive array contains)
  const { data: teamProfiles, error: teamProfilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("team_id", teamId);

  if (teamProfilesError) {
    console.error("[LeadsAPI] Failed to load team profiles", teamProfilesError);
    return null;
  }

  const setterIds = (Array.isArray(teamProfiles) ? teamProfiles : [])
    .map((p: any) => {
      const roles: string[] = Array.isArray(p.role) ? p.role : [];
      const norm = roles.map((r) => String(r).trim().toLowerCase());
      return norm.includes("setter") ? (p.id as string | null) : null;
    })
    .filter((id): id is string => Boolean(id));

  if (setterIds.length === 0) return null;

  // Balance using leads created this month
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
  setterIds.forEach((id) => (counts[id] = 0));

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
