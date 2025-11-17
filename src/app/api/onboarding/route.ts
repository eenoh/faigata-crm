// src/app/api/onboarding/route.ts
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
      timezone,
      invites,
      fields,
      pipelineStages,
      conversionMetrics,
      importFileName,
    } = body;


    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

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

    /* 3) Upsert profile: link user → org + team, store name, mark as admin */
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,              // important: match auth.users.id
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          company_id: organizationId,
          team_id: teamId,
          role: "Admin",           // your human-readable role
        },
        { onConflict: "id" }       // use existing row if it already exists
      );

    if (profileError) {
      console.error("[onboarding] profiles.upsert", profileError);
      throw profileError;
    }


    /* 4) Add the user as a team_member (enum role) */
    const { error: memberError } = await supabaseAdmin
      .from("team_members")
      .insert({
        team_id: teamId,
        user_id: userId,
        role: "admin", // MUST match team_role enum value
      });

    if (memberError) {
      console.error("[onboarding] team_members.insert", memberError);
      throw memberError;
    }

    /* 5) Create team_invites from the onboarding invites UI */
    if (Array.isArray(invites)) {
      const validInvites = invites.filter(
        (i: any) => i.email && i.email.trim() !== ""
      );

      if (validInvites.length > 0) {
        const inviteRows = validInvites.map((i: any) => ({
          team_id: teamId,
          email: i.email,
          role: ROLE_DB_MAP[i.role] ?? "setter", // enum value
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
        // Always an array for Postgres (NOT NULL)
        let optionsArray: string[] = [];

        // Only dropdown fields use options; others get []
        if (
          f.type === "select" &&
          typeof f.options === "string" &&
          f.options.trim() !== ""
        ) {
          optionsArray = f.options
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        // map UI type → DB enum type
        const dbType =
          f.type === "url"
            ? "text" // URL stored as text in DB
            : f.type; // "text" | "number" | "select" | "boolean"

        return {
          team_id: teamId,
          key: f.key,
          label: f.label,
          type: dbType,      // must match lead_field_type enum
          options: optionsArray, // JS array → Postgres text[]
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
      const stageRows = pipelineStages.map(
        (name: string, index: number) => ({
          team_id: teamId,
          name,
          position: index,
        })
      );

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

    /* 8) Insert conversion metrics (only if we can resolve both stages) */
    if (Array.isArray(conversionMetrics) && conversionMetrics.length > 0) {
      const metricRows = conversionMetrics
        .map((m: any, index: number) => {
          const fromId = stageIdByName[m.fromStage];
          const toId = stageIdByName[m.toStage];

          // If stage names don't match, skip this metric instead of crashing
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

    // Success: return ids so the client can redirect to the correct workspace
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
