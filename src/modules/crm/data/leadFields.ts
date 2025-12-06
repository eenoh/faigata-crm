// src/modules/crm/data/leadFields.ts
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

export async function getLeadFieldDefinitions(
  teamId: string
): Promise<LeadFieldDefinition[]> {
  const res = await fetch("/api/crm/lead-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ teamId }),
  });

  const contentType = res.headers.get("content-type") ?? "";

  // If the response is not OK, log the body (might be HTML error page)
  if (!res.ok) {
    const text = await res.text();
    console.error(
      "[leadFields] Failed to fetch lead fields",
      res.status,
      contentType,
      text.slice(0, 400)
    );
    throw new Error("Failed to fetch lead fields");
  }

  // If it's not JSON, also log & bail (prevents `Unexpected token '<'`)
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error(
      "[leadFields] API returned non-JSON",
      res.status,
      contentType,
      text.slice(0, 400)
    );
    throw new Error("Lead fields API did not return JSON");
  }

  const data = (await res.json()) as LeadFieldDefinition[];
  return data ?? [];
}

export async function saveLeadFieldDefinitions(
  teamId: string,
  fields: LeadFieldDefinition[]
): Promise<void> {
  const payload = {
    teamId,
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.type === "select" ? f.options ?? [] : [],
    })),
  };

  const res = await fetch("/api/crm/lead-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    const text = await res.text();
    console.error(
      "[leadFields] Failed to save lead fields",
      res.status,
      contentType,
      text.slice(0, 400)
    );
    throw new Error("Failed to save lead fields");
  }

  // we don't actually need the response body here, so no res.json() at all
}
