"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  fmtMessageTimestamp,
  formatBookedCallBody,
  getCallAttendanceChange,
  getTimelineEventType,
  getTimelineMessageDescriptor,
  iconForAttendance,
  iconForLegacyOutcome,
  isBookedCallMessage,
  isCallAttendanceEvent,
  isCallClosedEvent,
  isCallOfferMadeEvent,
  isKnownTimelineEvent,
  isLeadCreatedTimelineMessage,
  isLeadRejectedEvent,
  isLegacyCallOutcomeEvent,
  parseClosedOnCall,
  parseLeadRejected,
  parseOfferMade,
} from "@/features/crm/components/lead-detail/timeline";
import type { LeadMessage } from "@/features/crm/components/lead-detail/types";

type UserProfileLike = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
};

type TimelineTranslator = {
  title: string;
  subtitle: string;
  loading: string;
  empty: string;
  roleLead: string;
  roleTeam: string;
  joinDetails: string;
  meetingLink: string;
  openGoogleMeet: string;
  openCalendarEvent: string;
  statesLeadNotFound?: string;
  actionsOpenLeadDetail?: string;
  alt: {
    newLead: string;
    leadRejected: string;
    callStatus: string;
    offerMade: string;
    closedOnCall: string;
    callOutcomeUpdate: string;
    callBooked: string;
    bookingLinkSent: string;
    pipelineActivity: string;
  };
  channels: {
    dm: string;
    sms: string;
    other: string;
    pipeline: string;
  };
};

type DescriptorInput =
  | ReturnType<typeof getTimelineMessageDescriptor>
  | { key: string; values: Record<string, string> }
  | null;

type EventRecord = Record<string, unknown>;

type MeetingParticipant = {
  label: string;
  email: string | null;
  key: string;
};

type LeadActivityTimelineProps = {
  isDark: boolean;

  title: string;
  subtitle: string;

  loading: boolean;
  leadMissing?: boolean;
  loadingText: string;
  emptyText: string;
  leadMissingText?: string;

  messages: LeadMessage[];
  leadLabel: string;
  leadCreatedAt?: string | null;
  leadId?: string | null;
  viewerTz: string;
  viewerLocale?: string | null;

  currentUser?: UserProfileLike | null;
  creatorProfile?: UserProfileLike | null;
  creatorAvatarUrl?: string | null;
  userAvatarUrl?: string | null;
  leadInitials: string;

  profileLabels?: Record<string, string>;
  productLabels?: Record<string, string>;
  stageLabelsById?: Record<string, string>;

  bookingNameBySlug?: Map<string, string>;

  commonRoleMember: string;
  canViewCalendarPage?: boolean;

  t: TimelineTranslator;

  canShowHeaderAction?: boolean;
  headerActionLabel?: string;
  headerActionIcon?: string;
  onHeaderAction?: () => void;
  headerActionClassName?: string;

  translateDescriptor: (descriptor: DescriptorInput) => string | null;
  schedulePageFallbackLabel: string;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function initialsFromName(first?: string | null, last?: string | null) {
  const f = first?.trim()?.charAt(0).toUpperCase();
  const l = last?.trim()?.charAt(0).toUpperCase();
  return f && l ? `${f}${l}` : f || l || "U";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function isPipelineEvent(m: LeadMessage) {
  return String(m.channel ?? "").toLowerCase() === "pipeline";
}

function isBookingLinkTimelineEvent(
  m: LeadMessage,
  eventType = getTimelineEventType(m),
) {
  const bodyLower = (m.body ?? "").toLowerCase();

  return (
    eventType === "booking_invite_created" ||
    eventType === "booking_link_created" ||
    bodyLower.includes("sent booking link") ||
    bodyLower.includes("sent boking link") ||
    bodyLower.includes("booking link") ||
    bodyLower.includes("boking link") ||
    bodyLower.includes("booking_invite_created|") ||
    bodyLower.includes("/b/") ||
    bodyLower.includes("schedule page")
  );
}

function isBookedCallTimelineEvent(
  m: LeadMessage,
  eventType = getTimelineEventType(m),
) {
  const bodyLower = (m.body ?? "").toLowerCase();

  return (
    eventType === "call_booked" ||
    bodyLower.includes("booked_call|") ||
    bodyLower.includes("booked a call") ||
    bodyLower.includes("call booked")
  );
}

function shouldHideFromTimeline(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;

  const body = (m.body ?? "").toLowerCase();
  const eventType = getTimelineEventType(m);

  if (
    isKnownTimelineEvent(m) ||
    String(m.event_type ?? "").trim() ||
    isBookingLinkTimelineEvent(m, eventType) ||
    isBookedCallTimelineEvent(m, eventType)
  ) {
    return false;
  }

  return (
    body.includes("calendar event") ||
    body.includes("calendar event:") ||
    body.includes("event:")
  );
}

function extractBookingSlugFromBody(body: string): string | null {
  const m = String(body || "").match(/\/b\/([a-z0-9_-]+)/i);
  return m?.[1] ? String(m[1]).trim() : null;
}

function extractUrlsFromText(value: string): string[] {
  const matches = String(value ?? "").match(/https?:\/\/[^\s)]+/gi);
  return matches ? Array.from(new Set(matches.map((url) => url.trim()))) : [];
}

function extractGoogleMeetUrl(value: string): string | null {
  const urls = extractUrlsFromText(value);
  return (
    urls.find((url) =>
      /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(url),
    ) ??
    urls.find((url) => url.includes("meet.google.com/")) ??
    null
  );
}

function extractCalendarEventUrl(value: string): string | null {
  const urls = extractUrlsFromText(value);
  const meetUrl = extractGoogleMeetUrl(value);

  return (
    urls.find(
      (url) =>
        url !== meetUrl &&
        (url.includes("calendar.google.com") ||
          url.includes("/calendar/") ||
          url.includes("google.com/calendar")),
    ) ??
    urls.find((url) => url !== meetUrl) ??
    null
  );
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

function readEventBoolean(
  eventData: Record<string, unknown> | null | undefined,
  ...keys: string[]
): boolean | null {
  for (const key of keys) {
    const value = eventData?.[key];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;
  }
  return null;
}

function readEventRecord(
  eventData: EventRecord | null | undefined,
  ...keys: string[]
): EventRecord | null {
  for (const key of keys) {
    const value = eventData?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as EventRecord;
    }
  }
  return null;
}

function readEventArray(
  eventData: EventRecord | null | undefined,
  ...keys: string[]
): unknown[] {
  for (const key of keys) {
    const value = eventData?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function participantFromRecord(value: EventRecord | null) {
  if (!value) return null;

  const displayName = readEventString(
    value,
    "displayName",
    "display_name",
    "name",
    "full_name",
    "label",
  );
  const email = readEventString(value, "email", "emailAddress", "mail");
  const fallbackKey = readEventString(value, "id", "user_id") ?? "guest";
  const label = displayName || email || "Guest";

  return {
    label,
    email,
    key: (email || displayName || fallbackKey).toLowerCase(),
  };
}

function participantFromUnknown(value: unknown) {
  if (typeof value === "string") {
    const label = value.trim();
    if (!label) return null;
    return {
      label,
      email: label.includes("@") ? label : null,
      key: label.toLowerCase(),
    };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return participantFromRecord(value as EventRecord);
  }

  return null;
}

function dedupeParticipants(participants: MeetingParticipant[]) {
  const seen = new Set<string>();
  const out: MeetingParticipant[] = [];

  for (const participant of participants) {
    if (seen.has(participant.key)) continue;
    seen.add(participant.key);
    out.push(participant);
  }

  return out;
}

function getBookedCallParticipants(args: {
  eventData: EventRecord | null | undefined;
  profileLabels: Record<string, string>;
  commonRoleMember: string;
}) {
  const { eventData, profileLabels, commonRoleMember } = args;
  const googleEvent = readEventRecord(
    eventData,
    "google_event",
    "googleCalendarEvent",
    "calendar_event_data",
  );

  const googleParticipants = dedupeParticipants(
    [
      participantFromRecord(
        readEventRecord(eventData, "google_organizer", "organizer") ??
          readEventRecord(googleEvent, "organizer"),
      ),
      ...readEventArray(eventData, "google_attendees", "event_attendees").map(
        participantFromUnknown,
      ),
      ...readEventArray(googleEvent, "attendees").map(participantFromUnknown),
    ].filter((entry): entry is MeetingParticipant => Boolean(entry)),
  );

  if (googleParticipants.length) return googleParticipants;

  const localParticipants: MeetingParticipant[] = [];
  const inviteeName = readEventString(
    eventData,
    "invitee_name",
    "invitee_full_name",
    "invitee_first_name",
    "lead_name",
  );
  const inviteeEmail = readEventString(
    eventData,
    "invitee_email",
    "lead_email",
    "email",
  );

  if (inviteeName || inviteeEmail) {
    localParticipants.push({
      label: inviteeName || inviteeEmail || "Guest",
      email: inviteeEmail,
      key: (inviteeEmail || inviteeName || "guest").toLowerCase(),
    });
  }

  const hostIds = [
    readEventString(eventData, "host_user_id", "owner_user_id"),
    ...readEventArray(eventData, "group_participants", "participant_user_ids")
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean),
  ].filter((value): value is string => Boolean(value));

  for (const hostId of hostIds) {
    localParticipants.push({
      label: profileLabels[hostId] || commonRoleMember,
      email: null,
      key: hostId,
    });
  }

  return dedupeParticipants(localParticipants);
}

function formatChannelLabel(channel: string | null, t: TimelineTranslator) {
  const value = String(channel ?? "").toLowerCase();

  if (value === "dm") return t.channels.dm;
  if (value === "sms") return t.channels.sms;
  if (value === "other") return t.channels.other;
  if (value === "pipeline") return t.channels.pipeline;

  return channel ? channel.toUpperCase() : t.channels.dm;
}

function timelineTimeMs(value: string | null | undefined) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function timelineEventSortRank(message: LeadMessage) {
  switch (getTimelineEventType(message)) {
    case "call_closed_updated":
      return 50;
    case "call_offer_updated":
      return 40;
    case "call_attendance_updated":
      return 30;
    case "call_booked":
      return 20;
    case "booking_invite_created":
    case "booking_link_created":
      return 10;
    default:
      return 0;
  }
}

export function LeadActivityTimeline({
  isDark,
  title,
  subtitle,
  loading,
  leadMissing = false,
  loadingText,
  emptyText,
  leadMissingText,
  messages,
  leadLabel,
  leadCreatedAt,
  leadId,
  viewerTz,
  viewerLocale,
  currentUser,
  creatorProfile,
  creatorAvatarUrl,
  userAvatarUrl,
  leadInitials,
  profileLabels = {},
  productLabels = {},
  stageLabelsById = {},
  bookingNameBySlug = new Map(),
  commonRoleMember,
  canViewCalendarPage = false,
  t,
  canShowHeaderAction = false,
  headerActionLabel,
  headerActionIcon,
  onHeaderAction,
  headerActionClassName,
  translateDescriptor,
  schedulePageFallbackLabel,
}: LeadActivityTimelineProps) {
  const divider = isDark ? "border-slate-800" : "border-slate-100";
  const cardSoft = cn(
    "rounded-2xl border",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-100 bg-white",
  );
  const tiny = isDark ? "text-slate-500" : "text-slate-500";
  const linkCls = isDark
    ? "text-indigo-300 hover:text-indigo-200"
    : "text-indigo-600 hover:text-indigo-700";

  const timelineItemBox = cn(
    "overflow-hidden rounded-xl border px-3 py-2",
    isDark
      ? "border-slate-900 bg-slate-900/40"
      : "border-slate-100 bg-slate-50",
  );

  const timelineMeta = cn(
    "mb-1 flex flex-col gap-1 text-[11px] sm:flex-row sm:items-center sm:justify-between",
    isDark ? "text-slate-400" : "text-slate-500",
  );

  const timelineAuthor = isDark ? "text-slate-200" : "text-slate-700";
  const timelineBody = isDark ? "text-slate-200" : "text-slate-800";

  const bookedCallPanel = isDark
    ? "mt-2 overflow-hidden rounded-xl border border-emerald-900/40 bg-emerald-500/10"
    : "mt-2 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/80";

  const bookedCallPrimaryButton = isDark
    ? "inline-flex items-center rounded-lg border border-emerald-800/60 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/20"
    : "inline-flex items-center rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100";

  const bookedCallSecondaryButton = isDark
    ? "inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
    : "inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50";

  const defaultHeaderActionClassName = cn(
    "inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  );

  const timelineMessages = useMemo(() => {
    const cleaned = (messages ?? []).filter((m) => !shouldHideFromTimeline(m));
    const finalList = [...cleaned];

    const alreadyHasLeadCreated = finalList.some(isLeadCreatedTimelineMessage);

    if (!alreadyHasLeadCreated && leadCreatedAt) {
      finalList.push({
        id: `lead-created:${leadId ?? leadCreatedAt}`,
        direction: "outbound",
        channel: "pipeline",
        body: `LEAD_CREATED|${leadLabel}`,
        sent_at: leadCreatedAt,
        sender_profile_id: creatorProfile?.id ?? null,
        event_type: "lead_created",
        event_data: {
          lead_label: leadLabel,
          prospector_id: creatorProfile?.id ?? null,
        },
        sender: creatorProfile
          ? {
              id: String(creatorProfile.id ?? ""),
              first_name: creatorProfile.first_name ?? null,
              last_name: creatorProfile.last_name ?? null,
              avatar_url: creatorAvatarUrl ?? creatorProfile.avatar_url ?? null,
            }
          : null,
      });
    }

    finalList.sort(
      (a, b) =>
        timelineTimeMs(b.sent_at) - timelineTimeMs(a.sent_at) ||
        timelineTimeMs(b.created_at) - timelineTimeMs(a.created_at) ||
        timelineEventSortRank(b) - timelineEventSortRank(a) ||
        String(b.id ?? "").localeCompare(String(a.id ?? "")),
    );

    return finalList;
  }, [
    messages,
    leadCreatedAt,
    leadId,
    leadLabel,
    creatorProfile,
    creatorAvatarUrl,
  ]);

  function formatBookingLinkTimelineBody(message: LeadMessage) {
    const slug =
      readEventString(message.event_data, "booking_link_slug", "slug") ??
      extractBookingSlugFromBody(message.body);

    const name = slug ? bookingNameBySlug.get(slug) : null;

    return (
      translateDescriptor({
        key: "booking-link",
        values: {
          name: name || schedulePageFallbackLabel,
        },
      }) ?? message.body
    );
  }

  return (
    <div className={cn("flex h-full flex-col", cardSoft)}>
      <div
        className={cn(
          "flex items-center justify-between border-b px-4 py-3",
          divider,
        )}
      >
        <div>
          <h2
            className={cn(
              "text-sm font-semibold",
              isDark ? "text-slate-200" : "text-slate-800",
            )}
          >
            {title}
          </h2>
          <p className={cn("text-xs", tiny)}>{subtitle}</p>
        </div>

        {canShowHeaderAction && onHeaderAction && (
          <button
            type="button"
            onClick={onHeaderAction}
            disabled={!!leadId && !isUuid(leadId)}
            className={headerActionClassName ?? defaultHeaderActionClassName}
            title={headerActionLabel}
          >
            {headerActionIcon ?? "+"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className={cn("text-xs", tiny)}>{loadingText}</p>
        ) : leadMissing ? (
          <p className={cn("text-xs", tiny)}>{leadMissingText ?? emptyText}</p>
        ) : timelineMessages.length === 0 ? (
          <p className={cn("text-xs", tiny)}>{emptyText}</p>
        ) : (
          <div className="space-y-3 text-xs">
            {timelineMessages.map((m) => {
              const isOutbound = m.direction === "outbound";
              const isInbound = m.direction === "inbound";
              const isPipeline = isPipelineEvent(m);

              const eventType = getTimelineEventType(m);

              const isBookingLinkEvent =
                isPipeline && isBookingLinkTimelineEvent(m, eventType);

              const isBookedCallEvent =
                isPipeline &&
                (isBookedCallMessage(m) ||
                  isBookedCallTimelineEvent(m, eventType));
              const isLeadCreatedEvent = isLeadCreatedTimelineMessage(m);
              const isRejectedEvent = isLeadRejectedEvent(m);
              const isAttendance = isCallAttendanceEvent(m);
              const isOfferMade = isCallOfferMadeEvent(m);
              const isClosed = isCallClosedEvent(m);
              const isLegacyOutcome = isLegacyCallOutcomeEvent(m);
              const attendanceChange = isAttendance
                ? getCallAttendanceChange(m)
                : null;

              const first = m.sender?.first_name ?? "";
              const last = m.sender?.last_name ?? "";
              const fullName = `${first} ${last}`.trim();

              const creatorName =
                `${creatorProfile?.first_name ?? ""} ${creatorProfile?.last_name ?? ""}`.trim() ||
                commonRoleMember;

              const currentUserName =
                `${currentUser?.first_name ?? ""} ${currentUser?.last_name ?? ""}`.trim() ||
                null;

              const authorName = isInbound
                ? leadLabel
                : isLeadCreatedEvent
                  ? fullName || creatorName
                  : isPipeline
                    ? fullName || commonRoleMember
                    : fullName || currentUserName || commonRoleMember;

              const roleLabel = isInbound ? t.roleLead : t.roleTeam;
              const avatarUrl = isOutbound
                ? (m.sender?.avatar_url ?? userAvatarUrl ?? null)
                : null;

              const initials = isOutbound
                ? initialsFromName(
                    first || currentUser?.first_name,
                    last || currentUser?.last_name,
                  )
                : leadInitials;

              const tsLabel = fmtMessageTimestamp(
                m.sent_at,
                viewerTz || "UTC",
                viewerLocale,
              );

              let pipelineIcon = "/icons/stage-change.svg";
              if (isLeadCreatedEvent) pipelineIcon = "/icons/new-lead.svg";
              else if (isRejectedEvent)
                pipelineIcon = "/icons/lead-rejected.svg";
              else if (isAttendance) {
                pipelineIcon = iconForAttendance(
                  attendanceChange?.nextStatus ?? "unknown",
                );
              } else if (isOfferMade) {
                pipelineIcon = "/icons/call-offer-made.svg";
              } else if (isClosed) {
                pipelineIcon = "/icons/call-closed.svg";
              } else if (isLegacyOutcome) {
                pipelineIcon = iconForLegacyOutcome(m.body);
              } else if (isBookedCallEvent) {
                pipelineIcon = "/icons/booked-call.svg";
              } else if (isBookingLinkEvent) {
                pipelineIcon = "/icons/booking-link.svg";
              }

              const pipelineAlt = isLeadCreatedEvent
                ? t.alt.newLead
                : isRejectedEvent
                  ? t.alt.leadRejected
                  : isAttendance
                    ? t.alt.callStatus
                    : isOfferMade
                      ? t.alt.offerMade
                      : isClosed
                        ? t.alt.closedOnCall
                        : isLegacyOutcome
                          ? t.alt.callOutcomeUpdate
                          : isBookedCallEvent
                            ? t.alt.callBooked
                            : isBookingLinkEvent
                              ? t.alt.bookingLinkSent
                              : t.alt.pipelineActivity;

              const offerParsed = isOfferMade
                ? (() => {
                    const eventEnabled = readEventBoolean(
                      m.event_data,
                      "enabled",
                      "on",
                    );
                    const eventProductId = readEventString(
                      m.event_data,
                      "product_id",
                      "stripe_product_id",
                      "price_id",
                    );
                    const eventProductTitle = readEventString(
                      m.event_data,
                      "product_title",
                      "product_name",
                    );

                    if (
                      eventEnabled !== null ||
                      eventProductId ||
                      eventProductTitle
                    ) {
                      return {
                        on: eventEnabled ?? false,
                        productId: eventProductId ?? "",
                        productTitleInline: eventProductTitle ?? "",
                      };
                    }

                    return parseOfferMade(m.body);
                  })()
                : null;

              const offerTitle =
                offerParsed?.productTitleInline ||
                (offerParsed?.productId
                  ? (productLabels[offerParsed.productId] ?? null)
                  : null);

              const closedParsed = isClosed
                ? (() => {
                    const eventEnabled = readEventBoolean(
                      m.event_data,
                      "enabled",
                      "on",
                    );
                    const eventProductId = readEventString(
                      m.event_data,
                      "product_id",
                      "stripe_product_id",
                      "price_id",
                    );

                    if (eventEnabled !== null || eventProductId) {
                      return {
                        on: eventEnabled ?? false,
                        productId: eventProductId ?? "",
                      };
                    }

                    return parseClosedOnCall(m.body);
                  })()
                : null;

              const closedTitle =
                readEventString(
                  m.event_data,
                  "product_title",
                  "product_name",
                ) ||
                (closedParsed?.productId
                  ? (productLabels[closedParsed.productId] ?? null)
                  : null);

              const rejectedParsed = isRejectedEvent
                ? (() => {
                    const eventOldSetterId = readEventString(
                      m.event_data,
                      "old_setter_id",
                      "previous_setter_id",
                    );
                    const eventNewSetterId = readEventString(
                      m.event_data,
                      "new_setter_id",
                      "assignee_id",
                    );
                    const eventOldSetterName = readEventString(
                      m.event_data,
                      "old_setter_name",
                      "previous_setter_name",
                    );
                    const eventNewSetterName = readEventString(
                      m.event_data,
                      "new_setter_name",
                      "assignee_name",
                    );
                    const parsed = parseLeadRejected(m.body);

                    return {
                      oldSetterId: eventOldSetterId ?? parsed.oldSetterId,
                      newSetterId: eventNewSetterId ?? parsed.newSetterId,
                      oldSetterName: eventOldSetterName ?? null,
                      newSetterName: eventNewSetterName ?? null,
                      count: parsed.count,
                    };
                  })()
                : null;

              const newSetterNameForRejectedLead =
                rejectedParsed?.newSetterName ||
                (rejectedParsed?.newSetterId
                  ? (profileLabels[rejectedParsed.newSetterId] ?? null)
                  : null) ||
                commonRoleMember;
              const oldSetterNameForRejectedLead =
                rejectedParsed?.oldSetterName ||
                (rejectedParsed?.oldSetterId
                  ? (profileLabels[rejectedParsed.oldSetterId] ?? null)
                  : null) ||
                fullName ||
                currentUserName ||
                commonRoleMember;

              const timelineDescriptor = isBookingLinkEvent
                ? null
                : getTimelineMessageDescriptor({
                    message: m,
                    leadLabel,
                    oldSetterNameForRejectedLead,
                    newSetterNameForRejectedLead,
                    productTitle: offerTitle || closedTitle || null,
                    viewerTz: viewerTz || "UTC",
                    viewerLocale,
                    stageLabelsById,
                  });

              const renderedText = isBookingLinkEvent
                ? formatBookingLinkTimelineBody(m)
                : (translateDescriptor(timelineDescriptor) ?? m.body);

              const meetUrl =
                readEventString(
                  m.event_data,
                  "google_meet_link",
                  "google_meet_url",
                  "meet_url",
                  "meeting_url",
                  "meeting_link",
                ) ??
                (isBookedCallEvent ? extractGoogleMeetUrl(m.body ?? "") : null);

              const calendarUrl =
                readEventString(
                  m.event_data,
                  "google_calendar_event_link",
                  "calendar_event_link",
                  "calendar_url",
                  "calendar_event_url",
                ) ??
                (isBookedCallEvent
                  ? extractCalendarEventUrl(m.body ?? "")
                  : null);
              const canShowCalendarAction = Boolean(
                calendarUrl && canViewCalendarPage,
              );
              const meetingParticipants = isBookedCallEvent
                ? getBookedCallParticipants({
                    eventData: m.event_data,
                    profileLabels,
                    commonRoleMember,
                  })
                : [];
              const visibleParticipants = meetingParticipants.slice(0, 3);
              const hiddenParticipantCount = Math.max(
                meetingParticipants.length - visibleParticipants.length,
                0,
              );

              return (
                <div key={m.id} className="flex gap-2">
                  <div className="flex h-8 w-8 items-center justify-center">
                    {isPipeline ? (
                      <img
                        src={pipelineIcon}
                        alt={pipelineAlt}
                        className={cn(
                          "h-8 w-8 rounded-full border object-cover",
                          isDark ? "border-slate-800" : "border-slate-200",
                        )}
                      />
                    ) : avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={authorName}
                        className={cn(
                          "h-8 w-8 rounded-full border object-cover",
                          isDark ? "border-slate-800" : "border-slate-200",
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white",
                          isOutbound
                            ? "bg-indigo-600"
                            : isDark
                              ? "bg-slate-700"
                              : "bg-slate-500",
                        )}
                      >
                        {initials}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className={timelineItemBox}>
                      <div className={timelineMeta}>
                        <span className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                          <span
                            className={cn(
                              "break-words font-semibold",
                              timelineAuthor,
                            )}
                          >
                            {authorName}
                          </span>
                          <span
                            className={cn(
                              "flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5",
                              isDark ? "text-slate-500" : "text-slate-400",
                            )}
                          >
                            <span
                              className="text-[11px] leading-normal"
                              aria-hidden="true"
                            >
                              &middot;
                            </span>
                            <span className="text-[11px] leading-normal">
                              {roleLabel}
                            </span>
                            <span
                              className="text-[11px] leading-normal"
                              aria-hidden="true"
                            >
                              &middot;
                            </span>
                            <span className="break-words text-[11px] leading-normal">
                              {formatChannelLabel(m.channel, t)}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 sm:text-right">{tsLabel}</span>
                      </div>

                      {isBookedCallEvent ? (
                        <div>
                          <p
                            className={cn(
                              "whitespace-pre-wrap break-words text-[11px] font-medium",
                              timelineBody,
                            )}
                          >
                            {renderedText ||
                              formatBookedCallBody(
                                m.body,
                                viewerTz || "UTC",
                                viewerLocale,
                              )}
                          </p>

                          {(meetUrl || canShowCalendarAction) && (
                            <div className={bookedCallPanel}>
                              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                                <span
                                  className={cn(
                                    "text-[10px] font-semibold uppercase tracking-wide",
                                    isDark
                                      ? "text-emerald-200/85"
                                      : "text-emerald-700",
                                  )}
                                >
                                  {t.joinDetails}
                                </span>

                                {meetUrl && (
                                  <a
                                    href={meetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={bookedCallPrimaryButton}
                                    title={t.openGoogleMeet}
                                  >
                                    {t.openGoogleMeet}
                                  </a>
                                )}

                                {canShowCalendarAction && (
                                  <Link
                                    href="/calendar"
                                    className={bookedCallSecondaryButton}
                                    title={t.openCalendarEvent}
                                  >
                                    {t.openCalendarEvent}
                                  </Link>
                                )}
                              </div>

                              {meetUrl && (
                                <div
                                  className={cn(
                                    "border-t px-3 py-2",
                                    isDark
                                      ? "border-emerald-900/30"
                                      : "border-emerald-200/70",
                                  )}
                                >
                                  <p
                                    className={cn(
                                      "text-[10px]",
                                      isDark
                                        ? "text-slate-400"
                                        : "text-slate-500",
                                    )}
                                  >
                                    {t.meetingLink}
                                  </p>
                                  <a
                                    href={meetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "mt-0.5 block break-all text-[11px] font-medium",
                                      linkCls,
                                    )}
                                  >
                                    {meetUrl}
                                  </a>

                                  {meetingParticipants.length > 0 && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      <span
                                        className={cn(
                                          "mr-0.5 text-[10px] font-semibold uppercase",
                                          isDark
                                            ? "text-emerald-100/70"
                                            : "text-emerald-700/75",
                                        )}
                                      >
                                        Participants
                                      </span>
                                      {visibleParticipants.map(
                                        (participant) => (
                                          <span
                                            key={participant.key}
                                            title={
                                              participant.email
                                                ? `${participant.label} (${participant.email})`
                                                : participant.label
                                            }
                                            className={cn(
                                              "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                              isDark
                                                ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-50"
                                                : "border-emerald-200 bg-white/80 text-emerald-800",
                                            )}
                                          >
                                            <span className="truncate">
                                              {participant.label}
                                            </span>
                                          </span>
                                        ),
                                      )}
                                      {hiddenParticipantCount > 0 && (
                                        <span
                                          className={cn(
                                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                            isDark
                                              ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-100/80"
                                              : "border-emerald-200 bg-white/80 text-emerald-700",
                                          )}
                                        >
                                          +{hiddenParticipantCount} more
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p
                          className={cn(
                            "whitespace-pre-wrap break-words text-[11px]",
                            timelineBody,
                          )}
                        >
                          {renderedText}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
