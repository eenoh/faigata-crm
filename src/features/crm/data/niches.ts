import { supabase } from "@/lib/supabaseClient";
import type {
  LeadNicheOption,
  NicheRecord,
} from "@/features/crm/server/niches.shared";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

const ENDPOINT = "/api/crm/niches";

type TeamNicheSettingsResponse = {
  ok: true;
  team: {
    id: string;
    name: string | null;
    organization_id: string | null;
  };
  catalog: NicheRecord[];
  enabledNicheIds: string[];
  enabledNiches: NicheRecord[];
};

type LeadFormNichesResponse = {
  ok: true;
  options: LeadNicheOption[];
};

type CreateCustomNicheResponse = {
  ok: true;
  niche: NicheRecord;
  created: boolean;
  alreadyEnabledForTeam?: boolean;
};

async function getToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Unauthorized: missing session token");
  return token;
}

async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  locale?: string | null,
) {
  const token = await getToken();
  const method = (init.method ?? "GET").toUpperCase();
  const headers = withLocaleHeader(init.headers, locale);

  headers.set("Authorization", `Bearer ${token}`);

  if (method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers, cache: "no-store" });
}

async function readApiError(res: Response): Promise<string> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();

  if (ct.includes("application/json")) {
    try {
      const json: any = await res.json();
      return (
        (typeof json?.error === "string" && json.error.trim()) ||
        (typeof json?.message === "string" && json.message.trim()) ||
        "Request failed"
      );
    } catch {
      return "Request failed";
    }
  }

  return (await res.text().catch(() => "")).trim() || "Request failed";
}

export async function getTeamNicheSettings(
  locale?: string | null,
): Promise<TeamNicheSettingsResponse> {
  const res = await authedFetch(ENDPOINT, {}, locale);
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as TeamNicheSettingsResponse;
}

export async function getLeadFormNicheOptions(
  includeArchivedNicheId?: string | null,
  locale?: string | null,
): Promise<LeadFormNichesResponse> {
  const url = new URL(ENDPOINT, window.location.origin);
  url.searchParams.set("view", "lead-form");

  if (includeArchivedNicheId?.trim()) {
    url.searchParams.set(
      "includeArchivedNicheId",
      includeArchivedNicheId.trim(),
    );
  }

  const res = await authedFetch(url.toString(), {}, locale);
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  return (await res.json()) as LeadFormNichesResponse;
}

export async function saveTeamNicheSelections(
  nicheIds: string[],
  locale?: string | null,
) {
  const res = await authedFetch(
    ENDPOINT,
    {
      method: "PUT",
      body: JSON.stringify({ nicheIds }),
    },
    locale,
  );

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return res.json();
}

export async function createCustomNiche(
  name: string,
  locale?: string | null,
): Promise<CreateCustomNicheResponse> {
  const res = await authedFetch(
    ENDPOINT,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
    locale,
  );

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  return (await res.json()) as CreateCustomNicheResponse;
}
