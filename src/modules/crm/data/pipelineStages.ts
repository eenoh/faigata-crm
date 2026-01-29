// src/modules/crm/data/pipelineStages.ts
import { supabase } from "@/lib/supabaseClient";

export interface PipelineStageDef {
  name: string;
  position: number;
}

type SavePayload = {
  stages: PipelineStageDef[];
};

async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
  const token = sessionRes.session?.access_token ?? null;

  if (sessionErr || !token) {
    throw new Error("Unauthorized: missing session token");
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // Only set JSON on non-GET
  const method = (init?.method ?? "GET").toUpperCase();
  if (!headers.has("Content-Type") && method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function getPipelineStages(teamId?: string | null): Promise<PipelineStageDef[]> {
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const res = await authedFetch(`/api/crm/pipeline-stages${qs}`, { method: "GET" });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Failed to fetch pipeline stages", text);
    throw new Error(text || "Failed to fetch pipeline stages");
  }

  const json = (await res.json()) as any;

  // Accept { ok, stages } OR raw array
  const stagesRaw = Array.isArray(json) ? json : json?.stages;
  const stages = (Array.isArray(stagesRaw) ? stagesRaw : []) as PipelineStageDef[];

  return [...stages].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

export async function savePipelineStages(
  stages: PipelineStageDef[],
  teamId?: string | null
): Promise<void> {
  const normalizedStages: PipelineStageDef[] = (stages ?? [])
    .map((s, idx) => ({
      name: String(s?.name ?? "").trim(),
      position: idx,
    }))
    .filter((s) => s.name.length > 0);

  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const res = await authedFetch(`/api/crm/pipeline-stages${qs}`, {
    method: "PUT",
    body: JSON.stringify({ stages: normalizedStages } satisfies SavePayload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Failed to save pipeline stages", text);
    throw new Error(text || "Failed to save pipeline stages");
  }
}
