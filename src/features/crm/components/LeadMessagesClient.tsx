"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import { useAppLocale } from "@/context/LocaleContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import type { LeadMessage } from "@/features/crm/components/lead-detail/types";
import { getAttendanceStatusLabel } from "@/i18n/domain-values";
import {
  getTimelineEventType,
  getTimelineMessageDescriptor,
  isLeadCreatedTimelineMessage,
  isStripeProdOrPriceId,
  parseClosedOnCall,
  parseLeadRejected,
  parseOfferMade,
  readBrowserTimeZone,
} from "@/features/crm/components/lead-detail/timeline";
import { LeadActivityTimeline } from "@/features/crm/components/activity-timeline/LeadActivityTimeline";
import { getPipelineStages } from "@/features/crm/data/pipelineStages";

/* -------------------- types -------------------- */

type LeadSummary = {
  id: string;
  stage: string;
  lead_name?: string | null;
  custom_values: Record<string, any>;
  created_at: string;
  prospector_id: string | null;
};

type UserProfile = {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type TeamMembershipRow = {
  team_id: string | null;
  role: unknown;
};

/* -------------------- helpers -------------------- */

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function initialsFromSingleString(label: string) {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    (parts[0]?.charAt(0).toUpperCase() || "L") +
    (parts[1]?.charAt(0).toUpperCase() || "")
  );
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
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
        "[LeadMessages] /api/billing/products/labels failed",
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
    console.error("[LeadMessages] fetchStripeProductLabels error", e);
    return {};
  }
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
        key: "LeadMessagesPage.timeline.bookingLinkSent";
        values: { name: string };
      }
    | null,
  t: ReturnType<typeof useTranslations<"LeadMessagesPage">>,
  tPipeline: ReturnType<typeof useTranslations<"PipelinePage">>,
  tDomain: ReturnType<typeof useTranslations<"DomainValues">>,
  commonTimeline: ReturnType<typeof getCommonTimelineCopy>,
) {
  if (!descriptor) return null;

  if (descriptor.key === "LeadMessagesPage.timeline.bookingLinkSent") {
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

/* -------------------- component -------------------- */

export function LeadMessagesClient() {
  const t = useTranslations("LeadMessagesPage");
  const tDomain = useTranslations("DomainValues");
  const tLeads = useTranslations("LeadsPage");
  const tPipeline = useTranslations("PipelinePage");
  const common = useTranslations("Common");
  const commonTimeline = getCommonTimelineCopy(common);
  const router = useRouter();
  const { locale } = useAppLocale();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const params = useParams<{ id?: string }>();
  const leadId = useMemo(() => safeDecode(params.id ?? "").trim(), [params.id]);

  const [viewerTz, setViewerTz] = useState("UTC");

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [hasCloserRole, setHasCloserRole] = useState(false);

  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(
    null,
  );
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);

  const [direction, setDirection] = useState<"inbound" | "outbound">(
    "outbound",
  );
  const [channel, setChannel] = useState("dm");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const [bookingNameBySlug, setBookingNameBySlug] = useState<
    Map<string, string>
  >(new Map());

  const [profileLabels, setProfileLabels] = useState<Record<string, string>>(
    {},
  );
  const [productLabels, setProductLabels] = useState<Record<string, string>>(
    {},
  );
  const [stageLabelsById, setStageLabelsById] = useState<
    Record<string, string>
  >({});

  const card = cn(
    "rounded-2xl border shadow-sm",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );
  const title = isDark ? "text-slate-100" : "text-slate-900";
  const sub = isDark ? "text-slate-400" : "text-slate-600";
  const tiny = isDark ? "text-slate-500" : "text-slate-500";

  const btn = cn(
    "rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  );

  const selectBase = cn(
    "rounded-lg border px-2 py-1 text-xs cursor-pointer",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200"
      : "border-slate-300 bg-white text-slate-700",
  );

  const textareaClass = cn(
    "h-28 w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  const primaryBtn = cn(
    "rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
    "bg-indigo-600 hover:bg-indigo-700",
  );

  async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
    return data?.publicUrl ?? null;
  }

  async function fetchLeadSummary(
    activeTeamId: string,
    activeLeadId: string,
    activeLocale: string,
  ): Promise<LeadSummary | null> {
    const accessToken = await getAccessToken();

    const leadRes = await fetch(
      `/api/crm/leads?teamId=${encodeURIComponent(activeTeamId)}&id=${encodeURIComponent(activeLeadId)}`,
      {
        cache: "no-store",
        headers: withAuthAndLocaleHeaders(activeLocale, accessToken),
      },
    );

    const ct = leadRes.headers.get("content-type") ?? "";
    if (!leadRes.ok || !ct.includes("application/json")) {
      return null;
    }

    return (await leadRes.json()) as LeadSummary;
  }

  async function fetchLeadMessages(
    activeTeamId: string,
    activeLeadId: string,
    activeLocale: string,
  ): Promise<LeadMessage[]> {
    const accessToken = await getAccessToken();

    const res = await fetch(
      `/api/crm/lead-messages?teamId=${encodeURIComponent(activeTeamId)}&leadId=${encodeURIComponent(activeLeadId)}`,
      {
        cache: "no-store",
        headers: withAuthAndLocaleHeaders(activeLocale, accessToken),
      },
    );

    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("application/json")) {
      throw new Error("messages_fetch_failed");
    }

    const data = (await res.json()) as LeadMessage[];
    const hydrated = await Promise.all(
      (data ?? []).map(async (m) => {
        if (m.sender?.avatar_url) {
          const url = await resolveAvatarUrl(m.sender.avatar_url);
          return { ...m, sender: { ...m.sender, avatar_url: url } };
        }
        return m;
      }),
    );

    return hydrated ?? [];
  }

  async function refetchMessages(
    activeTeamId: string,
    activeLeadId: string,
    activeLocale: string,
  ) {
    setMessages([]);
    setLoadingMessages(true);

    try {
      const hydrated = await fetchLeadMessages(
        activeTeamId,
        activeLeadId,
        activeLocale,
      );
      setMessages(hydrated);
    } catch (e) {
      console.error("[LeadMessages] messages reload error", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      if (!cancelled) setViewerTz(readBrowserTimeZone());
    };

    refresh();

    const i = window.setInterval(refresh, 30_000);
    const onVis = () => document.visibilityState === "visible" && refresh();

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);

    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => refresh(),
        () => {},
        {
          maximumAge: 60_000,
          timeout: 7_000,
        },
      );
    }

    return () => {
      cancelled = true;
      window.clearInterval(i);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user;

        if (!user) {
          if (!cancelled) {
            setTeamId(null);
            setWorkspaceLoaded(true);
            setLead(null);
            setMessages([]);
            setLoadingLead(false);
            setLoadingMessages(false);
            setHasCloserRole(false);
          }
          return;
        }

        const userId = user.id;

        const [{ data: prof }, membershipsResult] = await Promise.all([
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

        let tId: string | null = (prof as any)?.team_id ?? null;

        const membershipRows = (
          (Array.isArray(membershipsResult?.data)
            ? membershipsResult.data
            : []) as TeamMembershipRow[]
        )
          .map(
            (membership): TeamMembershipRow => ({
              team_id:
                typeof membership?.team_id === "string" &&
                membership.team_id.trim()
                  ? membership.team_id.trim()
                  : null,
              role: membership?.role ?? null,
            }),
          )
          .filter(
            (membership): membership is TeamMembershipRow & { team_id: string } =>
              membership.team_id !== null,
          );

        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam) tId = metaTeam;
        }

        if (!tId) {
          tId = membershipRows[0]?.team_id ?? null;
        }

        const roles = Array.from(
          new Set([
            ...normalizeTeamRoleNames((prof as any)?.role),
            ...membershipRows
              .filter((membership) => membership.team_id === tId)
              .flatMap((membership) => normalizeTeamRoleNames(membership.role)),
          ]),
        );

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
          setHasCloserRole(roles.includes("closer"));
        }

        const meQuery = supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url")
          .eq("id", userId)
          .maybeSingle() as any;

        const { data: me } = await meQuery;

        if (!cancelled && me) {
          setCurrentUser({
            id: me.id,
            first_name: me.first_name ?? null,
            last_name: me.last_name ?? null,
            avatar_url: me.avatar_url ?? null,
          });
          setUserAvatarUrl(await resolveAvatarUrl(me.avatar_url ?? null));
        }
      } catch (e) {
        console.error("[LeadMessages] workspace load error", e);
        if (!cancelled) {
          setTeamId(null);
          setWorkspaceLoaded(true);
          setLoadingLead(false);
          setLoadingMessages(false);
          setHasCloserRole(false);
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

      if (!teamId || !leadId) {
        if (!cancelled) {
          setLead(null);
          setCreatorProfile(null);
          setCreatorAvatarUrl(null);
          setBookingNameBySlug(new Map());
          setLoadingLead(false);
        }
        return;
      }

      if (!cancelled) {
        setLoadingLead(true);
        setLead(null);
        setCreatorProfile(null);
        setCreatorAvatarUrl(null);
        setBookingNameBySlug(new Map());
      }

      try {
        const leadJson = await fetchLeadSummary(teamId, leadId, locale);

        if (cancelled) return;

        if (!leadJson) {
          setLead(null);
          return;
        }

        setLead(leadJson);

        setCreatorProfile(null);
        setCreatorAvatarUrl(null);

        if (leadJson.prospector_id) {
          const creatorQuery = supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", leadJson.prospector_id)
            .maybeSingle() as any;

          const { data: creator } = await creatorQuery;

          if (!cancelled && creator) {
            const resolvedCreatorAvatar = await resolveAvatarUrl(
              creator.avatar_url ?? null,
            );

            setCreatorProfile({
              id: creator.id,
              first_name: creator.first_name ?? null,
              last_name: creator.last_name ?? null,
              avatar_url: creator.avatar_url ?? null,
            });
            setCreatorAvatarUrl(resolvedCreatorAvatar);

            const creatorName =
              `${creator.first_name ?? ""} ${creator.last_name ?? ""}`.trim() ||
              common("roles.member");

            setProfileLabels((prev) => ({
              ...prev,
              [String(creator.id)]: creatorName,
            }));
          }
        }

        const { data: links } = await supabase
          .from("booking_links")
          .select("slug, name, deleted_at")
          .eq("team_id", teamId);

        if (!cancelled && links) {
          const m = new Map<string, string>();
          links
            .filter((r: any) => !r.deleted_at)
            .forEach((r: any) => {
              const slug = String(r.slug || "").trim();
              const name = String(r.name || "").trim();
              if (slug) m.set(slug, name || slug);
            });
          setBookingNameBySlug(m);
        }
      } catch (e) {
        console.error("[LeadMessages] lead load error", e);
        if (!cancelled) {
          setLead(null);
          setCreatorProfile(null);
          setCreatorAvatarUrl(null);
          setBookingNameBySlug(new Map());
        }
      } finally {
        if (!cancelled) setLoadingLead(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, leadId, common, locale]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      if (!teamId || !leadId) {
        if (!cancelled) {
          setMessages([]);
          setLoadingMessages(false);
        }
        return;
      }

      if (!cancelled) {
        setMessages([]);
        setLoadingMessages(true);
      }

      try {
        const hydrated = await fetchLeadMessages(teamId, leadId, locale);
        if (!cancelled) setMessages(hydrated);
      } catch (e) {
        console.error("[LeadMessages] messages load error", e);
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, leadId, locale]);

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
        console.error(
          "[LeadMessages] Failed to load pipeline stage labels",
          error,
        );
        if (!cancelled) setStageLabelsById({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, locale]);

  useEffect(() => {
    setProductLabels({});
  }, [locale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !leadId || !body.trim()) return;

    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const senderId = userRes.user?.id ?? null;
      const accessToken = await getAccessToken();

      const res = await fetch(
        `/api/crm/lead-messages?teamId=${encodeURIComponent(teamId)}&leadId=${encodeURIComponent(leadId)}`,
        {
          method: "POST",
          headers: withAuthAndLocaleHeaders(locale, accessToken, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            direction,
            channel,
            body: body.trim(),
            sender_profile_id: senderId,
          }),
        },
      );

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/json")) return;

      setBody("");

      await Promise.all([
        refetchMessages(teamId, leadId, locale),
        (async () => {
          setLoadingLead(true);
          try {
            const refreshedLead = await fetchLeadSummary(
              teamId,
              leadId,
              locale,
            );
            setLead(refreshedLead);
          } catch (err) {
            console.error(
              "[LeadMessages] lead refresh after create error",
              err,
            );
          } finally {
            setLoadingLead(false);
          }
        })(),
      ]);

      window.dispatchEvent(
        new CustomEvent("lead-message-logged", { detail: { teamId, leadId } }),
      );
    } finally {
      setSaving(false);
    }
  }

  const leadLabel = useMemo(() => {
    if (!lead) return t("fallback.pipelineLead");

    const direct = String(lead.lead_name ?? "").trim();
    if (direct) return direct;

    const cv = lead.custom_values ?? {};
    const legacy = String((cv as any).lead_name ?? "").trim();
    if (legacy) return legacy;

    const anyField = Object.entries(cv).find(
      ([, v]) => v != null && String(v).trim() !== "",
    );
    return anyField
      ? String(anyField[1]).trim()
      : t("fallback.leadInStage", {
          stage: lead.stage || t("fallback.pipeline"),
        });
  }, [lead, t]);

  const leadInitials = useMemo(
    () => initialsFromSingleString(leadLabel),
    [leadLabel],
  );

  const timelineMessages = useMemo(() => {
    if (!lead) return [];

    const cleaned = messages ?? [];
    const finalList = [...cleaned];

    const alreadyHasLeadCreated = finalList.some(isLeadCreatedTimelineMessage);
    if (!alreadyHasLeadCreated) {
      finalList.push({
        id: `lead-created:${lead.id}`,
        direction: "outbound",
        channel: "pipeline",
        body: `LEAD_CREATED|${leadLabel}`,
        sent_at: lead.created_at,
        sender_profile_id: lead.prospector_id ?? null,
        event_type: "lead_created",
        event_data: {
          lead_label: leadLabel,
          prospector_id: lead.prospector_id ?? null,
        },
        sender: creatorProfile
          ? {
              id: String(creatorProfile.id ?? lead.prospector_id ?? ""),
              first_name: creatorProfile.first_name,
              last_name: creatorProfile.last_name,
              avatar_url: creatorAvatarUrl ?? creatorProfile.avatar_url,
            }
          : null,
      });
    }

    finalList.sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
    );

    return finalList;
  }, [messages, lead, leadLabel, creatorProfile, creatorAvatarUrl]);

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
        console.error("[LeadMessages] failed to load profile labels", error);
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

  const placeholder =
    direction === "outbound"
      ? t("form.placeholderOutbound")
      : messages.length
        ? t("form.placeholderInboundExisting")
        : t("form.placeholderInboundFirst");

  if (workspaceLoaded && !teamId) {
    return (
      <p
        className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}
      >
        {tLeads("empty.noWorkspace")}
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl space-y-6 pb-6">
        <div className={cn(card, "px-5 py-4")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className={cn("text-xl font-semibold", title)}>
                {t("page.title")}
              </h1>
              <p className={cn("mt-1 text-sm", sub)}>{t("page.description")}</p>
              {lead && (
                <p className={cn("mt-2 text-xs", tiny)}>
                  {t("page.leadLabel")}{" "}
                  <span
                    className={cn(
                      "font-medium",
                      isDark ? "text-slate-200" : "text-slate-700",
                    )}
                  >
                    {leadLabel}
                  </span>{" "}
                  · {t("page.stageLabel")}{" "}
                  <span
                    className={cn(
                      "font-medium",
                      isDark ? "text-slate-200" : "text-slate-700",
                    )}
                  >
                    {lead.stage || t("page.unassigned")}
                  </span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(`/leads/${encodeURIComponent(leadId)}`)
              }
              className={btn}
            >
              {t("actions.backToLead")}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={cn(card, "space-y-3 p-4")}>
          <div className="flex flex-wrap gap-2">
            <select
              className={cn("w-32", selectBase)}
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
            >
              <option value="outbound">{t("form.directionOutbound")}</option>
              <option value="inbound">{t("form.directionInbound")}</option>
            </select>

            <select
              className={cn("w-28", selectBase)}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="dm">{commonTimeline.channels.dm}</option>
              <option value="sms">{commonTimeline.channels.sms}</option>
              <option value="other">{commonTimeline.channels.other}</option>
            </select>
          </div>

          <textarea
            className={textareaClass}
            placeholder={placeholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className={primaryBtn}
            >
              {saving ? common("actions.saving") : t("actions.logMessage")}
            </button>
          </div>
        </form>

        <div className="h-[520px]">
          <LeadActivityTimeline
            isDark={isDark}
            title={t("timeline.title")}
            subtitle={t("timeline.subtitle")}
            loading={loadingLead || loadingMessages}
            leadMissing={!lead}
            loadingText={t("states.loading")}
            emptyText={commonTimeline.noMessages}
            leadMissingText={t("states.leadNotFound")}
            messages={messages}
            leadLabel={leadLabel}
            leadCreatedAt={lead?.created_at ?? null}
            leadId={lead?.id ?? leadId}
            viewerTz={viewerTz || "UTC"}
            viewerLocale={locale}
            currentUser={currentUser}
            creatorProfile={creatorProfile}
            creatorAvatarUrl={creatorAvatarUrl}
            userAvatarUrl={userAvatarUrl}
            leadInitials={leadInitials}
            profileLabels={profileLabels}
            productLabels={productLabels}
            stageLabelsById={stageLabelsById}
            bookingNameBySlug={bookingNameBySlug}
            commonRoleMember={common("roles.member")}
            canViewCalendarPage={hasCloserRole}
            canShowHeaderAction
            headerActionLabel={t("actions.openLeadDetail")}
            headerActionIcon="↗"
            onHeaderAction={() =>
              router.push(`/leads/${encodeURIComponent(leadId)}`)
            }
            schedulePageFallbackLabel={commonTimeline.schedulePage}
            t={{
              title: t("timeline.title"),
              subtitle: t("timeline.subtitle"),
              loading: t("states.loading"),
              empty: commonTimeline.noMessages,
              roleLead: commonTimeline.roleLead,
              roleTeam: commonTimeline.roleTeam,
              joinDetails: commonTimeline.joinDetails,
              meetingLink: commonTimeline.meetingLink,
              openGoogleMeet: commonTimeline.openGoogleMeet,
              openCalendarEvent: commonTimeline.openCalendarEvent,
              statesLeadNotFound: t("states.leadNotFound"),
              actionsOpenLeadDetail: t("actions.openLeadDetail"),
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
  );
}
