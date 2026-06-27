import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/features/crm/types/lead";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

const ENDPOINT = "/api/crm/lead-fields";

type RequestOptions = {
  errMsg: string;
  requireJSON?: boolean;
};

async function getToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Unauthorized: missing session token");
  return token;
}

async function authedPost(
  input: unknown,
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
    body: JSON.stringify(input),
  });
}

async function postJSON<T>(
  body: unknown,
  locale: string | null | undefined,
  { errMsg, requireJSON = true }: RequestOptions,
): Promise<T> {
  let res: Response;

  try {
    res = await authedPost(body, locale);
  } catch (error) {
    console.error("[leadFields]", errMsg, "Network error", error);
    throw new Error(errMsg);
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

    console.error("[leadFields]", errMsg, res.status, contentType, details);
    throw new Error(details || errMsg);
  }

  if (!requireJSON) {
    return undefined as T;
  }

  if (!isJSON) {
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
  locale?: string | null,
): Promise<LeadFieldDefinition[]> {
  if (!teamId?.trim()) return [];

  const data = await postJSON<LeadFieldDefinition[]>({ teamId }, locale, {
    errMsg: "Failed to fetch lead fields",
    requireJSON: true,
  });

  return Array.isArray(data) ? data : [];
}

export async function saveLeadFieldDefinitions(
  teamId: string,
  fields: LeadFieldDefinition[],
  locale?: string | null,
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

  await postJSON<void>(payload, locale, {
    errMsg: "Failed to save lead fields",
    requireJSON: false,
  });
}
