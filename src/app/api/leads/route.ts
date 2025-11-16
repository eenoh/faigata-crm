// src/app/api/leads/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

interface DbLead {
  id: number;
  team_id: number;
  campaign_id: number | null;
  name: string;
  company: string | null;
  stage: string;
  custom_values: Record<string, any> | null;
  created_at: string;
}

// Create a new lead
export async function POST(req: Request) {
  const teamId = 1; // TODO: get from session/auth

  try {
    const body = await req.json();

    const result = await pool.query<DbLead>(
      `
        INSERT INTO leads (
          team_id, campaign_id, name, company, stage, custom_values
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id, team_id, campaign_id, name, company, stage, custom_values, created_at
      `,
      [
        teamId,
        body.campaignId ?? null,
        body.name,
        body.company ?? null,
        body.stage,
        body.customValues ?? {},
      ]
    );

    const lead = result.rows[0];
    return NextResponse.json(lead);
  } catch (err) {
    console.error("Error creating lead", err);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

// List leads for the current team
export async function GET() {
  const teamId = 1; // TODO: dynamic team when auth is added

  try {
    const result = await pool.query<DbLead>(
      `
        SELECT
          id, team_id, campaign_id, name, company, stage, custom_values, created_at
        FROM leads
        WHERE team_id = $1
        ORDER BY id DESC
      `,
      [teamId]
    );

    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("Error fetching leads", err);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}
