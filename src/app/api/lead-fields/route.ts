// src/app/api/lead-fields/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import type { LeadFieldDefinition } from "@/types/lead";

// How the row looks in Postgres
interface DbLeadField {
  id: number;
  team_id: number;
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options: string[] | null; // stored as text[] or jsonb[]
  order: number;
}

// GET: return lead fields for current team
export async function GET() {
  const teamId = 1; // TODO: replace with real team from session

  try {
    const result = await pool.query<DbLeadField>(
      `
        SELECT id, team_id, key, label, type, options, "order"
        FROM lead_fields
        WHERE team_id = $1
        ORDER BY "order" ASC
      `,
      [teamId]
    );

    const fields: LeadFieldDefinition[] = result.rows.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.options && f.options.length > 0 ? f.options : undefined,
    }));

    return NextResponse.json(fields);
  } catch (err) {
    console.error("Error fetching lead fields", err);
    return NextResponse.json(
      { error: "Failed to fetch lead fields" },
      { status: 500 }
    );
  }
}

// POST: replace lead fields for current team (used by onboarding/settings)
export async function POST(req: Request) {
  const teamId = 1; // TODO: from auth/session

  try {
    const body = (await req.json()) as {
      fields: {
        key: string;
        label: string;
        type: "text" | "number" | "select" | "boolean";
        options?: string; // comma separated from onboarding/settings
      }[];
    };

    // Use a transaction: delete existing + insert new
    await pool.query("BEGIN");

    await pool.query(`DELETE FROM lead_fields WHERE team_id = $1`, [teamId]);

    for (let index = 0; index < body.fields.length; index++) {
      const f = body.fields[index];

      const optionsArray =
        f.type === "select" && f.options
          ? f.options
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      await pool.query(
        `
          INSERT INTO lead_fields (team_id, key, label, type, options, "order")
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [teamId, f.key, f.label, f.type, optionsArray, index]
      );
    }

    await pool.query("COMMIT");

    return NextResponse.json({ ok: true, count: body.fields.length });
  } catch (err) {
    console.error("Error saving lead fields", err);
    await pool.query("ROLLBACK");
    return NextResponse.json(
      { error: "Failed to save lead fields" },
      { status: 500 }
    );
  }
}
