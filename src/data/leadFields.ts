// src/data/leadFields.ts
import type { LeadFieldDefinition } from "@/types/lead";

/**
 * Fetch lead field definitions for the current team
 * from the API (Postgres-backed).
 */
export async function getLeadFieldDefinitions(): Promise<LeadFieldDefinition[]> {
  if (typeof window === "undefined") {
    // Client-only helper – server can call DB directly later if needed
    return [];
  }

  try {
    const res = await fetch("/api/lead-fields", { cache: "no-store" });
    if (!res.ok) {
      console.error("Failed to fetch lead fields", res.status);
      return [];
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];

    return data as LeadFieldDefinition[];
  } catch (err) {
    console.error("Error fetching lead fields", err);
    return [];
  }
}

/**
 * Save lead field definitions via the API.
 */
export async function saveLeadFieldDefinitions(
  fields: LeadFieldDefinition[]
): Promise<void> {
  if (typeof window === "undefined") return;

  const payload = {
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      // API expects comma-separated string for options
      options: Array.isArray(f.options) ? f.options.join(",") : undefined,
    })),
  };

  const res = await fetch("/api/lead-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("Failed to save lead field definitions", res.status);
  }
}
