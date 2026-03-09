// src/modules/crm/data/pipelineStages.ts
import { supabase } from "@/lib/supabaseClient";

/**
 * Now supports stable ids + optional scoring fields.
 * - id is optional to avoid breaking existing API responses during rollout.
 */
export interface PipelineStageDef {
  id?: string; // uuid
  name: string;
  position: number;

  // optional extras (safe to ignore if your API doesn't implement yet)
  score_points?: number;
  score_points_is_custom?: boolean;
  conversion_rate?: number | null;
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

function normalizeStage(
  raw: any,
  positionFallback: number,
): PipelineStageDef | null {
  const name = String(raw?.name ?? "").trim();
  if (!name) return null;

  const position = Number.isFinite(Number(raw?.position))
    ? Number(raw.position)
    : positionFallback;

  const idRaw = raw?.id;
  const id =
    typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : undefined;

  const score_points_raw = raw?.score_points;
  const score_points =
    score_points_raw === undefined || score_points_raw === null
      ? undefined
      : Number(score_points_raw);

  const score_points_is_custom =
    raw?.score_points_is_custom === undefined
      ? undefined
      : Boolean(raw.score_points_is_custom);

  const conversion_rate_raw = raw?.conversion_rate;
  const conversion_rate =
    conversion_rate_raw === undefined || conversion_rate_raw === null
      ? undefined
      : Number(conversion_rate_raw);

  return {
    id,
    name,
    position,
    ...(Number.isFinite(score_points as number)
      ? { score_points: score_points as number }
      : {}),
    ...(score_points_is_custom !== undefined ? { score_points_is_custom } : {}),
    ...(Number.isFinite(conversion_rate as number)
      ? { conversion_rate: conversion_rate as number }
      : {}),
  };
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
  const rows = (Array.isArray(json) ? json : json?.stages) as unknown;

  const normalized = (Array.isArray(rows) ? rows : [])
    .map((s: any, idx: number) => normalizeStage(s, idx))
    .filter((x): x is PipelineStageDef => Boolean(x))
    .slice()
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));

  return normalized;
}

export async function savePipelineStages(
  stages: PipelineStageDef[],
  teamId?: string | null,
): Promise<void> {
  /**
   * ✅ Critical: Preserve ids if present.
   * This prevents your backend from having to "delete & recreate" stages,
   * which would break leads.stage_id FK.
   */
  const normalizedStages: PipelineStageDef[] = (stages ?? [])
    .map((s, idx) => {
      const name = String(s?.name ?? "").trim();
      if (!name) return null;

      const id =
        typeof (s as any)?.id === "string" && String((s as any).id).trim()
          ? String((s as any).id).trim()
          : undefined;

      // allow optional score fields to be passed through
      const score_points =
        (s as any)?.score_points === undefined ||
        (s as any)?.score_points === null
          ? undefined
          : Number((s as any).score_points);

      const score_points_is_custom =
        (s as any)?.score_points_is_custom === undefined
          ? undefined
          : Boolean((s as any).score_points_is_custom);

      const out: PipelineStageDef = {
        ...(id ? { id } : {}),
        name,
        position: idx,
        ...(Number.isFinite(score_points as number)
          ? { score_points: score_points as number }
          : {}),
        ...(score_points_is_custom !== undefined
          ? { score_points_is_custom }
          : {}),
      };

      return out;
    })
    .filter((x): x is PipelineStageDef => Boolean(x));

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
