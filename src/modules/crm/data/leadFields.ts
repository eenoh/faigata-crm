// src/modules/crm/data/leadFields.ts
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

const ENDPOINT = "/api/crm/lead-fields";

async function postJSON<T>(
  body: unknown,
  { errMsg, requireJSON = true }: { errMsg: string; requireJSON?: boolean },
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    const text = await res.text();
    console.error(
      "[leadFields]",
      errMsg,
      res.status,
      contentType,
      text.slice(0, 400),
    );
    throw new Error(errMsg);
  }

  if (!requireJSON) return undefined as T;

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error(
      "[leadFields] API returned non-JSON",
      res.status,
      contentType,
      text.slice(0, 400),
    );
    throw new Error("Lead fields API did not return JSON");
  }

  return (await res.json()) as T;
}

export async function getLeadFieldDefinitions(
  teamId: string,
): Promise<LeadFieldDefinition[]> {
  const data = await postJSON<LeadFieldDefinition[]>(
    { teamId },
    { errMsg: "Failed to fetch lead fields", requireJSON: true },
  );
  return data ?? [];
}

export async function saveLeadFieldDefinitions(
  teamId: string,
  fields: LeadFieldDefinition[],
): Promise<void> {
  const payload = {
    teamId,
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.type === "select" ? (f.options ?? []) : [],
    })),
  };

  await postJSON<void>(payload, {
    errMsg: "Failed to save lead fields",
    requireJSON: false,
  });
}
