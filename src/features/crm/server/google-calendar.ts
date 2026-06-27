import type { AppSupabaseClient } from "@/lib/supabase/types";
import { serverEnv } from "@/lib/env/server";

type RefreshGoogleAccessTokenOptions = {
  reconnectMessage?: string;
  reconnectDetail?: string;
  reconnectUserId?: string;
};

type CreateGoogleCalendarEventArgs = {
  accessToken: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendeeEmail?: string;
  sendUpdates?: "all" | "none" | "externalOnly";
  reconnectMessage?: string;
  reconnectDetail?: string;
  reconnectUserId?: string;
};

type FetchGoogleFreeBusyArgs = {
  accessToken: string;
  timezone: string;
  timeMinISO: string;
  timeMaxISO: string;
  reconnectMessage?: string;
  reconnectDetail?: string;
  reconnectUserId?: string;
};

type FetchGoogleCalendarEventArgs = {
  accessToken: string;
  eventId: string;
  reconnectMessage?: string;
  reconnectDetail?: string;
  reconnectUserId?: string;
};

type GoogleCalendarTokenRow = {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: string | null;
};

export type GoogleCalendarEventPerson = {
  email: string | null;
  displayName: string | null;
  self?: boolean | null;
};

export type GoogleCalendarEventAttendee = GoogleCalendarEventPerson & {
  responseStatus: string | null;
  organizer?: boolean | null;
  optional?: boolean | null;
};

export type GoogleCalendarEventSnapshot = {
  id: string;
  htmlLink: string | null;
  hangoutLink: string | null;
  meetLink: string | null;
  attendees: GoogleCalendarEventAttendee[];
  organizer: GoogleCalendarEventPerson | null;
  creator: GoogleCalendarEventPerson | null;
};

export class GoogleReconnectRequiredError extends Error {
  detail?: string;
  userId?: string;

  constructor(
    message = "google_reconnect_required",
    options?: { detail?: string; userId?: string },
  ) {
    super(message);
    this.name = "GoogleReconnectRequiredError";
    this.detail = options?.detail;
    this.userId = options?.userId;
  }
}

export function isGoogleReconnectRequiredError(error: unknown) {
  return (
    error instanceof GoogleReconnectRequiredError ||
    (error as { name?: string })?.name === "GoogleReconnectRequiredError"
  );
}

export function createGoogleReconnectRequiredError(options?: {
  message?: string;
  detail?: string;
  userId?: string;
}) {
  return new GoogleReconnectRequiredError(
    options?.message,
    options ? { detail: options.detail, userId: options.userId } : undefined,
  );
}

export function isGoogleReconnectStatus(status: number) {
  return status === 401 || status === 403;
}

export function isGoogleInvalidCredentials(code: number, message: string) {
  const normalized = message.toLowerCase();

  return (
    code === 401 ||
    code === 403 ||
    normalized.includes("invalid credentials") ||
    normalized.includes("login required")
  );
}

export function googleAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function fetchGoogleJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  return { response, data };
}

function normalizeGoogleCalendarPerson(
  value: unknown,
): GoogleCalendarEventPerson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const person = value as Record<string, unknown>;
  const email =
    typeof person.email === "string" && person.email.trim()
      ? person.email.trim()
      : null;
  const displayName =
    typeof person.displayName === "string" && person.displayName.trim()
      ? person.displayName.trim()
      : null;

  if (!email && !displayName && typeof person.self !== "boolean") return null;

  return {
    email,
    displayName,
    self: typeof person.self === "boolean" ? person.self : null,
  };
}

function normalizeGoogleCalendarAttendees(
  value: unknown,
): GoogleCalendarEventAttendee[] {
  if (!Array.isArray(value)) return [];

  const attendees: GoogleCalendarEventAttendee[] = [];

  for (const entry of value) {
    const person = normalizeGoogleCalendarPerson(entry);
    if (!person) continue;

    const attendee = entry as Record<string, unknown>;
    attendees.push({
      ...person,
      responseStatus:
        typeof attendee.responseStatus === "string" &&
        attendee.responseStatus.trim()
          ? attendee.responseStatus.trim()
          : null,
      organizer:
        typeof attendee.organizer === "boolean" ? attendee.organizer : null,
      optional:
        typeof attendee.optional === "boolean" ? attendee.optional : null,
    });
  }

  return attendees;
}

function getGoogleMeetLinkFromEventData(
  data: Record<string, unknown> | null | undefined,
) {
  const hangoutLink =
    typeof data?.hangoutLink === "string" && data.hangoutLink.trim()
      ? data.hangoutLink.trim()
      : null;

  const entryPoints = (data?.conferenceData as Record<string, unknown> | null)
    ?.entryPoints;

  const conferenceMeetLink = Array.isArray(entryPoints)
    ? (entryPoints.find((entryPoint) => {
        if (
          !entryPoint ||
          typeof entryPoint !== "object" ||
          Array.isArray(entryPoint)
        ) {
          return false;
        }

        return (
          (entryPoint as Record<string, unknown>).entryPointType === "video"
        );
      }) as Record<string, unknown> | undefined)?.uri
    : null;

  return (
    hangoutLink ||
    (typeof conferenceMeetLink === "string" && conferenceMeetLink.trim()
      ? conferenceMeetLink.trim()
      : null)
  );
}

function snapshotGoogleCalendarEvent(
  data: Record<string, unknown> | null | undefined,
): GoogleCalendarEventSnapshot {
  const id =
    typeof data?.id === "string" && data.id.trim() ? data.id.trim() : "";
  const htmlLink =
    typeof data?.htmlLink === "string" && data.htmlLink.trim()
      ? data.htmlLink.trim()
      : null;
  const hangoutLink =
    typeof data?.hangoutLink === "string" && data.hangoutLink.trim()
      ? data.hangoutLink.trim()
      : null;
  const meetLink = getGoogleMeetLinkFromEventData(data);

  return {
    id,
    htmlLink,
    hangoutLink,
    meetLink,
    attendees: normalizeGoogleCalendarAttendees(data?.attendees),
    organizer: normalizeGoogleCalendarPerson(data?.organizer),
    creator: normalizeGoogleCalendarPerson(data?.creator),
  };
}

function getGoogleOauthCredentials() {
  const clientId = serverEnv.google.clientId();
  const clientSecret = serverEnv.google.clientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("missing_google_oauth_env");
  }

  return { clientId, clientSecret };
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  options?: RefreshGoogleAccessTokenOptions,
) {
  const { clientId, clientSecret } = getGoogleOauthCredentials();
  const { response, data } = await fetchGoogleJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    },
  );

  if (!response.ok) {
    if (String(data?.error || "").toLowerCase() === "invalid_grant") {
      throw createGoogleReconnectRequiredError({
        message: options?.reconnectMessage,
        detail: options?.reconnectDetail,
        userId: options?.reconnectUserId,
      });
    }

    throw new Error(
      String(
        data?.error_description || data?.error || "google_refresh_failed",
      ),
    );
  }

  const accessToken = String(data?.access_token || "");
  const expiresIn = Number(data?.expires_in || 0);

  if (!accessToken || !expiresIn) {
    throw new Error("google_refresh_missing_fields");
  }

  return {
    access_token: accessToken,
    expires_in: expiresIn,
    expiry_date: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function updateStoredGoogleToken(args: {
  admin: AppSupabaseClient;
  userId: string;
  accessToken: string;
  expiryDate: string;
}) {
  await args.admin
    .from("user_google_calendar_tokens")
    .update({
      access_token: args.accessToken,
      expiry_date: args.expiryDate,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId);
}

export async function getGoogleAccessTokenForUser(
  admin: AppSupabaseClient,
  userId: string,
) {
  const { data, error } = await admin
    .from("user_google_calendar_tokens")
    .select("user_id, access_token, refresh_token, expiry_date")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const row = (data ?? null) as GoogleCalendarTokenRow | null;
  if (!row?.refresh_token) return null;

  const expiry = row.expiry_date ? new Date(row.expiry_date).getTime() : 0;
  let accessToken = String(row.access_token || "");

  if (!accessToken || !expiry || expiry < Date.now() + 60_000) {
    const refreshed = await refreshGoogleAccessToken(String(row.refresh_token), {
      reconnectUserId: userId,
    });
    accessToken = refreshed.access_token;

    await updateStoredGoogleToken({
      admin,
      userId,
      accessToken: refreshed.access_token,
      expiryDate: refreshed.expiry_date,
    });
  }

  return accessToken;
}

export async function getGoogleAccessTokensForUsers(
  admin: AppSupabaseClient,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (!uniqueUserIds.length) {
    return {
      accessTokens: new Map<string, string | null>(),
      missingUserIds: [] as string[],
    };
  }

  const { data, error } = await admin
    .from("user_google_calendar_tokens")
    .select("user_id, access_token, refresh_token, expiry_date")
    .in("user_id", uniqueUserIds);

  if (error) throw error;

  const byUserId = new Map<string, GoogleCalendarTokenRow>();
  for (const row of data ?? []) {
    byUserId.set(String((row as GoogleCalendarTokenRow).user_id), {
      user_id: String((row as GoogleCalendarTokenRow).user_id),
      access_token: (row as GoogleCalendarTokenRow).access_token ?? null,
      refresh_token: (row as GoogleCalendarTokenRow).refresh_token ?? null,
      expiry_date: (row as GoogleCalendarTokenRow).expiry_date ?? null,
    });
  }

  const accessTokens = new Map<string, string | null>();
  const missingUserIds: string[] = [];

  for (const userId of uniqueUserIds) {
    const row = byUserId.get(userId);
    if (!row?.refresh_token) {
      accessTokens.set(userId, null);
      missingUserIds.push(userId);
      continue;
    }

    const expiry = row.expiry_date ? new Date(row.expiry_date).getTime() : 0;
    const existingAccessToken = String(row.access_token || "");

    if (existingAccessToken && expiry && expiry >= Date.now() + 60_000) {
      accessTokens.set(userId, existingAccessToken);
      continue;
    }

    const refreshed = await refreshGoogleAccessToken(String(row.refresh_token), {
      reconnectUserId: userId,
    });

    await updateStoredGoogleToken({
      admin,
      userId,
      accessToken: refreshed.access_token,
      expiryDate: refreshed.expiry_date,
    });

    accessTokens.set(userId, refreshed.access_token);
  }

  return { accessTokens, missingUserIds };
}

export async function createGoogleCalendarEvent(
  args: CreateGoogleCalendarEventArgs,
) {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("sendUpdates", args.sendUpdates ?? "none");
  url.searchParams.set("conferenceDataVersion", "1");

  const { response, data } = await fetchGoogleJson(url.toString(), {
    method: "POST",
    headers: googleAuthHeaders(args.accessToken),
    body: JSON.stringify({
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startISO, timeZone: args.timezone },
      end: { dateTime: args.endISO, timeZone: args.timezone },
      attendees: args.attendeeEmail ? [{ email: args.attendeeEmail }] : undefined,
      conferenceData: {
        createRequest: {
          requestId: `faigata-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });

  if (!response.ok) {
    const code = Number(data?.error?.code ?? 0);
    const message = String(
      data?.error?.message || "google_calendar_create_failed",
    );

    if (isGoogleInvalidCredentials(code, message)) {
      throw createGoogleReconnectRequiredError({
        message: args.reconnectMessage,
        detail: args.reconnectDetail,
        userId: args.reconnectUserId,
      });
    }

    throw new Error(message);
  }

  const googleEvent = snapshotGoogleCalendarEvent(
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null,
  );

  return {
    eventId: googleEvent.id,
    htmlLink: googleEvent.htmlLink || "",
    meetLink: googleEvent.meetLink || "",
    attendees: googleEvent.attendees,
    organizer: googleEvent.organizer,
    creator: googleEvent.creator,
    googleEvent,
  };
}

export async function fetchGoogleCalendarEvent(
  args: FetchGoogleCalendarEventArgs,
) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
      args.eventId,
    )}`,
  );
  url.searchParams.set("conferenceDataVersion", "1");

  const { response, data } = await fetchGoogleJson(url.toString(), {
    method: "GET",
    headers: googleAuthHeaders(args.accessToken),
  });

  if (!response.ok) {
    const code = Number(data?.error?.code ?? 0);
    const message = String(data?.error?.message || "google_event_fetch_failed");

    if (
      isGoogleReconnectStatus(response.status) ||
      isGoogleInvalidCredentials(code, message)
    ) {
      throw createGoogleReconnectRequiredError({
        message: args.reconnectMessage,
        detail: args.reconnectDetail,
        userId: args.reconnectUserId,
      });
    }

    throw new Error(message);
  }

  return snapshotGoogleCalendarEvent(
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null,
  );
}

export async function fetchGoogleFreeBusy(args: FetchGoogleFreeBusyArgs) {
  const { response, data } = await fetchGoogleJson(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: googleAuthHeaders(args.accessToken),
      body: JSON.stringify({
        timeMin: args.timeMinISO,
        timeMax: args.timeMaxISO,
        timeZone: args.timezone,
        items: [{ id: "primary" }],
      }),
    },
  );

  if (!response.ok) {
    const code = Number(data?.error?.code ?? 0);
    const message = String(data?.error?.message || "google_freebusy_failed");

    if (
      isGoogleReconnectStatus(response.status) ||
      isGoogleInvalidCredentials(code, message)
    ) {
      throw createGoogleReconnectRequiredError({
        message: args.reconnectMessage,
        detail: args.reconnectDetail,
        userId: args.reconnectUserId,
      });
    }

    throw new Error(message);
  }

  return (data?.calendars?.primary?.busy ?? []) as Array<{
    start: string;
    end: string;
  }>;
}
