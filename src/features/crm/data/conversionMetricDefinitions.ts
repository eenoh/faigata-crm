import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import type { ConversionMetricDefinition } from "@/features/crm/utils/conversionMetrics";

const ENDPOINT = "/api/crm/conversion-metrics";

async function getToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Unauthorized: missing session token");
  return token;
}

async function authedPost(
  body: unknown,
  locale?: string | null,
): Promise<Response> {
  const token = await getToken();

  return fetch(ENDPOINT, {
    method: "POST",
    headers: withLocaleHeader(
      {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      locale,
    ),
    cache: "no-store",
    body: JSON.stringify(body),
  });
}

async function postCRM<T>(body: unknown, locale?: string | null): Promise<T> {
  let res: Response;

  try {
    res = await authedPost(body, locale);
  } catch (error) {
    console.error(
      "CRM conversion metrics request failed",
      "Network error",
      error,
    );
    throw new Error("Failed to fetch conversion metric definitions");
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJSON = contentType.includes("application/json");

  if (!res.ok) {
    let details = "";

    try {
      if (isJSON) {
        const data = (await res.json()) as { error?: string; message?: string };
        details = data?.error || data?.message || "";
      } else {
        details = (await res.text()).slice(0, 400);
      }
    } catch {
      details = "";
    }

    console.error(
      "CRM conversion metrics request failed",
      res.status,
      contentType,
      details,
    );
    throw new Error(details || "Failed to fetch conversion metric definitions");
  }

  if (!isJSON) {
    const text = await res.text();
    console.error(
      "CRM conversion metrics API returned non-JSON",
      res.status,
      contentType,
      text.slice(0, 400),
    );
    throw new Error("Conversion metrics API did not return JSON");
  }

  return (await res.json()) as T;
}

function toIntOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? ((Math.round(n) | 0) as number) : null;
}

export async function getConversionMetricDefinitions(
  teamId: string | null,
  locale?: string | null,
): Promise<ConversionMetricDefinition[]> {
  if (!teamId) return [];

  // Accept either { definitions } or raw array (future-proof)
  const json = await postCRM<unknown>({ teamId, action: "get" }, locale);
  const raw = (
    Array.isArray(json) ? json : (json as any)?.definitions
  ) as any[];

  const defs = (Array.isArray(raw) ? raw : []).map(
    (d): ConversionMetricDefinition => ({
      id: d.id,
      label: d.label,
      fromStageId: d.fromStageId,
      toStageId: d.toStageId,
      fromStageName: d.fromStageName,
      toStageName: d.toStageName,
      position: Number(d.position ?? 0),
      // Normalize from either targetRate (camel) or target_rate (snake)
      targetRate: toIntOrNull(d?.targetRate ?? d?.target_rate),
    }),
  );

  return defs.sort((a, b) => a.position - b.position);
}

export async function saveConversionMetricDefinitions(
  teamId: string,
  defs: ConversionMetricDefinition[],
  locale?: string | null,
): Promise<void> {
  if (!teamId)
    throw new Error("Missing teamId when saving conversion metric definitions");

  const normalized = defs.map((d, index) => ({
    id: d.id, // keep if API uses it (safe to include)
    label: String(d.label ?? "").trim(),
    fromStageId: d.fromStageId,
    toStageId: d.toStageId,
    position: index,
    targetRate: d.targetRate == null ? null : toIntOrNull(d.targetRate),
  }));

  await postCRM<void>(
    {
      teamId,
      action: "save",
      definitions: normalized,
    },
    locale,
  );
}
