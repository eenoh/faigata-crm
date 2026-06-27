import { NextResponse } from "next/server";
import {
  applyEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { getTimelineEventType } from "@/features/crm/components/lead-detail/timeline";
import {
  fetchGoogleCalendarEvent,
  getGoogleAccessTokenForUser,
  isGoogleReconnectRequiredError,
} from "@/features/crm/server/google-calendar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recomputeLeadScore } from "@/features/crm/scoring/recomputeLeadScore";
import type { Database } from "@/types/database";

const json = (data: any, status = 200) => NextResponse.json(data, { status });

const q = (req: Request) => new URL(req.url).searchParams;
const getTeamId = (req: Request) => q(req).get("teamId")?.trim() || "";
const getLeadId = (req: Request) => q(req).get("leadId")?.trim() || "";

type LeadMessageInsert =
  Database["public"]["Tables"]["lead_messages"]["Insert"];

// Wichtig: wir lösen uns hier bewusst von evtl. veralteten generated DB types,
// weil die Runtime-DB offenbar nur inbound/outbound akzeptiert.
type PersistedLeadMessageDirection = "inbound" | "outbound";
type IncomingLeadMessageDirection = PersistedLeadMessageDirection | "internal";

type LeadMessageChannel = LeadMessageInsert["channel"];

type LeadMessagePostBody = {
  direction?: unknown;
  channel?: unknown;
  body?: unknown;
  sent_at?: unknown;
  created_at?: unknown;
  sender_profile_id?: unknown;
  user_id?: unknown;
  event_type?: unknown;
  event_data?: unknown;
};

type LeadMessageRow = {
  id: string;
  team_id: string | null;
  lead_id: string | null;
  sender_profile_id: string | null;
  direction: PersistedLeadMessageDirection | null;
  channel: LeadMessageChannel;
  body: string | null;
  sent_at: string | null;
  created_at?: string | null;
  event_type?: string | null;
  event_data?: Record<string, unknown> | null;
  sender?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
};

function isIncomingDirection(
  value: unknown,
): value is IncomingLeadMessageDirection {
  return value === "inbound" || value === "outbound" || value === "internal";
}

function normalizeDirection(
  value: unknown,
  channel: LeadMessageChannel,
): PersistedLeadMessageDirection | null {
  if (!isIncomingDirection(value)) return null;

  // "internal" nie direkt in die DB schreiben.
  // Pipeline-/Systemevents werden als outbound persistiert.
  if (value === "internal") {
    return "outbound";
  }

  return value;
}

function normalizeChannel(value: unknown): LeadMessageChannel {
  if (value == null) return null;
  const channel = String(value).trim();
  return channel ? channel : null;
}

function normalizeBody(value: unknown): string | null {
  const body = String(value ?? "").trim();
  return body ? body : null;
}

function normalizeSentAt(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const iso = new Date(value).toISOString();
    return iso;
  }
  return new Date().toISOString();
}

function normalizeCreatedAt(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function normalizeSenderProfileId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUserId(
  value: unknown,
  senderProfileId: string | null,
): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return senderProfileId;
}

function normalizeEventType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeEventData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readEventString(
  eventData: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = eventData?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isPipelineRow(row: LeadMessageRow) {
  return (
    String(row.channel ?? "")
      .trim()
      .toLowerCase() === "pipeline"
  );
}

function hasStructuredEvent(row: LeadMessageRow) {
  return Boolean(String(row.event_type ?? "").trim());
}

function hasRecognizedTimelineEvent(row: LeadMessageRow) {
  return Boolean(
    getTimelineEventType({
      id: row.id,
      direction: row.direction ?? "outbound",
      channel: row.channel == null ? null : String(row.channel),
      body: row.body ?? "",
      sent_at: row.sent_at ?? row.created_at ?? new Date(0).toISOString(),
      created_at: row.created_at ?? null,
      sender_profile_id: row.sender_profile_id,
      event_type: row.event_type ?? null,
      event_data: row.event_data ?? null,
      sender: row.sender ?? null,
    }),
  );
}

function shouldResolveMessageBodyTranslation(row: LeadMessageRow) {
  if (!row.body?.trim()) return false;
  if (hasRecognizedTimelineEvent(row)) return false;
  if (hasStructuredEvent(row)) return true;
  if (isPipelineRow(row)) return true;
  return true;
}

async function applyDbBackedMessageBodyTranslations(params: {
  teamId: string;
  locale: string;
  rows: LeadMessageRow[];
}) {
  const { teamId, locale, rows } = params;

  const translatableRows = rows.filter(shouldResolveMessageBodyTranslation);
  if (!translatableRows.length) {
    return;
  }

  await applyEntityTranslations({
    admin: supabaseAdmin as any,
    teamId,
    entityTable: "lead_messages",
    rows: translatableRows,
    requestedLocale: locale,
    fields: [
      {
        fieldKey: "body",
        sourceText: (row) => row.body ?? "",
        assign: (row, value) => {
          row.body = value;
        },
      },
    ],
  });
}

async function hydrateGoogleBookedCallEventData(rows: LeadMessageRow[]) {
  const tokenPromises = new Map<string, Promise<string | null>>();

  await Promise.all(
    rows.map(async (row) => {
      if (!hasRecognizedTimelineEvent(row)) return;

      const timelineType = getTimelineEventType({
        id: row.id,
        direction: row.direction ?? "outbound",
        channel: row.channel == null ? null : String(row.channel),
        body: row.body ?? "",
        sent_at: row.sent_at ?? row.created_at ?? new Date(0).toISOString(),
        created_at: row.created_at ?? null,
        sender_profile_id: row.sender_profile_id,
        event_type: row.event_type ?? null,
        event_data: row.event_data ?? null,
        sender: row.sender ?? null,
      });

      if (timelineType !== "call_booked") return;

      const eventData = normalizeEventData(row.event_data);
      const eventId = readEventString(
        eventData,
        "google_calendar_event_id",
        "calendar_event_id",
        "event_id",
      );
      const hostUserId = readEventString(
        eventData,
        "host_user_id",
        "owner_user_id",
        "organizer_user_id",
        "user_id",
      );

      if (!eventId || !hostUserId) return;

      let tokenPromise = tokenPromises.get(hostUserId);
      if (!tokenPromise) {
        tokenPromise = getGoogleAccessTokenForUser(
          supabaseAdmin as any,
          hostUserId,
        );
        tokenPromises.set(hostUserId, tokenPromise);
      }

      try {
        const accessToken = await tokenPromise;
        if (!accessToken) return;

        const googleEvent = await fetchGoogleCalendarEvent({
          accessToken,
          eventId,
          reconnectMessage: "host_calendar_reconnect_required",
          reconnectUserId: hostUserId,
        });

        row.event_data = {
          ...eventData,
          google_calendar_event_id: googleEvent.id || eventId,
          google_calendar_event_link:
            googleEvent.htmlLink ?? eventData.google_calendar_event_link,
          calendar_event_link:
            googleEvent.htmlLink ?? eventData.calendar_event_link,
          google_meet_link:
            googleEvent.meetLink ?? eventData.google_meet_link,
          meeting_link: googleEvent.meetLink ?? eventData.meeting_link,
          google_event: googleEvent,
          google_attendees: googleEvent.attendees,
          google_organizer: googleEvent.organizer,
          google_creator: googleEvent.creator,
        };
      } catch (error) {
        if (!isGoogleReconnectRequiredError(error)) {
          console.warn("[lead-messages][GET] Google event hydrate failed", {
            eventId,
            hostUserId,
            error,
          });
        }
      }
    }),
  );
}

/* ---------- GET: list messages for one lead ---------- */
export async function GET(req: Request) {
  const teamId = getTeamId(req);
  const leadId = getLeadId(req);

  if (!teamId || !leadId) {
    return json({ error: "Missing teamId or leadId" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("lead_messages")
    .select(
      `
      id,
      team_id,
      lead_id,
      sender_profile_id,
      direction,
      channel,
      body,
      sent_at,
      created_at,
      event_type,
      event_data,
      sender:profiles!lead_messages_sender_profile_id_fkey (
        id,
        first_name,
        last_name,
        avatar_url
      )
    `,
    )
    .eq("team_id", teamId)
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("[lead-messages][GET] Failed to fetch lead_messages", error);
    return json({ error: "Failed to fetch messages" }, 500);
  }

  const rows = (Array.isArray(data) ? data : []) as LeadMessageRow[];

  await hydrateGoogleBookedCallEventData(rows);

  try {
    const locale = await resolveRequestLocale({ request: req });
    await applyDbBackedMessageBodyTranslations({
      teamId,
      locale,
      rows,
    });
  } catch (translationError) {
    console.warn(
      "[lead-messages][GET] DB-backed message translation failed, using source values",
      translationError,
    );
  }

  return json(rows);
}

/* ---------- POST: add message ---------- */
export async function POST(req: Request) {
  const teamId = getTeamId(req);
  const leadId = getLeadId(req);

  if (!teamId || !leadId) {
    return json({ error: "Missing teamId or leadId" }, 400);
  }

  const body = (await req
    .json()
    .catch(() => null)) as LeadMessagePostBody | null;

  if (!body) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const normalizedChannel = normalizeChannel(body.channel);
  const normalizedDirection = normalizeDirection(
    body.direction,
    normalizedChannel,
  );

  if (!normalizedDirection) {
    return json({ error: "direction must be 'inbound' or 'outbound'" }, 400);
  }

  const normalizedBody = normalizeBody(body.body);
  if (!normalizedBody) {
    return json({ error: "Message body is required" }, 400);
  }

  const normalizedSentAt = normalizeSentAt(body.sent_at);
  const normalizedSenderProfileId = normalizeSenderProfileId(
    body.sender_profile_id,
  );

  const payload: LeadMessageInsert = {
    team_id: teamId,
    lead_id: leadId,
    direction: normalizedDirection as LeadMessageInsert["direction"],
    channel: normalizedChannel,
    body: normalizedBody,
    sent_at: normalizedSentAt,
    created_at: normalizeCreatedAt(body.created_at, normalizedSentAt) as any,
    sender_profile_id: normalizedSenderProfileId,
    user_id: normalizeUserId(body.user_id, normalizedSenderProfileId) as any,
    event_type: normalizeEventType(body.event_type),
    event_data: normalizeEventData(body.event_data),
  };

  const { data, error } = await supabaseAdmin
    .from("lead_messages")
    .insert(payload)
    .select(
      `
      id,
      team_id,
      lead_id,
      sender_profile_id,
      direction,
      channel,
      body,
      sent_at,
      created_at,
      event_type,
      event_data
    `,
    )
    .single();

  if (error) {
    console.error("[lead-messages][POST] Failed to create lead_message", error);
    return json(
      {
        error: "Failed to create message",
        detail: {
          code: error.code ?? null,
          message: error.message ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        },
      },
      500,
    );
  }

  try {
    const locale = await resolveRequestLocale({ request: req });

    await syncEntityTranslationSources({
      admin: supabaseAdmin as any,
      teamId,
      entityTable: "lead_messages",
      rows: [data as LeadMessageRow],
      fields: [{ fieldKey: "body", sourceText: (row) => row.body ?? "" }],
      sourceLocale: locale,
    });
  } catch (translationError) {
    console.warn(
      "[lead-messages][POST] translation source sync failed",
      translationError,
    );
  }

  try {
    await recomputeLeadScore(teamId, leadId);
  } catch (e) {
    console.error(
      "[lead-messages][POST] Failed to recompute score after message",
      e,
    );
  }

  return json(data);
}
