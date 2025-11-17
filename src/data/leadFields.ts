// src/data/leadFields.ts
import type { LeadFieldDefinition } from "@/types/lead";

/**
 * Load lead field definitions for a team from the API.
 */
export async function getLeadFieldDefinitions(
  teamId: string
): Promise<LeadFieldDefinition[]> {
  const res = await fetch(
    `/api/lead-fields?teamId=${encodeURIComponent(teamId)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error("Failed to fetch lead fields", await res.text());
    throw new Error("Failed to fetch lead fields");
  }

  const data = (await res.json()) as LeadFieldDefinition[];
  return data ?? [];
}

/**
 * Save lead field definitions for a team to the API.
 */
export async function saveLeadFieldDefinitions(
  teamId: string,
  fields: LeadFieldDefinition[]
): Promise<void> {
  const payload = {
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      // directly send the string[] (or empty array)
      options: f.type === "select" ? f.options ?? [] : [],
    })),
  };

  const res = await fetch(
    `/api/lead-fields?teamId=${encodeURIComponent(teamId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    console.error("Failed to save lead fields", await res.text());
    throw new Error("Failed to save lead fields");
  }
}
