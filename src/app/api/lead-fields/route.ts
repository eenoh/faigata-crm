// src/app/api/lead-fields/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeadFieldDefinition } from "@/types/lead";

type DbLeadField = {
  id: string;
  team_id: string;
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "link";
  options: string[];
  position: number;
};


// TEMP helper: get teamId from query: /api/lead-fields?teamId=...
function getTeamIdFromRequest(req: Request): string | null {
  const url = new URL(req.url);
  return url.searchParams.get("teamId");
}

/* ---------- GET: return lead fields for a team ---------- */

export async function GET(req: Request) {
  const teamId = getTeamIdFromRequest(req);

  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("lead_fields")
      .select("id, team_id, key, label, type, options, position")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error fetching lead fields", error);
      return NextResponse.json(
        { error: "Failed to fetch lead fields" },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as DbLeadField[];

    const fields: LeadFieldDefinition[] = rows.map((f) => ({
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

/* ---------- POST: replace lead fields for a team ---------- */

export async function POST(req: Request) {
  const teamId = getTeamIdFromRequest(req);

  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  try {
    const body = (await req.json()) as {
      fields: {
        key: string;
        label: string;
        type: "text" | "number" | "select" | "boolean" | "link";
        options?: string;
      }[];
    };

    // 1) Delete existing fields
    const { error: deleteError } = await supabaseAdmin
      .from("lead_fields")
      .delete()
      .eq("team_id", teamId);

    if (deleteError) {
      console.error("Error deleting lead fields", deleteError);
      return NextResponse.json(
        { error: "Failed to save lead fields" },
        { status: 500 }
      );
    }

    // 2) Insert new fields
    const rows = body.fields.map((f, index) => {
      const optionsArray =
        f.type === "select" && Array.isArray(f.options)
          ? f.options.filter(Boolean)
          : [];

      return {
        team_id: teamId,
        key: f.key,
        label: f.label,
        type: f.type, // must match lead_field_type enum
        options: optionsArray, // text[] NOT NULL
        position: index,
      };
    });

    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("lead_fields")
        .insert(rows);

      if (insertError) {
        console.error("Error inserting lead fields", insertError);
        return NextResponse.json(
          { error: "Failed to save lead fields" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    console.error("Error saving lead fields", err);
    return NextResponse.json(
      { error: "Failed to save lead fields" },
      { status: 500 }
    );
  }
}
