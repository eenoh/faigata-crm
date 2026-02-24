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
  options: string[] | null;
  position: number | null;
};

type Body = {
  teamId?: string;
  fields?: {
    key: string;
    label: string;
    type: DbLeadField["type"];
    options?: string[];
  }[];
} | null;

const json = (data: any, status = 200) => NextResponse.json(data, { status });

/** POST = load OR save, depending on whether `fields` is present */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body;
  const teamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";

  if (!teamId) return json({ error: "Missing teamId" }, 400);

  // ----- SAVE mode: body.fields present -----
  if (Array.isArray(body?.fields)) {
    const input = body.fields;

    try {
      const { error: delErr } = await supabaseAdmin
        .from("lead_fields")
        .delete()
        .eq("team_id", teamId);
      if (delErr) {
        console.error("[lead-fields] delete error", delErr);
        return json({ error: "Failed to save lead fields" }, 500);
      }

      const rows = input
        .map((f, index) => {
          const key = String(f?.key ?? "").trim();
          const label = String(f?.label ?? "").trim();
          const type = f?.type;

          if (!key || !label) return null;

          const options =
            type === "select" && Array.isArray(f?.options)
              ? f.options.map((x) => String(x ?? "").trim()).filter(Boolean)
              : null; // ✅ store null for non-select to match DbLeadField.options

          return {
            team_id: teamId,
            key,
            label,
            type,
            options,
            position: index,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (rows.length) {
        const { error: insErr } = await supabaseAdmin
          .from("lead_fields")
          .insert(rows);
        if (insErr) {
          console.error("[lead-fields] insert error", insErr);
          return json({ error: "Failed to save lead fields" }, 500);
        }
      }

      return json({ ok: true, count: rows.length });
    } catch (err) {
      console.error("[lead-fields] save error", err);
      return json({ error: "Failed to save lead fields" }, 500);
    }
  }

  // ----- LOAD mode: return definitions -----
  try {
    const { data, error } = await supabaseAdmin
      .from("lead_fields")
      .select("id, team_id, key, label, type, options, position")
      .eq("team_id", teamId)
      .order("position", { ascending: true });

    if (error) {
      console.error("[lead-fields] fetch error", error);
      return json({ error: "Failed to fetch lead fields" }, 500);
    }

    const rows = (Array.isArray(data) ? data : []) as DbLeadField[];

    // ✅ Return full LeadFieldDefinition objects
    const fields: LeadFieldDefinition[] = rows.map((f) => ({
      id: String(f.id),
      team_id: String(f.team_id),
      key: String(f.key),
      label: String(f.label),
      type: f.type,
      options:
        f.type === "select" ? (Array.isArray(f.options) ? f.options : []) : [],
      position: typeof f.position === "number" ? f.position : undefined,
    }));

    return json(fields);
  } catch (err) {
    console.error("[lead-fields] fetch error", err);
    return json({ error: "Failed to fetch lead fields" }, 500);
  }
}
