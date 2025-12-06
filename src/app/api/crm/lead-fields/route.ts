// src/app/api/crm/lead-fields/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

type DbLeadField = {
  id: string;
  team_id: string;
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "link";
  options: string[];
  position: number;
};

type Body =
  | {
      teamId?: string;
      fields?: {
        key: string;
        label: string;
        type: DbLeadField["type"];
        options?: string[];
      }[];
    }
  | null;

/** POST = load OR save, depending on whether `fields` is present */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body;
  const teamId = body?.teamId;

  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  // ----- SAVE mode: body.fields present -----
  if (Array.isArray(body?.fields)) {
    const fields = body.fields;

    try {
      // 1) delete existing
      const { error: delErr } = await supabaseAdmin
        .from("lead_fields")
        .delete()
        .eq("team_id", teamId);

      if (delErr) {
        console.error("[lead-fields] delete error", delErr);
        return NextResponse.json(
          { error: "Failed to save lead fields" },
          { status: 500 }
        );
      }

      // 2) insert new
      const rows = fields.map((f, index) => ({
        team_id: teamId,
        key: f.key,
        label: f.label,
        type: f.type,
        options:
          f.type === "select" && Array.isArray(f.options)
            ? f.options.filter(Boolean)
            : [],
        position: index,
      }));

      if (rows.length > 0) {
        const { error: insErr } = await supabaseAdmin
          .from("lead_fields")
          .insert(rows);

        if (insErr) {
          console.error("[lead-fields] insert error", insErr);
          return NextResponse.json(
            { error: "Failed to save lead fields" },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({ ok: true, count: rows.length });
    } catch (err) {
      console.error("[lead-fields] save error", err);
      return NextResponse.json(
        { error: "Failed to save lead fields" },
        { status: 500 }
      );
    }
  }

  // ----- LOAD mode: just return definitions -----
  try {
    const { data, error } = await supabaseAdmin
      .from("lead_fields")
      .select("id, team_id, key, label, type, options, position")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) {
      console.error("[lead-fields] fetch error", error);
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
    console.error("[lead-fields] fetch error", err);
    return NextResponse.json(
      { error: "Failed to fetch lead fields" },
      { status: 500 }
    );
  }
}
