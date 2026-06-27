"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { getLeadFieldDefinitions } from "@/features/crm/data/leadFields";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import { useAppLocale } from "@/context/LocaleContext";
import type {
  LeadContactType,
  LeadFieldDefinition,
  LeadGender,
  LeadSourceCategory,
  LeadSourceName,
  LeadType,
} from "@/features/crm/types/lead";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  buildNormalizedCustomMap,
  contactHref,
  fieldStorageKey,
  formatCustomValue,
  getLeadFieldSelectLabel,
  getCustomValue,
  normalizeLeadKey as normalizeKey,
  normalizeUrl,
  safeValue,
} from "@/features/crm/utils/lead";
import {
  getAttendanceStatusLabel,
  getLeadContactTypeLabel,
  getLeadGenderLabel,
  getLeadSourceCategoryLabel,
  getLeadSourceNameLabel,
  getLeadTypeLabel,
} from "@/i18n/domain-values";
import {
  ConfirmModal,
  InlineAlert,
  LeadDetailPageSkeleton,
} from "@/features/crm/components/lead-detail/ui";
import type {
  BookingLinkRow,
  BookingType,
  CreatorProfile,
  LeadMessage,
  ScoreThresholds,
} from "@/features/crm/components/lead-detail/types";
import {
  getRejectLeadErrorMessage,
  getTimelineEventType,
  getTimelineMessageDescriptor,
  isStripeProdOrPriceId,
  parseClosedOnCall,
  parseLeadRejected,
  parseOfferMade,
  readBrowserTimeZone,
} from "@/features/crm/components/lead-detail/timeline";
import { LeadActivityTimeline } from "@/features/crm/components/activity-timeline/LeadActivityTimeline";
import { getPipelineStages } from "@/features/crm/data/pipelineStages";

interface LeadData {
  id: string;
  stage: string;

  lead_name?: string | null;

  niche: string | null;
  lead_type: LeadType;
  gender: LeadGender;

  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;

  primary_contact_type: LeadContactType;
  primary_contact_value: string | null;

  source_category: LeadSourceCategory;
  source_name: LeadSourceName;

  created_at: string;
  updated_at?: string | null;

  custom_values: Record<string, any> | null;
  display_values?: Record<string, string | null> | null;

  prospector_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;

  notes?: string | null;

  score?: number | null;
  score_updated_at?: string | null;

  rejected_count?: number | null;
  rejected_by?: string[] | null;
}

type TeamMembershipRow = {
  team_id: string | null;
  role: unknown;
};

type NormalizedTeamMembershipRow = {
  team_id: string | null;
  role: unknown | null;
};

const RESERVED_CUSTOM_KEYS_NORMALIZED = new Set<string>(
  ["lead_name"].map(normalizeKey),
);

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function normalizeTeamRoleNames(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : value == null ? [] : [value];
  const roles = rawValues
    .map((entry) =>
      String(entry ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  return Array.from(new Set(roles));
}

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;

  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.substring(prefix.length));
    }
  }

  return null;
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

async function getAccessToken(): Promise<string | null> {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error) return null;
  return sessionData.session?.access_token ?? null;
}

function withAuthAndLocaleHeaders(
  locale: string,
  accessToken?: string | null,
  headers?: HeadersInit,
) {
  return withLocaleHeader(
    {
      ...headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    locale,
  );
}

async function fetchLead(
  teamId: string,
  leadId: string,
  locale: string,
): Promise<LeadData | null> {
  const accessToken = await getAccessToken();

  const res = await fetch(
    `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(leadId)}`,
    {
      cache: "no-store",
      headers: withAuthAndLocaleHeaders(locale, accessToken),
    },
  );

  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    console.error(
      "[LeadDetail] leads API failed",
      res.status,
      ct,
      text.slice(0, 300),
    );
    return null;
  }

  const json = await res.json().catch(() => null);
  return (json ?? null) as LeadData | null;
}

async function fetchScoreConfig(
  teamId: string,
  locale: string,
): Promise<ScoreThresholds | null> {
  const accessToken = await getAccessToken();

  const res = await fetch("/api/crm/lead-scoring-config", {
    method: "POST",
    headers: withAuthAndLocaleHeaders(locale, accessToken, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ teamId, action: "get" }),
  });

  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("application/json")) return null;

  const json = await res.json().catch(() => ({}));
  const low = Number((json as any).thresholds?.low);
  const high = Number((json as any).thresholds?.high);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;

  return { low, high };
}

async function fetchHasCalls(
  teamId: string,
  leadId: string,
  locale: string,
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();

    const res = await fetch(
      `/api/crm/leads/${encodeURIComponent(leadId)}/calls?teamId=${encodeURIComponent(teamId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: withAuthAndLocaleHeaders(locale, accessToken),
      },
    );

    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("application/json")) return false;

    const json = await res.json().catch(() => null);
    const calls = (json as any)?.calls;
    return Array.isArray(calls) && calls.length > 0;
  } catch {
    return false;
  }
}

async function fetchStripeProductLabels(
  ids: string[],
  locale: string,
): Promise<Record<string, string>> {
  const uniq: string[] = Array.from(
    new Set(
      ids
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .filter(isStripeProdOrPriceId),
    ),
  );
  if (uniq.length === 0) return {};

  try {
    const token = await getAccessToken();
    if (!token) return {};

    const res = await fetch("/api/billing/products/labels", {
      method: "POST",
      headers: withAuthAndLocaleHeaders(locale, token, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ ids: uniq }),
      cache: "no-store",
    });

    const ct = res.headers.get("content-type") ?? "";
    const json = await res.json().catch(() => null);

    if (!res.ok || !ct.includes("application/json")) {
      console.error(
        "[LeadDetail] /api/billing/products/labels failed",
        res.status,
        ct,
        json,
      );
      return {};
    }

    const labels = (json as any)?.labels;
    if (!labels || typeof labels !== "object") return {};

    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(labels)) {
      const name = String(v ?? "").trim();
      if (name) out[String(k)] = name;
    }
    return out;
  } catch (e) {
    console.error("[LeadDetail] fetchStripeProductLabels error", e);
    return {};
  }
}

function logSupabaseError(
  prefix: string,
  error: any,
  extra?: Record<string, any>,
) {
  if (!error) return;
  console.error(prefix, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    ...extra,
  });
}

function getCommonTimelineCopy(
  common: ReturnType<typeof useTranslations<"Common">>,
) {
  return {
    noMessages: common("states.noMessages"),
    roleLead: common("activityTimeline.roleLead"),
    roleTeam: common("activityTimeline.roleTeam"),
    joinDetails: common("activityTimeline.joinDetails"),
    meetingLink: common("activityTimeline.meetingLink"),
    schedulePage: common("activityTimeline.schedulePage"),
    bookingLinkSent: (name: string) =>
      common("activityTimeline.bookingLinkSent", { name }),
    openGoogleMeet: common("activityTimeline.actions.openGoogleMeet"),
    openCalendarEvent: common("activityTimeline.actions.openCalendarEvent"),
    alt: {
      newLead: common("activityTimeline.alt.newLead"),
      leadRejected: common("activityTimeline.alt.leadRejected"),
      callStatus: common("activityTimeline.alt.callStatus"),
      offerMade: common("activityTimeline.alt.offerMade"),
      closedOnCall: common("activityTimeline.alt.closedOnCall"),
      callOutcomeUpdate: common("activityTimeline.alt.callOutcomeUpdate"),
      callBooked: common("activityTimeline.alt.callBooked"),
      bookingLinkSent: common("activityTimeline.alt.bookingLinkSent"),
      pipelineActivity: common("activityTimeline.alt.pipelineActivity"),
    },
    channels: {
      dm: common("activityTimeline.channels.dm"),
      sms: common("activityTimeline.channels.sms"),
      other: common("activityTimeline.channels.other"),
      pipeline: common("activityTimeline.channels.pipeline"),
    },
  };
}

function translateTimelineDescriptor(
  descriptor:
    | ReturnType<typeof getTimelineMessageDescriptor>
    | {
        key: "LeadDetailPage.timeline.sentBookingLink";
        values: { name: string };
      }
    | null,
  t: ReturnType<typeof useTranslations<"LeadDetailPage">>,
  tPipeline: ReturnType<typeof useTranslations<"PipelinePage">>,
  tDomain: ReturnType<typeof useTranslations<"DomainValues">>,
  commonTimeline: ReturnType<typeof getCommonTimelineCopy>,
) {
  if (!descriptor) return null;

  if (descriptor.key === "LeadDetailPage.timeline.sentBookingLink") {
    return commonTimeline.bookingLinkSent(descriptor.values.name);
  }

  switch (descriptor.key) {
    case "crm.leadTimeline.leadCreated":
      return t("timeline.events.leadCreated", {
        leadLabel: descriptor.values.leadLabel,
      });

    case "crm.leadTimeline.leadRejected":
      return t("timeline.events.leadRejected", {
        oldSetterName: descriptor.values.oldSetterName,
        newSetterName: descriptor.values.newSetterName,
        previousRejectionCount: descriptor.values.previousRejectionCount,
      });

    case "crm.leadTimeline.callAttendanceUpdated":
      return t("timeline.events.callAttendanceUpdated", {
        previousStatus: getAttendanceStatusLabel(
          tDomain,
          descriptor.values.previousStatus,
        ),
        nextStatus: getAttendanceStatusLabel(
          tDomain,
          descriptor.values.nextStatus,
        ),
      });

    case "crm.leadTimeline.stageChanged":
      return tPipeline("stageChangeLog", {
        fromStage: descriptor.values.fromStage,
        toStage: descriptor.values.toStage,
      });

    case "crm.leadTimeline.offerRemoved":
      return t("timeline.events.offerRemoved");

    case "crm.leadTimeline.offerMade":
      return t("timeline.events.offerMade", {
        productTitle: descriptor.values.productTitle,
      });

    case "crm.leadTimeline.closedOnCallRemoved":
      return t("timeline.events.closedOnCallRemoved");

    case "crm.leadTimeline.closedOnCall":
      return t("timeline.events.closedOnCall", {
        productTitle: descriptor.values.productTitle,
      });

    case "crm.leadTimeline.callOutcomeLegacy": {
      const extras: string[] = [];
      if (descriptor.values.offerMade) {
        extras.push(commonTimeline.alt.offerMade);
      }
      if (descriptor.values.closedOnCall) {
        extras.push(commonTimeline.alt.closedOnCall);
      }

      const base = t("timeline.events.callAttendanceUpdated", {
        previousStatus: getAttendanceStatusLabel(
          tDomain,
          descriptor.values.previousStatus,
        ),
        nextStatus: getAttendanceStatusLabel(
          tDomain,
          descriptor.values.nextStatus,
        ),
      });

      return extras.length ? `${base} · ${extras.join(" · ")}` : base;
    }

    case "crm.leadTimeline.callBooked": {
      const base = t("timeline.events.callBooked", {
        rangeLabel: descriptor.values.rangeLabel,
        zoneLabel: descriptor.values.zoneLabel,
      });

      if (descriptor.values.meetLink) {
        return `${base}\n${t("timeline.events.joinMeeting", {
          meetLink: descriptor.values.meetLink,
        })}`;
      }

      return base;
    }

    case "crm.leadTimeline.fallbackBody":
      return descriptor.values.body;

    default:
      return null;
  }
}

type LeadDetailClientProps = {
  leadId?: string;
};

export function LeadDetailClient({ leadId }: LeadDetailClientProps) {
  const t = useTranslations("LeadDetailPage");
  const tLeads = useTranslations("LeadsPage");
  const tPipeline = useTranslations("PipelinePage");
  const tSchedulePages = useTranslations("SchedulePagesSettingsPage");
  const common = useTranslations("Common");
  const commonTimeline = getCommonTimelineCopy(common);
  const tDomain = useTranslations("DomainValues");
  const emptyLabel = tDomain("fallbacks.empty");
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const { locale } = useAppLocale();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const editBtn = isDark
    ? "border-indigo-900/50 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/20"
    : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300";

  const routeLeadId = typeof params?.id === "string" ? params.id : "";
  const rawLeadId =
    typeof leadId === "string" && leadId.trim() ? leadId : routeLeadId;

  const normalizedLeadId = useMemo(
    () => safeDecode(rawLeadId).trim(),
    [rawLeadId],
  );

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);
  const [isSetter, setIsSetter] = useState(false);
  const [hasCloserRole, setHasCloserRole] = useState(false);
  const [canDeleteLead, setCanDeleteLead] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  const [viewerTz, setViewerTz] = useState<string>("UTC");

  useEffect(() => {
    let cancelled = false;

    const refreshTz = () => {
      if (cancelled) return;
      setViewerTz(readBrowserTimeZone());
    };

    refreshTz();

    const interval = window.setInterval(refreshTz, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshTz();
    };
    const onFocus = () => refreshTz();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => refreshTz(),
        () => {},
        {
          maximumAge: 60_000,
          timeout: 7_000,
        },
      );
    }

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const hasLeadId = normalizedLeadId.length > 0;
  const leadIdIsUuid = useMemo(
    () => isUuid(normalizedLeadId),
    [normalizedLeadId],
  );

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [thresholds, setThresholds] = useState<ScoreThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const [creator, setCreator] = useState<CreatorProfile | null>(null);

  const [bookingLinks, setBookingLinks] = useState<BookingLinkRow[]>([]);
  const [bookingLinksLoading, setBookingLinksLoading] = useState(false);
  const [bookingLinksError, setBookingLinksError] = useState<string | null>(
    null,
  );

  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const [hasBookedCalls, setHasBookedCalls] = useState(false);
  const [callsCheckLoading, setCallsCheckLoading] = useState(false);

  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const [productLabels, setProductLabels] = useState<Record<string, string>>(
    {},
  );
  const [stageLabelsById, setStageLabelsById] = useState<
    Record<string, string>
  >({});

  const [profileLabels, setProfileLabels] = useState<Record<string, string>>(
    {},
  );

  const [setterName, setSetterName] = useState<string | null>(null);
  const [closerName, setCloserName] = useState<string | null>(null);

  const activeBookingLinks = useMemo(
    () => (bookingLinks ?? []).filter((b) => !b.deleted_at),
    [bookingLinks],
  );

  const normalizedCustom = useMemo(
    () => buildNormalizedCustomMap(lead?.custom_values),
    [lead?.custom_values],
  );

  const normalizedDisplayValues = useMemo(() => {
    const source = lead?.display_values ?? {};
    const out: Record<string, string | null> = {};

    for (const [key, value] of Object.entries(source)) {
      out[normalizeKey(key)] = typeof value === "string" ? value : null;
    }

    return out;
  }, [lead?.display_values]);

  function displayValueOverride(key: string) {
    return normalizedDisplayValues[normalizeKey(key)] ?? null;
  }

  type RenderFieldDef = LeadFieldDefinition & { storageKey: string };

  const customFieldDefs: RenderFieldDef[] = useMemo(() => {
    const seen = new Set<string>();

    return (fields ?? [])
      .map((f) => ({ ...f, storageKey: fieldStorageKey(f) }))
      .filter((f) => !RESERVED_CUSTOM_KEYS_NORMALIZED.has(normalizeKey(f.key)))
      .filter((f) => {
        const k = normalizeKey(f.storageKey);
        if (!k) return false;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [fields]);

  const canManageLeadActions = useMemo(() => {
    if (!lead) return false;
    if (isManagerOrAdmin) return true;
    if (!currentUserId) return false;
    return lead.setter_id === currentUserId || lead.closer_id === currentUserId;
  }, [lead, currentUserId, isManagerOrAdmin]);

  const canSeeCallsButton = useMemo(() => {
    if (!lead) return false;
    if (!hasBookedCalls) return false;
    if (isManagerOrAdmin) return true;
    if (!currentUserId) return false;
    return String(lead.closer_id ?? "") === String(currentUserId);
  }, [lead, hasBookedCalls, isManagerOrAdmin, currentUserId]);

  const canRejectLead = useMemo(() => {
    if (!lead) return false;
    if (!currentUserId) return false;

    const uid = String(currentUserId);
    const isCurrentSetter = String(lead.setter_id ?? "") === uid;
    const isCurrentCloser = String(lead.closer_id ?? "") === uid;

    return isCurrentSetter && isSetter && !isCurrentCloser;
  }, [lead, currentUserId, isSetter]);

  async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
    return data?.publicUrl ?? null;
  }

  function goToBookingLinksSettings() {
    setIsBookingModalOpen(false);
    router.push("/settings/booking-links");
  }

  function initialsFromSingleString(label: string) {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "L";
    if (parts.length === 1) return parts[0]?.charAt(0).toUpperCase() || "L";
    return (
      (parts[0]?.charAt(0).toUpperCase() || "L") +
      (parts[1]?.charAt(0).toUpperCase() || "")
    );
  }

  function getScoreGrade(score: number | null) {
    const mk = (light: string, dark: string) => (isDark ? dark : light);

    if (score == null) {
      return {
        label: t("score.unscored"),
        short: "?",
        circle: mk(
          "bg-slate-100 text-slate-500",
          "bg-slate-900/60 text-slate-300",
        ),
      };
    }

    if (!thresholds) {
      return {
        label: t("score.scored"),
        short: "S",
        circle: mk(
          "bg-amber-100 text-amber-800",
          "bg-amber-500/15 text-amber-200",
        ),
      };
    }

    const { low, high } = thresholds;
    if (score < low) {
      return {
        label: t("score.low"),
        short: "L",
        circle: mk("bg-rose-100 text-rose-800", "bg-rose-500/15 text-rose-200"),
      };
    }
    if (score >= high) {
      return {
        label: t("score.high"),
        short: "H",
        circle: mk(
          "bg-emerald-100 text-emerald-800",
          "bg-emerald-500/15 text-emerald-200",
        ),
      };
    }

    return {
      label: t("score.medium"),
      short: "M",
      circle: mk(
        "bg-amber-100 text-amber-800",
        "bg-amber-500/15 text-amber-200",
      ),
    };
  }

  function typeClasses(tpe: BookingType | null) {
    const mk = (light: string, dark: string) => (isDark ? dark : light);
    switch (tpe) {
      case "one_on_one":
        return mk(
          "bg-indigo-50 text-indigo-700 ring-indigo-200",
          "bg-indigo-500/15 text-indigo-200 ring-indigo-900/40",
        );
      case "group":
        return mk(
          "bg-emerald-50 text-emerald-700 ring-emerald-200",
          "bg-emerald-500/15 text-emerald-200 ring-emerald-900/40",
        );
      case "round_robin":
        return mk(
          "bg-amber-50 text-amber-800 ring-amber-200",
          "bg-amber-500/15 text-amber-100 ring-amber-900/40",
        );
      default:
        return mk(
          "bg-slate-100 text-slate-700 ring-slate-200",
          "bg-slate-900/60 text-slate-200 ring-slate-800",
        );
    }
  }

  function formatType(tpe: BookingType | null): string {
    switch (tpe) {
      case "one_on_one":
        return tSchedulePages("badges.oneOnOne");
      case "group":
        return tSchedulePages("badges.group");
      case "round_robin":
        return tSchedulePages("badges.roundRobin");
      default:
        return "—";
    }
  }

  function hostLabelForLink(link: BookingLinkRow) {
    if (link.booking_type === "round_robin") {
      return tSchedulePages("badges.roundRobin");
    }
    return link.owner_name || t("booking.host");
  }

  async function fetchMessages(
    activeTeamId: string,
    activeLeadId: string,
    activeLocale: string,
  ) {
    const accessToken = await getAccessToken();

    const res = await fetch(
      `/api/crm/lead-messages?teamId=${encodeURIComponent(activeTeamId)}&leadId=${encodeURIComponent(activeLeadId)}`,
      {
        headers: withAuthAndLocaleHeaders(activeLocale, accessToken),
      },
    );

    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[LeadDetail] /api/crm/lead-messages error",
        res.status,
        ct,
        text.slice(0, 400),
      );
      throw new Error("Failed to load messages");
    }
    if (!ct.includes("application/json")) {
      const text = await res.text();
      console.error(
        "[LeadDetail] /api/crm/lead-messages returned non-JSON",
        res.status,
        ct,
        text.slice(0, 400),
      );
      throw new Error("Messages API did not return JSON");
    }

    const data = (await res.json()) as LeadMessage[];
    const withResolvedAvatars: LeadMessage[] = await Promise.all(
      (data ?? []).map(async (m) => {
        if (m.sender?.avatar_url) {
          const signed = await resolveAvatarUrl(m.sender.avatar_url);
          return { ...m, sender: { ...m.sender, avatar_url: signed } };
        }
        return m;
      }),
    );
    return withResolvedAvatars;
  }

  async function loadBookingLinks(
    activeTeamId: string,
  ): Promise<BookingLinkRow[]> {
    if (!activeTeamId || !isUuid(activeTeamId)) return [];

    const { data: links, error: linksErr } = await supabase
      .from("booking_links")
      .select("id,name,slug,booking_type,owner_user_id,deleted_at,created_at")
      .eq("team_id", activeTeamId)
      .order("created_at", { ascending: false });

    if (linksErr) {
      console.error("[LeadDetail] booking_links query error:", linksErr);
      throw new Error(linksErr.message || "Failed to load schedule pages");
    }

    const ownerIds = Array.from(
      new Set(
        (links ?? [])
          .map((l: any) => String(l.owner_user_id ?? "").trim())
          .filter(Boolean)
          .filter(isUuid),
      ),
    );

    let ownerMap: Record<
      string,
      { first_name: string | null; last_name: string | null }
    > = {};
    if (ownerIds.length) {
      const { data: owners, error: ownersErr } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", ownerIds);

      if (ownersErr) {
        console.warn("[LeadDetail] owners lookup blocked/failed:", ownersErr);
      } else {
        ownerMap = Object.fromEntries(
          (owners ?? []).map((p: any) => [
            String(p.id),
            {
              first_name: p.first_name ?? null,
              last_name: p.last_name ?? null,
            },
          ]),
        );
      }
    }

    const rows: BookingLinkRow[] = (links ?? []).map((row: any) => {
      const owner = row.owner_user_id
        ? ownerMap[String(row.owner_user_id)]
        : null;
      const owner_name =
        `${owner?.first_name ?? ""} ${owner?.last_name ?? ""}`.trim();

      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        slug: String(row.slug ?? ""),
        booking_type: (row.booking_type ?? null) as BookingType | null,
        owner_user_id: row.owner_user_id ?? null,
        owner_name: owner_name || t("booking.host"),
        deleted_at: row.deleted_at ?? null,
      };
    });

    return rows;
  }

  async function refreshLeadDetailAfterScoring(
    activeTeamId: string,
    activeLeadId: string,
  ) {
    try {
      const [leadRes, configRes, loadedMessages] = await Promise.all([
        fetchLead(activeTeamId, activeLeadId, locale),
        fetchScoreConfig(activeTeamId, locale),
        fetchMessages(activeTeamId, activeLeadId, locale).catch(() => null),
      ]);

      if (leadRes) {
        setLead({
          ...leadRes,
          custom_values: leadRes.custom_values ?? {},
          display_values: leadRes.display_values ?? {},
        });
      }

      setThresholds(configRes);

      if (Array.isArray(loadedMessages)) {
        setMessages(loadedMessages);
      }
    } catch (err) {
      console.error(
        "[LeadDetail] Failed to refresh lead detail after booking link creation",
        err,
      );
    }
  }

  async function createBookingInvite(bookingLinkId: string) {
    if (!teamId) return;
    if (!leadIdIsUuid) {
      setInviteError(t("booking.errors.leadIdMustBeUuid"));
      return;
    }

    setInviteError(null);
    setInviteSuccess(null);
    setInviteLoadingId(bookingLinkId);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("missing_session");

      const res = await fetch("/api/crm/booking-invite", {
        method: "POST",
        headers: withAuthAndLocaleHeaders(locale, accessToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          teamId,
          leadId: normalizedLeadId,
          bookingLinkId,
        }),
      });

      const ct = res.headers.get("content-type") ?? "";
      const json = ct.includes("application/json")
        ? await res.json().catch(() => ({}) as any)
        : ({} as any);

      if (!res.ok) {
        const msg =
          (json as any)?.error ||
          (json as any)?.message ||
          (ct.includes("application/json")
            ? `Failed to create invite (${res.status})`
            : await res.text());
        throw new Error(msg);
      }

      const inviteUrl: string = String(
        (json as any)?.url ??
          (json as any)?.inviteUrl ??
          (json as any)?.data?.url ??
          (json as any)?.data?.inviteUrl ??
          "",
      ).trim();

      if (!inviteUrl) {
        throw new Error(t("booking.errors.inviteCreatedButNoUrl"));
      }

      setLastInviteUrl(inviteUrl);

      try {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteSuccess(t("booking.success.createdAndCopied"));
      } catch {
        setInviteSuccess(t("booking.success.createdCopyManual"));
      }

      await refreshLeadDetailAfterScoring(teamId, normalizedLeadId);
    } catch (e: any) {
      setInviteError(String(e?.message ?? t("booking.errors.createFailed")));
    } finally {
      setInviteLoadingId(null);
    }
  }

  async function confirmRejectLead() {
    if (!teamId || !normalizedLeadId) return;
    if (!canRejectLead) return;

    setRejecting(true);
    setRejectError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("missing_session");

      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(normalizedLeadId)}/reject`,
        {
          method: "POST",
          headers: withAuthAndLocaleHeaders(locale, accessToken, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ teamId }),
        },
      );

      const json = await res.json().catch(() => ({}) as any);

      if (!res.ok) {
        const friendlyMessage = getRejectLeadErrorMessage((json as any)?.error);
        throw new Error(friendlyMessage);
      }

      if (
        (json as any)?.warning === "timeline_insert_failed" &&
        currentUserId
      ) {
        const newSetterId = String((json as any)?.newSetterId ?? "").trim();
        const rejectedCount = Number((json as any)?.rejectedCount ?? 0);
        const previousRejectedCount = Number(
          (json as any)?.previousRejectedCount ??
            Math.max(rejectedCount - 1, 0),
        );
        const fallbackBody = `LEAD_REJECTED|${currentUserId}|${newSetterId}|${rejectedCount}`;

        const backupRes = await fetch(
          `/api/crm/lead-messages?teamId=${encodeURIComponent(teamId)}&leadId=${encodeURIComponent(normalizedLeadId)}`,
          {
            method: "POST",
            headers: withAuthAndLocaleHeaders(locale, accessToken, {
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({
              direction: "outbound",
              channel: "pipeline",
              body: fallbackBody,
              sent_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              sender_profile_id: currentUserId,
              user_id: currentUserId,
              event_type: "lead_rejected",
              event_data: {
                lead_id: normalizedLeadId,
                team_id: teamId,
                actor_profile_id: currentUserId,
                old_setter_id: currentUserId,
                new_setter_id: newSetterId || null,
                old_setter_name:
                  String((json as any)?.oldSetterName ?? "").trim() || null,
                new_setter_name:
                  String((json as any)?.newSetterName ?? "").trim() || null,
                rejection_count: rejectedCount,
                previous_rejection_count: previousRejectedCount,
              },
            }),
          },
        );

        if (!backupRes.ok) {
          const backupText = await backupRes.text().catch(() => "");
          console.error(
            "[LeadDetail] backup lead rejection timeline insert failed",
            backupRes.status,
            backupText,
          );
        }
      }

      router.push("/leads");
    } catch (e: any) {
      setRejectError(String(e?.message ?? t("reject.errors.failed")));
    } finally {
      setRejecting(false);
      setRejectConfirmOpen(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (!cancelled) {
            setTeamId(null);
            setCurrentUserId(null);
            setIsManagerOrAdmin(false);
            setIsSetter(false);
            setHasCloserRole(false);
            setCanDeleteLead(false);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        if (!cancelled) setCurrentUserId(userId);

        const [{ data: profile, error: profileError }, membershipsResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("team_id, role")
              .eq("id", userId)
              .maybeSingle(),
            (supabase as any)
              .from("team_members")
              .select("team_id, role")
              .eq("user_id", userId),
          ]);

        if (profileError && profileError.code !== "PGRST116") {
          logSupabaseError("[LeadDetail] Failed to load profile", profileError);
        }

        const membershipError = membershipsResult?.error ?? null;
        if (membershipError) {
          logSupabaseError(
            "[LeadDetail] Failed to load team memberships",
            membershipError,
          );
        }

        const membershipRows = (
          (Array.isArray(membershipsResult?.data)
            ? membershipsResult.data
            : []) as TeamMembershipRow[]
        )
          .map(
            (membership): NormalizedTeamMembershipRow => ({
              team_id:
                typeof membership?.team_id === "string" &&
                membership.team_id.trim()
                  ? membership.team_id.trim()
                  : null,
              role: membership?.role ?? null,
            }),
          )
          .filter(
            (
              membership,
            ): membership is NormalizedTeamMembershipRow & {
              team_id: string;
            } => membership.team_id !== null,
          );

        const cookieTeamId = getCookieValue("current_team_id");
        const metaTeam = (user.user_metadata as any)?.primary_team_id;

        let tId: string | null =
          (typeof cookieTeamId === "string" && cookieTeamId.trim()) ||
          (typeof metaTeam === "string" && metaTeam.trim()) ||
          profile?.team_id ||
          membershipRows[0]?.team_id ||
          null;

        if (
          tId &&
          membershipRows.length > 0 &&
          !membershipRows.some((membership) => membership.team_id === tId)
        ) {
          tId = membershipRows[0]?.team_id ?? null;
        }

        const activeRoles = Array.from(
          new Set([
            ...normalizeTeamRoleNames((profile as any)?.role),
            ...membershipRows
              .filter((membership) => membership.team_id === tId)
              .flatMap((membership) => normalizeTeamRoleNames(membership.role)),
          ]),
        );

        const managerOrAdmin =
          activeRoles.includes("manager") || activeRoles.includes("admin");
        const setter = activeRoles.includes("setter");
        const closer = activeRoles.includes("closer");

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
          setIsManagerOrAdmin(managerOrAdmin);
          setIsSetter(setter);
          setHasCloserRole(closer);
          setCanDeleteLead(managerOrAdmin);
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setCurrentUserId(null);
          setIsManagerOrAdmin(false);
          setIsSetter(false);
          setHasCloserRole(false);
          setCanDeleteLead(false);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      const tId = teamId;
      if (!tId) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!hasLeadId) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setFields([]);
        setLead(null);
        setCreator(null);
        setSetterName(null);
        setCloserName(null);
        setThresholds(null);
      }

      try {
        const [defs, leadRes, configRes] = await Promise.all([
          getLeadFieldDefinitions(tId, locale),
          fetchLead(tId, normalizedLeadId, locale),
          fetchScoreConfig(tId, locale),
        ]);

        if (cancelled) return;

        setFields(defs);
        setThresholds(configRes);

        if (!leadRes) {
          setLead(null);
          setCreator(null);
          setSetterName(null);
          setCloserName(null);
          return;
        }

        setLead({
          ...leadRes,
          custom_values: leadRes.custom_values ?? {},
          display_values: leadRes.display_values ?? {},
        });

        setCreator(null);
        if (leadRes.prospector_id) {
          const { data: creatorProfile, error: creatorError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", leadRes.prospector_id)
            .maybeSingle();

          if (!cancelled && !creatorError && creatorProfile) {
            const signedAvatar = await resolveAvatarUrl(
              (creatorProfile as any).avatar_url,
            );
            if (!cancelled) {
              setCreator({
                id: (creatorProfile as any).id,
                first_name: (creatorProfile as any).first_name,
                last_name: (creatorProfile as any).last_name,
                avatar_url: signedAvatar,
              });
            }
          } else if (creatorError) {
            logSupabaseError(
              "[LeadDetail] Failed to load creator profile",
              creatorError,
            );
          }
        }

        const idsToLoad = [leadRes.setter_id, leadRes.closer_id]
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .filter(isUuid);

        if (idsToLoad.length) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", idsToLoad);

          if (error) {
            logSupabaseError(
              "[LeadDetail] Failed to load assigned names",
              error,
            );
          } else {
            const map: Record<string, string> = {};
            for (const p of (data ?? []) as any[]) {
              const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
              map[p.id] = full || common("roles.member");
            }

            if (!cancelled && Object.keys(map).length) {
              setProfileLabels((prev) => {
                const merged = { ...prev, ...map };

                const sId = String(leadRes.setter_id ?? "").trim();
                const cId = String(leadRes.closer_id ?? "").trim();

                setSetterName(
                  sId ? (merged[sId] ?? common("roles.member")) : null,
                );
                setCloserName(
                  cId ? (merged[cId] ?? common("roles.member")) : null,
                );

                return merged;
              });
            }
          }
        } else if (!cancelled) {
          setSetterName(null);
          setCloserName(null);
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load lead detail", err);
        if (!cancelled) {
          setLead(null);
          setCreator(null);
          setSetterName(null);
          setCloserName(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceLoaded, teamId, hasLeadId, normalizedLeadId, common, locale]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      if (!teamId || !leadIdIsUuid) {
        if (!cancelled) {
          setHasBookedCalls(false);
          setCallsCheckLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setHasBookedCalls(false);
        setCallsCheckLoading(true);
      }

      try {
        const has = await fetchHasCalls(teamId, normalizedLeadId, locale);
        if (!cancelled) setHasBookedCalls(has);
      } catch {
        if (!cancelled) setHasBookedCalls(false);
      } finally {
        if (!cancelled) setCallsCheckLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, leadIdIsUuid, normalizedLeadId, locale]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      const tId = teamId;

      if (!tId) {
        if (!cancelled) {
          setMessages([]);
          setMessagesLoading(false);
        }
        return;
      }

      if (!hasLeadId) {
        if (!cancelled) {
          setMessages([]);
          setMessagesLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setMessages([]);
        setMessagesLoading(true);
      }

      try {
        const loaded = await fetchMessages(tId, normalizedLeadId, locale);
        if (!cancelled) setMessages(loaded);
      } catch (err) {
        console.error("[LeadDetail] Failed to load messages", err);
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, hasLeadId, normalizedLeadId, locale]);

  useEffect(() => {
    setProductLabels({});
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      if (!teamId) {
        if (!cancelled) setStageLabelsById({});
        return;
      }

      try {
        const stages = await getPipelineStages(teamId, locale);
        if (cancelled) return;

        const next: Record<string, string> = {};
        for (const stage of stages) {
          const id = String(stage.id ?? "").trim();
          const name = String(stage.name ?? "").trim();
          if (id && name) next[id] = name;
        }

        setStageLabelsById(next);
      } catch (error) {
        console.error("[LeadDetail] Failed to load pipeline stage labels", error);
        if (!cancelled) setStageLabelsById({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, locale]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded || !teamId) return;

      try {
        const rows = await loadBookingLinks(teamId);
        if (!cancelled) setBookingLinks(rows);
      } catch (e) {
        if (!cancelled) {
          console.error("[LeadDetail] Failed to preload booking links", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isBookingModalOpen) return;
      if (!teamId) return;

      setInviteError(null);
      setInviteSuccess(null);
      setBookingLinksError(null);
      setBookingLinksLoading(true);

      try {
        const rows = await loadBookingLinks(teamId);
        if (!cancelled) setBookingLinks(rows);
      } catch (e: any) {
        if (!cancelled) {
          setBookingLinksError(
            String(e?.message ?? t("booking.errors.loadSchedulePages")),
          );
        }
      } finally {
        if (!cancelled) setBookingLinksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBookingModalOpen, teamId, t]);

  const leadLabel: string = useMemo(() => {
    if (!lead) return t("fallback.leadInPipeline");

    const directCol = String(
      displayValueOverride("lead_name") ?? lead.lead_name ?? "",
    ).trim();
    if (directCol) return directCol;

    const cv = lead.custom_values ?? {};
    const legacy = String((cv as any).lead_name ?? "").trim();
    if (legacy) return legacy;

    const preferredKeys = [
      "name",
      "full_name",
      "first_name",
      "last_name",
      "company",
      "account",
      "email",
    ];
    const lowerEntries = Object.entries(cv).map(
      ([k, v]) => [k.toLowerCase(), v] as const,
    );

    for (const pref of preferredKeys) {
      const match = lowerEntries.find(
        ([key, value]) =>
          key.includes(pref) && value != null && String(value).trim() !== "",
      );
      if (match) return String(match[1]).trim();
    }

    const anyField = lowerEntries.find(
      ([, value]) => value != null && String(value).trim() !== "",
    );
    if (anyField) return String(anyField[1]).trim();

    const stageLabel = lead.stage || t("fallback.pipeline");
    return t("fallback.leadInStage", { stage: stageLabel });
  }, [lead, t, normalizedDisplayValues]);

  const leadInitials = useMemo(
    () => initialsFromSingleString(leadLabel),
    [leadLabel],
  );

  const bookingNameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    (bookingLinks ?? []).forEach((b) => {
      const slug = String(b.slug || "").trim();
      if (slug) m.set(slug, String(b.name || "").trim() || slug);
    });
    return m;
  }, [bookingLinks]);

  const timelineMessages: LeadMessage[] = useMemo(() => {
    return messages ?? [];
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ids = (timelineMessages ?? [])
        .filter((m) => getTimelineEventType(m) === "lead_rejected")
        .flatMap((m) => {
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

          if (eventOldSetterId || eventNewSetterId) {
            return [eventOldSetterId, eventNewSetterId];
          }

          const parsed = parseLeadRejected(m.body);
          return [parsed.oldSetterId, parsed.newSetterId];
        })
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .filter(isUuid);

      const uniq = Array.from(new Set(ids));
      if (uniq.length === 0) return;

      const missing = uniq.filter((id) => !profileLabels[id]);
      if (missing.length === 0) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", missing);

      if (error) {
        console.error("[LeadDetail] failed to load setter names", error);
        return;
      }

      const map: Record<string, string> = {};
      for (const p of (data ?? []) as any[]) {
        const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        if (p.id) map[p.id] = full || common("roles.member");
      }

      if (!cancelled && Object.keys(map).length) {
        setProfileLabels((prev) => ({ ...prev, ...map }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timelineMessages, profileLabels, common]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const offerIds = timelineMessages
        .filter((m) => getTimelineEventType(m) === "call_offer_updated")
        .map((m) => {
          const eventEnabled = readEventBoolean(m.event_data, "enabled", "on");
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

          if (eventEnabled !== null || eventProductId || eventProductTitle) {
            return {
              on: eventEnabled ?? false,
              productId: eventProductId ?? "",
              productTitleInline: eventProductTitle ?? "",
            };
          }

          return parseOfferMade(m.body);
        })
        .filter((p) => p.on && p.productId && !p.productTitleInline)
        .map((p) => p.productId);

      const closedIds = timelineMessages
        .filter((m) => getTimelineEventType(m) === "call_closed_updated")
        .map((m) => {
          const eventEnabled = readEventBoolean(m.event_data, "enabled", "on");
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
        })
        .filter((p) => p.on && p.productId)
        .map((p) => p.productId);

      const uniq = Array.from(
        new Set([...offerIds, ...closedIds].filter(isStripeProdOrPriceId)),
      );
      if (uniq.length === 0) return;

      const map = await fetchStripeProductLabels(uniq, locale);
      if (!cancelled) {
        setProductLabels(map ?? {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timelineMessages, locale]);

  function customFieldDisplayText(
    field: RenderFieldDef,
    rawValue: unknown,
  ): string {
    const override = displayValueOverride(field.storageKey);

    if (field.type === "select") {
      return (
        safeValue(override ?? getLeadFieldSelectLabel(field, rawValue)) ??
        emptyLabel
      );
    }

    return safeValue(override ?? formatCustomValue(rawValue)) ?? emptyLabel;
  }

  const pageText = isDark ? "text-slate-200" : "text-slate-800";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const cardShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const cardTitle = isDark ? "text-slate-100" : "text-slate-800";

  const inputShell = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600"
    : "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400";

  const pillStage = isDark
    ? "bg-indigo-500/15 text-indigo-200"
    : "bg-indigo-50 text-indigo-700";
  const pillNeutral = isDark
    ? "bg-slate-900/60 text-slate-200"
    : "bg-slate-100 text-slate-700";

  const linkCls = isDark
    ? "text-indigo-300 hover:text-indigo-200"
    : "text-indigo-600 hover:text-indigo-700";

  const secondaryBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const callsBtn = isDark
    ? "border-emerald-900/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
    : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400";

  const rejectBtn = isDark
    ? "border-amber-900/50 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
    : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:border-amber-300";

  const deleteBtn = isDark
    ? "border-rose-900/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";

  const timelineHeaderActionClassName = isDark
    ? "inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border-emerald-900/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
    : "inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border-emerald-300 bg-emerald-50 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-100";

  if (!workspaceLoaded || loading) {
    return <LeadDetailPageSkeleton isDark={isDark} />;
  }

  if (workspaceLoaded && !teamId) {
    return (
      <p className={`text-sm ${mutedText}`}>{tLeads("empty.noWorkspace")}</p>
    );
  }

  if (!hasLeadId) {
    return <p className="text-sm text-rose-600">{t("empty.missingLeadId")}</p>;
  }

  if (!lead) {
    return <p className={`text-sm ${mutedText}`}>{t("empty.leadNotFound")}</p>;
  }

  const createdDT = DateTime.fromISO(lead.created_at, {
    setZone: true,
  }).setZone(viewerTz || "UTC");
  const createdLabel = createdDT.isValid
    ? createdDT.toLocaleString(DateTime.DATETIME_SHORT)
    : lead.created_at;

  const updatedIso = lead.updated_at ?? null;
  const updatedDT = updatedIso
    ? DateTime.fromISO(updatedIso, { setZone: true }).setZone(viewerTz || "UTC")
    : null;
  const updatedLabel =
    updatedDT && updatedDT.isValid
      ? updatedDT.toLocaleString(DateTime.DATETIME_SHORT)
      : "—";

  const score = lead.score ?? null;
  const gradeInfo = getScoreGrade(score);

  const contactValue = String(lead.primary_contact_value ?? "").trim();
  const contactLink = contactValue
    ? contactHref(lead.primary_contact_type, contactValue)
    : null;

  const postal = lead.postal_code?.trim() || "";
  const city = String(displayValueOverride("city") ?? lead.city ?? "").trim();
  const region = String(
    displayValueOverride("region") ?? lead.region ?? "",
  ).trim();
  const country = String(
    displayValueOverride("country") ?? lead.country ?? "",
  ).trim();

  const firstPart = [postal, city].filter(Boolean).join(" ").trim();
  const locationLine = [firstPart, region, country].filter(Boolean).join(", ");

  return (
    <div className={`h-full overflow-y-auto ${pageText}`}>
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        <div className="space-y-6 pb-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1
                  className={`truncate text-2xl font-semibold ${titleText}`}
                  title={leadLabel}
                >
                  {leadLabel}
                </h1>
                <p className={`text-sm ${mutedText}`}>
                  {t("page.createdOn", { date: createdLabel })}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                {canSeeCallsButton && (
                  <button
                    type="button"
                    disabled={!normalizedLeadId || callsCheckLoading}
                    onClick={() =>
                      router.push(
                        `/leads/${encodeURIComponent(normalizedLeadId)}/calls`,
                      )
                    }
                    className={[
                      "rounded-lg px-3 py-1.5 text-xs font-semibold border shadow-sm",
                      callsBtn,
                      "disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer min-h-7 px-3 whitespace-nowrap",
                    ].join(" ")}
                    title={t("actions.callsTitle")}
                  >
                    {callsCheckLoading
                      ? t("actions.callsLoading")
                      : t("actions.calls")}
                  </button>
                )}

                {canManageLeadActions && (
                  <button
                    type="button"
                    disabled={!normalizedLeadId || !teamId}
                    onClick={() => setIsBookingModalOpen(true)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm cursor-pointer",
                      secondaryBtn,
                      "disabled:opacity-60 disabled:cursor-not-allowed",
                    ].join(" ")}
                    title={t("actions.bookingLinkTitle")}
                  >
                    {t("actions.bookingLink")}
                  </button>
                )}

                {canRejectLead && (
                  <button
                    type="button"
                    disabled={rejecting}
                    onClick={() => setRejectConfirmOpen(true)}
                    className={[
                      "rounded-lg px-3 py-1.5 text-xs font-semibold h-[28px] border shadow-sm",
                      rejectBtn,
                      "disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer",
                    ].join(" ")}
                    title={t("actions.rejectTitle")}
                  >
                    {rejecting ? t("actions.rejecting") : t("actions.reject")}
                  </button>
                )}

                {canManageLeadActions && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/leads/${encodeURIComponent(normalizedLeadId)}/edit`,
                      )
                    }
                    className={[
                      "rounded-lg px-3 py-1.5 text-xs font-semibold min-h-7 px-3 whitespace-nowrap border shadow-sm cursor-pointer",
                      editBtn,
                    ].join(" ")}
                  >
                    {common("actions.edit")}
                  </button>
                )}

                {canDeleteLead && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/leads/${encodeURIComponent(normalizedLeadId)}/delete`,
                      )
                    }
                    className={[
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer min-h-7 px-3 whitespace-nowrap",
                      deleteBtn,
                    ].join(" ")}
                  >
                    {t("actions.delete")}
                  </button>
                )}
              </div>
            </div>

            {(rejectError ||
              bookingLinksError ||
              inviteError ||
              inviteSuccess) && (
              <div className="mt-3 max-w-3xl space-y-2">
                {rejectError && (
                  <InlineAlert
                    isDark={isDark}
                    tone="warning"
                    title={t("alerts.rejectFailedTitle")}
                    message={rejectError}
                    onClose={() => setRejectError(null)}
                  />
                )}

                {bookingLinksError && (
                  <InlineAlert
                    isDark={isDark}
                    tone="danger"
                    title={t("alerts.bookingLinksLoadFailedTitle")}
                    message={bookingLinksError}
                    onClose={() => setBookingLinksError(null)}
                  />
                )}

                {inviteError && (
                  <InlineAlert
                    isDark={isDark}
                    tone="danger"
                    title={t("alerts.bookingLinkCreateFailedTitle")}
                    message={inviteError}
                    onClose={() => setInviteError(null)}
                  />
                )}

                {inviteSuccess && (
                  <InlineAlert
                    isDark={isDark}
                    tone="info"
                    title={t("alerts.bookingLinkCreatedTitle")}
                    message={inviteSuccess}
                    onClose={() => setInviteSuccess(null)}
                  />
                )}
              </div>
            )}
          </div>

          <div
            className={`rounded-2xl border px-4 py-3 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-2 text-sm font-semibold ${cardTitle}`}>
              {t("sections.leadScore")}
            </h2>
            {score != null ? (
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${gradeInfo.circle}`}
                >
                  {gradeInfo.short}
                </span>
                <div>
                  <p className={`text-sm font-semibold ${titleText}`}>
                    {score} · {gradeInfo.label}
                  </p>
                  {updatedLabel !== "—" && (
                    <p className={`text-[11px] ${mutedText}`}>
                      {t("score.updated", { date: updatedLabel })}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className={`text-xs ${mutedText}`}>{t("score.noScoreYet")}</p>
            )}
          </div>

          <div
            className={`rounded-2xl border px-4 py-3 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-2 text-sm font-semibold ${cardTitle}`}>
              {t("sections.pipelineStage")}
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pillStage}`}
            >
              {safeValue(lead.stage) ?? emptyLabel}
            </span>
          </div>

          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-3 text-sm font-semibold ${cardTitle}`}>
              {t("sections.assigned")}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {t("fields.prospector")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {creator
                    ? `${creator.first_name ?? ""} ${creator.last_name ?? ""}`.trim() ||
                      common("roles.member")
                    : "—"}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {t("fields.setter")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {lead.setter_id
                    ? (safeValue(setterName ?? common("roles.member")) ??
                      emptyLabel)
                    : emptyLabel}
                </p>
              </div>

              {lead.closer_id ? (
                <div className="space-y-1">
                  <p
                    className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                  >
                    {t("fields.closer")}
                  </p>
                  <p className={`text-sm ${pageText}`}>
                    {safeValue(closerName ?? common("roles.member")) ??
                      emptyLabel}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-3 text-sm font-semibold ${cardTitle}`}>
              {t("sections.coreDetails")}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.leadName")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {safeValue(leadLabel) ?? emptyLabel}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.nicheIndustry")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {safeValue(lead.niche) ?? emptyLabel}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.leadType")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {getLeadTypeLabel(tDomain, lead.lead_type)}
                </p>
              </div>

              {lead.lead_type === "individual" && (
                <div className="space-y-1">
                  <p
                    className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                  >
                    {tLeads("columns.gender")}
                  </p>
                  <p className={`text-sm ${pageText}`}>
                    {getLeadGenderLabel(tDomain, lead.gender)}
                  </p>
                </div>
              )}

              <div className="space-y-1 md:col-span-2">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {t("fields.location")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {locationLine || emptyLabel}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.primaryContactType")}
                </p>
                <p className={`text-sm ${pageText}`}>
                  {getLeadContactTypeLabel(tDomain, lead.primary_contact_type)}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {t("fields.primaryContact")}
                </p>

                {contactLink ? (
                  <a
                    href={contactLink}
                    target={
                      contactLink.startsWith("mailto:") ||
                      contactLink.startsWith("tel:")
                        ? undefined
                        : "_blank"
                    }
                    rel={
                      contactLink.startsWith("mailto:") ||
                      contactLink.startsWith("tel:")
                        ? undefined
                        : "noopener noreferrer"
                    }
                    className={`inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline ${linkCls}`}
                  >
                    <span className="truncate">
                      {contactValue || emptyLabel}
                    </span>
                  </a>
                ) : (
                  <p className={`text-sm ${pageText}`}>
                    {contactValue ? contactValue : emptyLabel}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.sourceCategory")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.source_category ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pillNeutral}`}
                    >
                      {getLeadSourceCategoryLabel(
                        tDomain,
                        lead.source_category,
                      )}
                    </span>
                  ) : (
                    <span className={`text-sm ${pageText}`}>{emptyLabel}</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.sourceName")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.source_name ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pillNeutral}`}
                    >
                      {getLeadSourceNameLabel(tDomain, lead.source_name)}
                    </span>
                  ) : (
                    <span className={`text-sm ${pageText}`}>{emptyLabel}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-3 text-sm font-semibold ${cardTitle}`}>
              {t("sections.additionalFields")}
            </h2>

            {customFieldDefs.length === 0 ? (
              <p className={`text-sm ${mutedText}`}>
                {t("additionalFields.none")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {customFieldDefs.map((field) => {
                  const value = getCustomValue(
                    lead.custom_values,
                    normalizedCustom,
                    field.storageKey,
                  );

                  if (
                    field.type === "link" &&
                    typeof value === "string" &&
                    value.trim()
                  ) {
                    const raw = value.trim();
                    const href = normalizeUrl(raw);
                    const label = customFieldDisplayText(field, value);

                    return (
                      <div key={field.key} className="space-y-1">
                        <p
                          className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                        >
                          {field.label}
                        </p>
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline ${linkCls}`}
                        >
                          <span className="truncate">{label}</span>
                        </a>
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="space-y-1">
                      <p
                        className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                      >
                        {field.label}
                      </p>
                      <p className={`text-sm whitespace-pre-wrap ${pageText}`}>
                        {customFieldDisplayText(field, value)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <div className="mb-3">
              <h2 className={`text-sm font-semibold ${cardTitle}`}>
                {t("sections.notes")}
              </h2>
              <p className={`mt-1 text-xs ${mutedText}`}>
                {t("notes.description")}
              </p>
            </div>

            <div
              role="textbox"
              aria-readonly="true"
              tabIndex={0}
              className={[
                "w-full rounded-lg border px-3 py-2",
                "text-sm whitespace-pre-wrap",
                "min-h-[140px] max-h-[320px] overflow-y-auto",
                "focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300",
                inputShell,
              ].join(" ")}
            >
              {String(
                displayValueOverride("notes") ?? lead.notes ?? "",
              ).trim() ? (
                String(displayValueOverride("notes") ?? lead.notes ?? "")
              ) : (
                <span className={isDark ? "text-slate-600" : "text-slate-400"}>
                  {t("notes.none")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="self-start lg:sticky lg:top-0">
          <div className="h-[520px] lg:h-[calc(100vh-7rem)] lg:max-h-[820px]">
            <LeadActivityTimeline
              isDark={isDark}
              title={t("sections.activityTimeline")}
              subtitle={t("timeline.newestOnTop")}
              loading={messagesLoading}
              loadingText={t("states.loading")}
              emptyText={commonTimeline.noMessages}
              messages={messages}
              leadLabel={leadLabel}
              leadCreatedAt={lead.created_at}
              leadId={normalizedLeadId}
              viewerTz={viewerTz || "UTC"}
              viewerLocale={locale}
              currentUser={null}
              creatorProfile={creator}
              creatorAvatarUrl={creator?.avatar_url ?? null}
              userAvatarUrl={null}
              leadInitials={leadInitials}
              profileLabels={profileLabels}
              productLabels={productLabels}
              stageLabelsById={stageLabelsById}
              bookingNameBySlug={bookingNameBySlug}
              commonRoleMember={common("roles.member")}
              canViewCalendarPage={hasCloserRole}
              canShowHeaderAction={canManageLeadActions}
              headerActionLabel={t("actions.logNewMessage")}
              headerActionIcon="+"
              headerActionClassName={timelineHeaderActionClassName}
              onHeaderAction={() =>
                router.push(
                  `/leads/${encodeURIComponent(normalizedLeadId)}/messages`,
                )
              }
              schedulePageFallbackLabel={commonTimeline.schedulePage}
              t={{
                title: t("sections.activityTimeline"),
                subtitle: t("timeline.newestOnTop"),
                loading: t("states.loading"),
                empty: commonTimeline.noMessages,
                roleLead: commonTimeline.roleLead,
                roleTeam: commonTimeline.roleTeam,
                joinDetails: commonTimeline.joinDetails,
                meetingLink: commonTimeline.meetingLink,
                openGoogleMeet: commonTimeline.openGoogleMeet,
                openCalendarEvent: commonTimeline.openCalendarEvent,
                alt: commonTimeline.alt,
                channels: commonTimeline.channels,
              }}
              translateDescriptor={(descriptor) => {
                if (!descriptor) return null;

                if (descriptor.key === "booking-link") {
                  return commonTimeline.bookingLinkSent(descriptor.values.name);
                }

                return translateTimelineDescriptor(
                  descriptor as ReturnType<typeof getTimelineMessageDescriptor>,
                  t,
                  tPipeline,
                  tDomain,
                  commonTimeline,
                );
              }}
            />
          </div>
        </div>
      </div>

      <ConfirmModal
        open={rejectConfirmOpen}
        isDark={isDark}
        tone="warning"
        title={t("reject.modalTitle")}
        message={t("reject.modalMessage")}
        confirmText={t("reject.confirm")}
        cancelText={common("actions.cancel")}
        loading={rejecting}
        onCancel={() => setRejectConfirmOpen(false)}
        onConfirm={confirmRejectLead}
      />

      {isBookingModalOpen && canManageLeadActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className="absolute inset-0"
            onClick={() => setIsBookingModalOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("booking.modalAriaLabel")}
            className={[
              "relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl",
              isDark
                ? "border-slate-800 bg-slate-950"
                : "border-slate-200 bg-white",
            ].join(" ")}
          >
            <div className="flex items-center justify-between bg-indigo-600 px-6 py-4 text-white">
              <div>
                <h2 className="text-lg font-semibold">
                  {t("booking.modalTitle")}
                </h2>
                <p className="mt-1 text-xs text-indigo-100">
                  {t("booking.modalDescription")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBookingModalOpen(false)}
                className="rounded-full p-1 text-indigo-100 hover:bg-indigo-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
                title={common("actions.close")}
              >
                <span className="sr-only">{common("actions.close")}</span>✕
              </button>
            </div>

            <div
              className={[
                "space-y-4 px-6 pb-6 pt-5",
                isDark ? "bg-slate-900/40" : "bg-slate-50",
              ].join(" ")}
            >
              {lastInviteUrl && (
                <div
                  className={`rounded-xl border px-4 py-3 shadow-sm ${cardShell}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                      >
                        {t("booking.latestLink")}
                      </div>
                      <div
                        className={`mt-1 truncate text-xs font-medium ${pageText}`}
                      >
                        {lastInviteUrl}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={[
                        "shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm cursor-pointer",
                        secondaryBtn,
                      ].join(" ")}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lastInviteUrl);
                          setInviteSuccess(t("booking.success.copied"));
                        } catch {
                          setInviteSuccess(
                            t("booking.success.copyFailedManual"),
                          );
                        }
                      }}
                    >
                      {common("actions.copy")}
                    </button>
                  </div>
                </div>
              )}

              {bookingLinksLoading ? (
                <p className={`text-sm ${mutedText}`}>
                  {t("booking.loadingSchedulePages")}
                </p>
              ) : activeBookingLinks.length === 0 ? (
                <div
                  className={[
                    "rounded-2xl border border-dashed p-6",
                    isDark
                      ? "border-slate-700 bg-slate-950"
                      : "border-slate-300 bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <img
                      src="/icons/schedule-page.svg"
                      alt={t("booking.schedulePage")}
                      className="h-8 w-8"
                    />

                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${titleText}`}>
                        {t("booking.emptyTitle")}
                      </p>
                      <p
                        className={`mt-1 text-xs leading-relaxed ${mutedText}`}
                      >
                        {t("booking.emptyDescription")}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={goToBookingLinksSettings}
                          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
                        >
                          {t("booking.createSchedulePage")}
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsBookingModalOpen(false)}
                          className={[
                            "inline-flex items-center justify-center rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-sm cursor-pointer",
                            secondaryBtn,
                          ].join(" ")}
                        >
                          {t("booking.notNow")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`rounded-xl border shadow-sm ${cardShell}`}>
                  <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-xl">
                    <table className="w-full border-collapse text-sm">
                      <thead
                        className={[
                          "sticky top-0 z-10",
                          isDark ? "bg-slate-900/70" : "bg-slate-100",
                        ].join(" ")}
                      >
                        <tr className="text-left">
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            {t("booking.columns.schedulePage")}
                          </th>
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            {t("booking.columns.type")}
                          </th>
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            {t("booking.columns.host")}
                          </th>
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            {t("booking.columns.action")}
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {activeBookingLinks.map((link) => {
                          const isBusy = inviteLoadingId === link.id;

                          return (
                            <tr
                              key={link.id}
                              className={[
                                "group border-b",
                                isDark
                                  ? "border-slate-900 hover:bg-slate-900/40"
                                  : "border-slate-100 hover:bg-slate-50/70",
                              ].join(" ")}
                            >
                              <td className="px-4 py-3">
                                <div className="min-w-0">
                                  <div
                                    className={`truncate font-semibold ${titleText}`}
                                  >
                                    {link.name}
                                  </div>
                                  <div
                                    className={`mt-0.5 text-[11px] ${mutedText}`}
                                  >
                                    /b/{link.slug}
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3">
                                <span
                                  className={[
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                                    typeClasses(link.booking_type),
                                  ].join(" ")}
                                >
                                  {formatType(link.booking_type)}
                                </span>
                              </td>

                              <td className="px-4 py-3">
                                <span className={`text-sm ${pageText}`}>
                                  {hostLabelForLink(link)}
                                </span>
                              </td>

                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  disabled={isBusy || !teamId || !leadIdIsUuid}
                                  onClick={() => createBookingInvite(link.id)}
                                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                  title={
                                    !leadIdIsUuid
                                      ? t("booking.errors.leadIdMustBeUuid")
                                      : undefined
                                  }
                                >
                                  {isBusy
                                    ? t("booking.creating")
                                    : t("booking.createAndCopy")}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsBookingModalOpen(false)}
                  className={[
                    "rounded-lg border px-4 py-2 text-xs font-semibold shadow-sm cursor-pointer",
                    secondaryBtn,
                  ].join(" ")}
                >
                  {common("actions.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
