import { DateTime } from "luxon";
import type { LeadMessage } from "@/features/crm/components/lead-detail/types";

export function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function fmtMessageTimestamp(
  iso: string,
  zone: string,
  locale?: string | null,
) {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  if (!dt.isValid) return iso;
  return dt
    .setLocale(locale || "en")
    .toLocaleString(DateTime.DATETIME_SHORT);
}

export function isPipelineEvent(message: LeadMessage) {
  return (message.channel ?? "").toLowerCase() === "pipeline";
}

export function getTimelineEventType(message: LeadMessage): string | null {
  const explicitType = String(message.event_type ?? "")
    .trim()
    .toLowerCase();
  if (explicitType) {
    if (
      [
        "call_attendance",
        "call_attendance_update",
        "call_status",
        "call_status_update",
        "call_status_updated",
        "call_attended",
        "call_no_show",
        "call_cancelled",
        "call_canceled",
        "call_rescheduled",
      ].includes(explicitType)
    ) {
      return "call_attendance_updated";
    }

    return explicitType;
  }

  if (!isPipelineEvent(message)) return null;

  const body = String(message.body ?? "").trim();
  const bodyUpper = body.toUpperCase();
  const bodyLower = body.toLowerCase();

  if (
    bodyLower.startsWith("lead_created|") ||
    bodyLower.startsWith("lead created|") ||
    bodyLower.includes("new lead")
  ) {
    return "lead_created";
  }

  if (bodyUpper.startsWith("LEAD_REJECTED|")) {
    return "lead_rejected";
  }

  if (
    bodyUpper.startsWith("CALL_ATTENDANCE|") ||
    bodyUpper.startsWith("CALL_STATUS|") ||
    bodyUpper.startsWith("CALL_STATUS_UPDATED|") ||
    bodyLower.startsWith("call status updated:")
  ) {
    return "call_attendance_updated";
  }

  if (bodyUpper.startsWith("CALL_OFFER_MADE|")) {
    return "call_offer_updated";
  }

  if (bodyUpper.startsWith("CALL_CLOSED_ON_CALL|")) {
    return "call_closed_updated";
  }

  if (bodyUpper.startsWith("CALL_OUTCOME|")) {
    return "call_outcome_legacy";
  }

  if (
    bodyLower.includes("booked a call") ||
    bodyLower.includes("call booked for") ||
    bodyLower.includes("booked_call|")
  ) {
    return "call_booked";
  }

  if (bodyUpper.startsWith("STAGE_CHANGED|") || parseStageChanged(body)) {
    return "stage_changed";
  }

  return null;
}

export function isKnownTimelineEvent(message: LeadMessage) {
  return Boolean(getTimelineEventType(message));
}

export function isLeadCreatedTimelineMessage(message: LeadMessage) {
  return getTimelineEventType(message) === "lead_created";
}

export function isLeadRejectedEvent(message: LeadMessage) {
  return getTimelineEventType(message) === "lead_rejected";
}

export function isCallAttendanceEvent(message: LeadMessage) {
  return getTimelineEventType(message) === "call_attendance_updated";
}

export function isCallOfferMadeEvent(message: LeadMessage) {
  return getTimelineEventType(message) === "call_offer_updated";
}

export function isCallClosedEvent(message: LeadMessage) {
  return getTimelineEventType(message) === "call_closed_updated";
}

export function isLegacyCallOutcomeEvent(message: LeadMessage) {
  return getTimelineEventType(message) === "call_outcome_legacy";
}

export function isBookedCallMessage(message: LeadMessage) {
  return getTimelineEventType(message) === "call_booked";
}

export function normalizeOutcomeStatus(value: string) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

  const allowed = new Set([
    "unknown",
    "attended",
    "no_show",
    "cancelled",
    "rescheduled",
  ]);

  if (
    normalized === "showed" ||
    normalized === "showed_up" ||
    normalized === "show_up"
  ) {
    return "attended";
  }
  if (normalized === "no_show" || normalized === "noshow") return "no_show";
  if (normalized === "canceled") return "cancelled";
  if (normalized === "reschedule") return "rescheduled";

  return allowed.has(normalized) ? normalized : "unknown";
}

export function statusLabel(value: string) {
  const normalized = normalizeOutcomeStatus(value);
  if (normalized === "no_show") return "No-show";
  if (normalized === "unknown") return "Unknown";
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function statusLabelKey(value: string) {
  return `crm.leadTimeline.status.${normalizeOutcomeStatus(value)}`;
}

export function iconForAttendance(nextStatus: string) {
  const normalized = normalizeOutcomeStatus(nextStatus);
  if (normalized === "attended") return "/icons/call-attended.svg";
  if (normalized === "no_show") return "/icons/call-no-show.svg";
  if (normalized === "cancelled") return "/icons/call-cancelled.svg";
  if (normalized === "rescheduled") return "/icons/call-rescheduled.svg";
  return "/icons/booked-call.svg";
}

export function iconForLegacyOutcome(body: string) {
  const parts = String(body || "").split("|");
  const next = parts[3] ?? "unknown";
  const offer = String(parts[4] ?? "0").trim() === "1";
  const closed = String(parts[5] ?? "0").trim() === "1";

  if (closed) return "/icons/call-closed.svg";
  if (offer) return "/icons/call-offer-made.svg";
  return iconForAttendance(next);
}

function readTimelineEventString(
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

function isOutcomeStatusToken(value: string) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
  const normalized = normalizeOutcomeStatus(value);
  return normalized !== "unknown" || raw === "unknown";
}

function cleanStatusToken(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/[.。]+$/g, "")
    .trim();
}

function statusFromEventType(eventType: string | null | undefined) {
  const normalized = String(eventType ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "call_attended") return "attended";
  if (normalized === "call_no_show") return "no_show";
  if (normalized === "call_cancelled" || normalized === "call_canceled") {
    return "cancelled";
  }
  if (normalized === "call_rescheduled") return "rescheduled";

  return null;
}

function parseAttendanceBodyStatuses(body: string) {
  const text = String(body ?? "").trim();
  if (!text) return null;

  const pipeParts = text.split("|").map((part) => cleanStatusToken(part));
  if (pipeParts.length > 1) {
    const statusParts = pipeParts
      .slice(1)
      .filter((part) => isOutcomeStatusToken(part));

    if (statusParts.length >= 2) {
      return {
        previousStatus: statusParts[0],
        nextStatus: statusParts[1],
      };
    }
  }

  const displayMatch = text.match(
    /call status updated:\s*(.+?)\s*(?:→|->|=>|>| to )\s*(.+)$/i,
  );
  if (displayMatch) {
    return {
      previousStatus: cleanStatusToken(displayMatch[1] ?? ""),
      nextStatus: cleanStatusToken(displayMatch[2] ?? ""),
    };
  }

  return null;
}

export function getCallAttendanceChange(message: LeadMessage): {
  previousStatus: string;
  nextStatus: string;
} | null {
  if (getTimelineEventType(message) !== "call_attendance_updated") return null;

  const parsedBody = parseAttendanceBodyStatuses(message.body ?? "");
  const previous =
    readTimelineEventString(
      message.event_data,
      "previous_status",
      "previousStatus",
      "previous_attendance_status",
      "previousAttendanceStatus",
      "old_status",
      "oldStatus",
      "from_status",
      "fromStatus",
    ) ??
    parsedBody?.previousStatus ??
    "unknown";

  const next =
    readTimelineEventString(
      message.event_data,
      "next_status",
      "nextStatus",
      "attended_status",
      "attendance_status",
      "status",
      "new_status",
      "newStatus",
      "to_status",
      "toStatus",
    ) ??
    parsedBody?.nextStatus ??
    statusFromEventType(message.event_type) ??
    "unknown";

  return {
    previousStatus: normalizeOutcomeStatus(previous),
    nextStatus: normalizeOutcomeStatus(next),
  };
}

export function parseLeadRejected(body: string) {
  const parts = String(body || "").split("|");
  const count = Number(parts[3] ?? "0");

  return {
    oldSetterId: String(parts[1] ?? "").trim(),
    newSetterId: String(parts[2] ?? "").trim(),
    count: Number.isFinite(count) ? count : 0,
  };
}

export function parseOfferMade(body: string) {
  const parts = String(body || "").split("|");
  return {
    on: String(parts[2] ?? "0").trim() === "1",
    productId: String(parts[3] ?? "").trim(),
    productTitleInline: String(parts[4] ?? "").trim(),
  };
}

export function parseClosedOnCall(body: string) {
  const parts = String(body || "").split("|");
  return {
    on: String(parts[2] ?? "0").trim() === "1",
    productId: String(parts[3] ?? "").trim(),
  };
}

export function parseStageChanged(body: string) {
  const text = String(body ?? "").trim();
  if (!text) return null;

  const canonical = text.match(/^STAGE_CHANGED\|([^|]+)\|(.+)$/i);
  if (canonical) {
    return {
      fromStage: canonical[1].trim(),
      toStage: canonical[2].trim(),
    };
  }

  const legacyPatterns = [
    /^Stage changed from ["“”„«»](.+?)["“”„«»] to ["“”„«»](.+?)["“”„«»]\.?$/i,
    /^Phase wurde von ["“”„«»](.+?)["“”„«»] zu ["“”„«»](.+?)["“”„«»] geändert\.?$/i,
    /^La etapa cambió de ["“”„«»](.+?)["“”„«»] a ["“”„«»](.+?)["“”„«»]\.?$/i,
    /^Étape modifiée de ["“”„«»](.+?)["“”„«»] à ["“”„«»](.+?)["“”„«»]\.?$/i,
  ];

  for (const pattern of legacyPatterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        fromStage: match[1].trim(),
        toStage: match[2].trim(),
      };
    }
  }

  return null;
}

type BookedCallParse = {
  kind: "canonical" | "iso" | "wall";
  start: DateTime;
  end: DateTime;
  sourceTz: string | null;
  meetLink: string | null;
};

function extractMeetLink(body: string): string | null {
  const match = String(body || "").match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].trim() : null;
}

function extractBookedCallRange(body: string): {
  kind: "instant" | "wall";
  startRaw: string;
  endRaw: string;
  tz: string | null;
  source: "canonical" | "iso" | "wall";
} | null {
  const canonical = body.match(/BOOKED_CALL\|([^|]+)\|([^|]+)(?:\|([^|]+))?/i);
  if (canonical) {
    return {
      kind: "instant",
      startRaw: canonical[1].trim(),
      endRaw: canonical[2].trim(),
      tz: canonical[3] ? canonical[3].trim() : null,
      source: "canonical",
    };
  }

  const iso = body.match(
    /(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))\s*(?:->|-|–|—)\s*(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))(?:\s*\(([^)]+)\))?/i,
  );
  if (iso) {
    return {
      kind: "instant",
      startRaw: iso[1],
      endRaw: iso[2],
      tz: iso[3] ? String(iso[3]).trim() : null,
      source: "iso",
    };
  }

  const wall = body.match(
    /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(?:->|-|–|—)\s*(\d{2}:\d{2})(?:\s*\(([^)]+)\))?/i,
  );
  if (!wall) return null;

  return {
    kind: "wall",
    startRaw: `${wall[1]} ${wall[2]}`,
    endRaw: `${wall[1]} ${wall[3]}`,
    tz: wall[4] ? String(wall[4]).trim() : null,
    source: "wall",
  };
}

function parseBookedCall(body: string): BookedCallParse | null {
  const parsed = extractBookedCallRange(body);
  if (!parsed) return null;

  const meetLink = extractMeetLink(body);
  const sourceZone = parsed.tz || "UTC";

  if (parsed.kind === "instant") {
    const hasOffsetStart = /[zZ]|[+-]\d{2}:\d{2}$/.test(parsed.startRaw);
    const hasOffsetEnd = /[zZ]|[+-]\d{2}:\d{2}$/.test(parsed.endRaw);

    const start =
      parsed.tz && !hasOffsetStart
        ? DateTime.fromISO(parsed.startRaw, { zone: sourceZone })
        : DateTime.fromISO(parsed.startRaw, { setZone: true });

    const end =
      parsed.tz && !hasOffsetEnd
        ? DateTime.fromISO(parsed.endRaw, { zone: sourceZone })
        : DateTime.fromISO(parsed.endRaw, { setZone: true });

    if (!start.isValid || !end.isValid) return null;

    return {
      kind: parsed.source === "canonical" ? "canonical" : "iso",
      start,
      end,
      sourceTz: parsed.tz,
      meetLink,
    };
  }

  const start = DateTime.fromFormat(parsed.startRaw, "yyyy-MM-dd HH:mm", {
    zone: sourceZone,
  });
  const end = DateTime.fromFormat(parsed.endRaw, "yyyy-MM-dd HH:mm", {
    zone: sourceZone,
  });

  if (!start.isValid || !end.isValid) return null;

  return {
    kind: "wall",
    start,
    end,
    sourceTz: parsed.tz,
    meetLink,
  };
}

type TimelineCopyDescriptor =
  | {
      key: "crm.leadTimeline.leadCreated";
      values: { leadLabel: string };
    }
  | {
      key: "crm.leadTimeline.leadRejected";
      values: {
        count: number;
        previousRejectionCount: number;
        oldSetterName: string;
        newSetterName: string;
      };
    }
  | {
      key: "crm.leadTimeline.callAttendanceUpdated";
      values: {
        previousStatus: string;
        nextStatus: string;
        previousStatusLabelKey: string;
        nextStatusLabelKey: string;
      };
    }
  | {
      key: "crm.leadTimeline.stageChanged";
      values: {
        fromStage: string;
        toStage: string;
      };
    }
  | {
      key: "crm.leadTimeline.offerRemoved";
      values: {};
    }
  | {
      key: "crm.leadTimeline.offerMade";
      values: {
        productTitle: string;
      };
    }
  | {
      key: "crm.leadTimeline.closedOnCallRemoved";
      values: {};
    }
  | {
      key: "crm.leadTimeline.closedOnCall";
      values: {
        productTitle: string;
      };
    }
  | {
      key: "crm.leadTimeline.callOutcomeLegacy";
      values: {
        previousStatus: string;
        nextStatus: string;
        previousStatusLabelKey: string;
        nextStatusLabelKey: string;
        offerMade: boolean;
        closedOnCall: boolean;
      };
    }
  | {
      key: "crm.leadTimeline.callBooked";
      values: {
        rangeLabel: string;
        zoneLabel: string;
        meetLink: string | null;
      };
    }
  | {
      key: "crm.leadTimeline.fallbackBody";
      values: {
        body: string;
      };
    };

export function getLeadCreatedDescriptor(
  message: LeadMessage,
  leadLabel: string,
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "lead_created") return null;

  const eventLeadLabel =
    typeof message.event_data?.lead_label === "string"
      ? message.event_data.lead_label.trim()
      : "";

  const parts = String(message.body || "").split("|");
  const legacyLeadLabel = (parts[1] ?? "").trim();

  return {
    key: "crm.leadTimeline.leadCreated",
    values: {
      leadLabel: eventLeadLabel || legacyLeadLabel || leadLabel,
    },
  };
}

export function getLeadRejectedDescriptor(
  message: LeadMessage,
  oldSetterName: string,
  newSetterName = "",
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "lead_rejected") return null;

  const eventCount =
    typeof message.event_data?.rejection_count === "number"
      ? message.event_data.rejection_count
      : typeof message.event_data?.count === "number"
        ? message.event_data.count
        : null;
  const eventPreviousCount =
    typeof message.event_data?.previous_rejection_count === "number"
      ? message.event_data.previous_rejection_count
      : null;

  const legacy = parseLeadRejected(message.body ?? "");
  const count =
    eventCount != null && Number.isFinite(eventCount)
      ? eventCount
      : legacy.count;
  const previousRejectionCount =
    eventPreviousCount != null && Number.isFinite(eventPreviousCount)
      ? Math.max(eventPreviousCount, 0)
      : Math.max(count - 1, 0);

  return {
    key: "crm.leadTimeline.leadRejected",
    values: {
      count,
      previousRejectionCount,
      oldSetterName: String(oldSetterName ?? "").trim(),
      newSetterName: String(newSetterName ?? "").trim(),
    },
  };
}

export function getAttendanceDescriptor(
  message: LeadMessage,
): TimelineCopyDescriptor | null {
  const change = getCallAttendanceChange(message);
  if (!change) return null;

  return {
    key: "crm.leadTimeline.callAttendanceUpdated",
    values: {
      previousStatus: change.previousStatus,
      nextStatus: change.nextStatus,
      previousStatusLabelKey: statusLabelKey(change.previousStatus),
      nextStatusLabelKey: statusLabelKey(change.nextStatus),
    },
  };
}

export function getStageChangedDescriptor(
  message: LeadMessage,
  stageLabelsById?: Record<string, string>,
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "stage_changed") return null;

  const legacy = parseStageChanged(message.body ?? "");
  const fromStageId =
    typeof message.event_data?.from_stage_id === "string"
      ? message.event_data.from_stage_id.trim()
      : "";
  const toStageId =
    typeof message.event_data?.to_stage_id === "string"
      ? message.event_data.to_stage_id.trim()
      : "";

  const fromStage =
    (fromStageId ? stageLabelsById?.[fromStageId] ?? "" : "") ||
    (typeof message.event_data?.from_stage === "string"
      ? message.event_data.from_stage.trim()
      : "") ||
    legacy?.fromStage ||
    "";

  const toStage =
    (toStageId ? stageLabelsById?.[toStageId] ?? "" : "") ||
    (typeof message.event_data?.to_stage === "string"
      ? message.event_data.to_stage.trim()
      : "") ||
    legacy?.toStage ||
    "";

  if (!fromStage || !toStage) {
    return {
      key: "crm.leadTimeline.fallbackBody",
      values: {
        body: message.body ?? "",
      },
    };
  }

  return {
    key: "crm.leadTimeline.stageChanged",
    values: {
      fromStage,
      toStage,
    },
  };
}

export function getOfferMadeDescriptor(
  message: LeadMessage,
  productTitle: string | null,
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "call_offer_updated") return null;

  const eventOn =
    typeof message.event_data?.enabled === "boolean"
      ? message.event_data.enabled
      : typeof message.event_data?.on === "boolean"
        ? message.event_data.on
        : null;

  const eventProductTitle =
    typeof message.event_data?.product_title === "string"
      ? message.event_data.product_title.trim()
      : "";

  const legacy = parseOfferMade(message.body ?? "");
  const on = eventOn ?? legacy.on;
  const title =
    eventProductTitle || legacy.productTitleInline || productTitle || "Product";

  if (!on) {
    return {
      key: "crm.leadTimeline.offerRemoved",
      values: {},
    };
  }

  return {
    key: "crm.leadTimeline.offerMade",
    values: {
      productTitle: title,
    },
  };
}

export function getClosedDescriptor(
  message: LeadMessage,
  productTitle: string | null,
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "call_closed_updated") return null;

  const eventOn =
    typeof message.event_data?.enabled === "boolean"
      ? message.event_data.enabled
      : typeof message.event_data?.on === "boolean"
        ? message.event_data.on
        : null;

  const eventProductTitle =
    typeof message.event_data?.product_title === "string"
      ? message.event_data.product_title.trim()
      : "";

  const legacy = parseClosedOnCall(message.body ?? "");
  const on = eventOn ?? legacy.on;
  const title = eventProductTitle || productTitle || "Product";

  if (!on) {
    return {
      key: "crm.leadTimeline.closedOnCallRemoved",
      values: {},
    };
  }

  return {
    key: "crm.leadTimeline.closedOnCall",
    values: {
      productTitle: title,
    },
  };
}

export function getLegacyOutcomeDescriptor(
  message: LeadMessage,
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "call_outcome_legacy") return null;

  const parts = String(message.body || "").split("|");
  const previous = normalizeOutcomeStatus(parts[2] ?? "unknown");
  const next = normalizeOutcomeStatus(parts[3] ?? "unknown");
  const offerMade = String(parts[4] ?? "0").trim() === "1";
  const closedOnCall = String(parts[5] ?? "0").trim() === "1";

  return {
    key: "crm.leadTimeline.callOutcomeLegacy",
    values: {
      previousStatus: previous,
      nextStatus: next,
      previousStatusLabelKey: statusLabelKey(previous),
      nextStatusLabelKey: statusLabelKey(next),
      offerMade,
      closedOnCall,
    },
  };
}

export function formatBookedCallRange(
  body: string,
  viewerTz: string,
  locale?: string | null,
) {
  const parsed = parseBookedCall(body);
  if (!parsed) return null;

  const targetZone = viewerTz || "UTC";
  const startLocal = parsed.start.setZone(targetZone).setLocale(locale || "en");
  const endLocal = parsed.end.setZone(targetZone).setLocale(locale || "en");

  const sameDay = startLocal.hasSame(endLocal, "day");

  const dateLabel = startLocal.toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const startTime = startLocal.toLocaleString(DateTime.TIME_SIMPLE);
  const endTime = endLocal.toLocaleString(DateTime.TIME_SIMPLE);

  const rangeLabel = sameDay
    ? `${dateLabel} · ${startTime}–${endTime}`
    : `${dateLabel} ${startTime} → ${endLocal.toLocaleString({
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })} ${endTime}`;

  const zoneLabel = targetZone && targetZone !== "UTC" ? targetZone : "UTC";

  return {
    rangeLabel,
    zoneLabel,
    meetLink: parsed.meetLink,
  };
}

export function getBookedCallDescriptor(
  message: LeadMessage,
  viewerTz: string,
  viewerLocale?: string | null,
): TimelineCopyDescriptor | null {
  if (getTimelineEventType(message) !== "call_booked") return null;

  const formatted = formatBookedCallRange(
    message.body ?? "",
    viewerTz,
    viewerLocale,
  );
  if (!formatted) {
    return {
      key: "crm.leadTimeline.fallbackBody",
      values: {
        body: message.body ?? "",
      },
    };
  }

  return {
    key: "crm.leadTimeline.callBooked",
    values: {
      rangeLabel: formatted.rangeLabel,
      zoneLabel: formatted.zoneLabel,
      meetLink: formatted.meetLink,
    },
  };
}

export function getTimelineMessageDescriptor(params: {
  message: LeadMessage;
  leadLabel: string;
  oldSetterNameForRejectedLead?: string | null;
  newSetterNameForRejectedLead?: string | null;
  productTitle?: string | null;
  viewerTz: string;
  viewerLocale?: string | null;
  stageLabelsById?: Record<string, string>;
}): TimelineCopyDescriptor | null {
  const {
    message,
    leadLabel,
    oldSetterNameForRejectedLead,
    newSetterNameForRejectedLead,
    productTitle,
    viewerTz,
    viewerLocale,
    stageLabelsById,
  } = params;

  return (
    getLeadCreatedDescriptor(message, leadLabel) ??
    getLeadRejectedDescriptor(
      message,
      oldSetterNameForRejectedLead ?? "",
      newSetterNameForRejectedLead ?? "",
    ) ??
    getAttendanceDescriptor(message) ??
    getStageChangedDescriptor(message, stageLabelsById) ??
    getOfferMadeDescriptor(message, productTitle ?? null) ??
    getClosedDescriptor(message, productTitle ?? null) ??
    getLegacyOutcomeDescriptor(message) ??
    getBookedCallDescriptor(message, viewerTz, viewerLocale)
  );
}

/**
 * Backward-compatible string formatters.
 * These remain available for legacy call sites, but the preferred contract is:
 * getTimelineMessageDescriptor(...) -> next-intl translation at render time.
 */
export function formatLeadCreatedBody(body: string, leadLabel: string) {
  const parts = String(body || "").split("|");
  const labelFromBody = (parts[1] ?? "").trim();
  return `New lead added: ${labelFromBody || leadLabel}`;
}

export function formatLeadRejectedBody(
  body: string,
  oldSetterName?: string | null,
  newSetterName?: string | null,
) {
  const { count } = parseLeadRejected(body);
  const previousRejectionCount = Math.max(count - 1, 0);
  const oldName = String(oldSetterName ?? "").trim() || "A setter";
  const newName = String(newSetterName ?? "").trim() || "another setter";
  return `Lead rejected by ${oldName} · Previously rejected ${previousRejectionCount} times · Reassigned to ${newName}`;
}

export function formatAttendanceBody(body: string) {
  const parts = String(body || "").split("|");
  const previous = normalizeOutcomeStatus(parts[2] ?? "unknown");
  const next = normalizeOutcomeStatus(parts[3] ?? "unknown");
  return `Call status updated: ${statusLabel(previous)} → ${statusLabel(next)}`;
}

export function formatOfferMadeBody(body: string, productTitle: string | null) {
  const { on, productTitleInline } = parseOfferMade(body);
  if (!on) return "Offer removed";
  return `Offer made: ${productTitleInline || productTitle || "Product"}`;
}

export function formatClosedBody(body: string, productTitle: string | null) {
  const { on } = parseClosedOnCall(body);
  if (!on) return "Closed on call removed";
  return productTitle?.trim()
    ? `Closed on call: ${productTitle}`
    : "Closed on call";
}

export function formatLegacyOutcomeBody(body: string) {
  const parts = String(body || "").split("|");
  const previous = normalizeOutcomeStatus(parts[2] ?? "unknown");
  const next = normalizeOutcomeStatus(parts[3] ?? "unknown");
  const offer = String(parts[4] ?? "0").trim() === "1";
  const closed = String(parts[5] ?? "0").trim() === "1";

  const base = `Call status updated: ${statusLabel(previous)} → ${statusLabel(next)}`;
  const extras: string[] = [];
  if (offer) extras.push("Offer made");
  if (closed) extras.push("Closed on call");
  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}

export function formatBookedCallBody(
  body: string,
  viewerTz: string,
  locale?: string | null,
) {
  const parsed = parseBookedCall(body);
  if (!parsed) return body;

  const targetZone = viewerTz || "UTC";
  const startLocal = parsed.start.setZone(targetZone).setLocale(locale || "en");
  const endLocal = parsed.end.setZone(targetZone).setLocale(locale || "en");

  const sameDay = startLocal.hasSame(endLocal, "day");

  const dateLabel = startLocal.toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const startTime = startLocal.toLocaleString(DateTime.TIME_SIMPLE);
  const endTime = endLocal.toLocaleString(DateTime.TIME_SIMPLE);

  const rangeLabel = sameDay
    ? `${dateLabel} · ${startTime}–${endTime}`
    : `${dateLabel} ${startTime} → ${endLocal.toLocaleString({
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })} ${endTime}`;

  const zoneSuffix =
    targetZone && targetZone !== "UTC" ? ` (${targetZone})` : "";

  if (parsed.meetLink) {
    return `Booked call · ${rangeLabel}${zoneSuffix}\nJoin meeting: ${parsed.meetLink}`;
  }

  return `Booked call · ${rangeLabel}${zoneSuffix}`;
}

export function getRejectLeadErrorMessage(errorCode: unknown) {
  const code = String(errorCode ?? "").trim();

  switch (code) {
    case "no_other_setter_available":
      return "This lead cannot be rejected right now because there is not another setter available to reassign it to.";
    case "not_current_setter":
      return "Only the current setter can reject this lead.";
    case "not_a_setter":
      return "You do not have permission to reject this lead.";
    case "lead_not_found":
      return "This lead could not be found.";
    case "team_mismatch":
      return "This lead does not belong to your current workspace.";
    case "missing_auth_token":
    case "unauthorized":
      return "Your session expired. Please refresh the page and try again.";
    case "failed_to_load_setters":
      return "We could not load the available setters right now. Please try again in a moment.";
    case "lead_update_failed":
      return "We could not update the lead right now. Please try again.";
    case "profile_not_found":
    case "profile_load_failed":
      return "We could not verify your profile right now. Please try again.";
    case "invalid_lead_id":
    case "missing_lead_id":
      return "This lead link is invalid.";
    case "invalid_team_id":
    case "missing_team_id":
      return "Your workspace information is missing. Please reload the page.";
    default:
      return "Failed to reject lead. Please try again.";
  }
}

export function isStripeProdOrPriceId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id) || /^price_[a-zA-Z0-9]+$/.test(id);
}
