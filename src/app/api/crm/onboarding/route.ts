// src/app/api/crm/onboarding/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

// UI role labels → DB enum values
const ROLE_DB_MAP: Record<string, string> = {
  Prospector: "prospector",
  Setter: "setter",
  Closer: "closer",
  Manager: "manager",
  Admin: "admin",
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      userId,
      firstName,
      lastName,
      companyName,
      teamName,
      timezone, // not used in DB here (ok)
      invites,
      fields,
      pipelineStages,
      conversionMetrics,
      importFileName, // not used in DB here (ok)
    } = body;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    const adminRole = ROLE_DB_MAP.Admin; // "admin"

    /* 1) Create organization */
    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: companyName || "Untitled organization",
      })
      .select("id")
      .single();

    if (orgError) {
      console.error("[onboarding] organizations.insert", orgError);
      throw orgError;
    }
    const organizationId = organization.id as string;

    /* 2) Create team (workspace) */
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .insert({
        name: teamName || "Sales Team",
        onboarding_completed: true,
      })
      .select("id")
      .single();

    if (teamError) {
      console.error("[onboarding] teams.insert", teamError);
      throw teamError;
    }
    const teamId = team.id as string;

    /* 3) Upsert profile: link user → org + team */
    // role is an ARRAY (based on previous "malformed array literal" error)
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        company_id: organizationId,
        team_id: teamId,
        role: [adminRole], // ✅ array
      },
      { onConflict: "id" } // profiles.id should be PK/unique
    );

    if (profileError) {
      console.error("[onboarding] profiles.upsert", profileError);
      throw profileError;
    }

    /* 4) Ensure user exists in team_members */
    // IMPORTANT: your DB currently has NO unique constraint on (team_id, user_id),
    // so we CANNOT use upsert(onConflict: "team_id,user_id").
    const { data: existingMember, error: memberSelectError } =
      await supabaseAdmin
        .from("team_members")
        .select("team_id,user_id")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle();

    if (memberSelectError) {
      console.error("[onboarding] team_members.select", memberSelectError);
      throw memberSelectError;
    }

    if (!existingMember) {
      const { error: memberInsertError } = await supabaseAdmin
        .from("team_members")
        .insert({
          team_id: teamId,
          user_id: userId,
          role: [adminRole], // ✅ array (matches your other code)
        });

      if (memberInsertError) {
        console.error("[onboarding] team_members.insert", memberInsertError);
        throw memberInsertError;
      }
    }

    /* 5) Create team_invites from the onboarding invites UI */
    if (Array.isArray(invites)) {
      const validInvites = invites.filter(
        (i: any) => i?.email && String(i.email).trim() !== ""
      );

      if (validInvites.length > 0) {
        const inviteRows = validInvites.map((i: any) => ({
          team_id: teamId,
          email: String(i.email).trim(),
          role: ROLE_DB_MAP[i.role] ?? "setter",
          invited_by: userId,
          token: randomUUID(),
        }));

        const { error: invitesError } = await supabaseAdmin
          .from("team_invites")
          .insert(inviteRows);

        if (invitesError) {
          console.error("[onboarding] team_invites.insert", invitesError);
          throw invitesError;
        }
      }
    }

    /* 6) Insert custom lead fields */
    if (Array.isArray(fields) && fields.length > 0) {
      const fieldRows = fields.map((f: any, index: number) => {
        let optionsArray: string[] = [];

        if (typeof f?.options === "string" && f.options.trim() !== "") {
          optionsArray = f.options
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        const dbType = f.type === "url" ? "text" : f.type;

        return {
          team_id: teamId,
          key: f.key,
          label: f.label,
          type: dbType,
          options: optionsArray,
          position: index,
        };
      });

      const { error: fieldsError } = await supabaseAdmin
        .from("lead_fields")
        .insert(fieldRows);

      if (fieldsError) {
        console.error("[onboarding] lead_fields.insert", fieldsError);
        throw fieldsError;
      }
    }

    /* 7) Insert pipeline stages and remember their ids by name */
    let stageIdByName: Record<string, string> = {};

    if (Array.isArray(pipelineStages) && pipelineStages.length > 0) {
      const stageRows = pipelineStages.map((name: string, index: number) => ({
        team_id: teamId,
        name,
        position: index,
      }));

      const { data: insertedStages, error: stagesError } = await supabaseAdmin
        .from("pipeline_stages")
        .insert(stageRows)
        .select("id, name");

      if (stagesError) {
        console.error("[onboarding] pipeline_stages.insert", stagesError);
        throw stagesError;
      }

      stageIdByName = {};
      for (const s of insertedStages ?? []) {
        stageIdByName[s.name as string] = s.id as string;
      }
    }

    /* 8) Insert conversion metrics */
    if (Array.isArray(conversionMetrics) && conversionMetrics.length > 0) {
      const metricRows = conversionMetrics
        .map((m: any, index: number) => {
          const fromId = stageIdByName[m.fromStage];
          const toId = stageIdByName[m.toStage];
          if (!fromId || !toId) return null;

          return {
            team_id: teamId,
            label: m.label,
            from_stage_id: fromId,
            to_stage_id: toId,
            position: index,
          };
        })
        .filter(Boolean) as any[];

      if (metricRows.length > 0) {
        const { error: metricsError } = await supabaseAdmin
          .from("conversion_metrics")
          .insert(metricRows);

        if (metricsError) {
          console.error("[onboarding] conversion_metrics.insert", metricsError);
          throw metricsError;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        organizationId,
        teamId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Onboarding POST failed:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Unknown error",
        details: err,
      },
      { status: 500 }
    );
  }
}
