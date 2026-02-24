// src/modules/crm/data/pipelineStages.ts
import { supabase } from "@/lib/supabaseClient";

export interface PipelineStageDef {
  name: string;
  position: number;
}

type SavePayload = { stages: PipelineStageDef[] };

const ENDPOINT = "/api/crm/pipeline-stages";

async function getToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Unauthorized: missing session token");
  return token;
}

function withTeamId(url: string, teamId?: string | null) {
  return teamId ? `${url}?teamId=${encodeURIComponent(teamId)}` : url;
}

async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getToken();

  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers, cache: "no-store" });
}

/**
 * Read an error message from an API response.
 * Supports:
 *  - JSON: { ok:false, error:"..." }
 *  - JSON: { message:"..." }
 *  - plain text
 */
async function readApiError(res: Response): Promise<string> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      const json: any = await res.json();
      return (
        (typeof json?.error === "string" && json.error.trim()) ||
        (typeof json?.message === "string" && json.message.trim()) ||
        "Request failed (invalid error payload)"
      );
    } catch {
      // fall through
    }
  }

  return (await res.text().catch(() => "")).trim() || "Request failed";
}

export async function getPipelineStages(
  teamId?: string | null,
): Promise<PipelineStageDef[]> {
  const res = await authedFetch(withTeamId(ENDPOINT, teamId));

  if (!res.ok) {
    const msg = await readApiError(res);
    console.error("Failed to fetch pipeline stages", msg);
    throw new Error(msg || "Failed to fetch pipeline stages");
  }

  // Accept { ok:true, stages:[...] } or raw array
  const json: any = await res.json();
  const stages = (Array.isArray(json) ? json : json?.stages) as unknown;

  return (Array.isArray(stages) ? (stages as PipelineStageDef[]) : [])
    .slice()
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

export async function savePipelineStages(
  stages: PipelineStageDef[],
  teamId?: string | null,
): Promise<void> {
  const normalizedStages: PipelineStageDef[] = (stages ?? [])
    .map((s, idx) => ({ name: String(s?.name ?? "").trim(), position: idx }))
    .filter((s) => s.name.length > 0);

  const res = await authedFetch(withTeamId(ENDPOINT, teamId), {
    method: "PUT",
    body: JSON.stringify({ stages: normalizedStages } satisfies SavePayload),
  });

  if (!res.ok) {
    const msg = await readApiError(res);
    console.error("Failed to save pipeline stages", msg);
    throw new Error(msg || "Failed to save pipeline stages");
  }
}
