"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { supabase } from "@/lib/supabaseClient";

/* -------------------- types -------------------- */

type LeadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  channel: string | null;
  body: string;
  sent_at: string;
  sender_profile_id: string | null;
  sender?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
};

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

/* -------------------- helpers -------------------- */

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function fmtMessageTimestamp(iso: string, zone: string) {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  return dt.isValid ? dt.toLocaleString(DateTime.DATETIME_SHORT) : iso;
}

function initialsFromName(first?: string | null, last?: string | null) {
  const f = first?.trim()?.charAt(0).toUpperCase();
  const l = last?.trim()?.charAt(0).toUpperCase();
  return f && l ? `${f}${l}` : f || l || "U";
}

function initialsFromSingleString(label: string) {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    (parts[0]?.charAt(0).toUpperCase() || "L") +
    (parts[1]?.charAt(0).toUpperCase() || "")
  );
}

function formatChannel(c: string | null) {
  return c ? c.toUpperCase() : "DM";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function isLeadCreatedTimelineMessage(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;
  const body = String(m.body ?? "").toLowerCase();
  return (
    body.startsWith("lead_created|") ||
    body.startsWith("lead created|") ||
    body.includes("new lead")
  );
}

function formatLeadCreatedBody(body: string, leadLabel: string) {
  const parts = String(body || "").split("|");
  const labelFromBody = (parts[1] ?? "").trim();
  return `New lead added: ${labelFromBody || leadLabel}`;
}

function extractBookingSlugFromBody(body: string): string | null {
  const m = String(body || "").match(/\/b\/([a-z0-9_-]+)/i);
  return m?.[1] ? String(m[1]).trim() : null;
}

function shouldHideFromTimeline(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;
  const body = (m.body ?? "").toLowerCase();
  return (
    body.includes("calendar event") ||
    body.includes("calendar event:") ||
    body.includes("event:")
  );
}

function isBookedCallMessage(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;
  const body = (m.body ?? "").toLowerCase();
  return (
    body.includes("booked a call") ||
    body.includes("call booked for") ||
    body.includes("booked_call|")
  );
}

type BookedCallParse = {
  kind: "canonical" | "iso" | "wall";
  start: DateTime;
  end: DateTime;
};

function extractBookedCallRange(body: string): {
  kind: "instant" | "wall";
  startRaw: string;
  endRaw: string;
  tz: string | null;
  source: "canonical" | "iso" | "wall";
} | null {
  const s = body || "";

  // Canonical: BOOKED_CALL|<start>|<end>|<tz?>
  const canonical = s.match(/BOOKED_CALL\|([^|]+)\|([^|]+)(?:\|([^|]+))?/i);
  if (canonical) {
    return {
      kind: "instant",
      startRaw: canonical[1].trim(),
      endRaw: canonical[2].trim(),
      tz: canonical[3] ? canonical[3].trim() : null,
      source: "canonical",
    };
  }

  // ISO: <iso> → <iso> (TZ?)
  const iso = s.match(
    /(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))\s*(?:→|—|–|-)\s*(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))(?:\s*\(([^)]+)\))?/i,
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

  // Wall time: YYYY-MM-DD HH:mm → HH:mm (TZ?)
  const wall = s.match(
    /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(?:→|—|–|-)\s*(\d{2}:\d{2})(?:\s*\(([^)]+)\))?/i,
  );
  if (wall) {
    const date = wall[1];
    const startTime = wall[2];
    const endTime = wall[3];
    return {
      kind: "wall",
      startRaw: `${date} ${startTime}`,
      endRaw: `${date} ${endTime}`,
      tz: wall[4] ? String(wall[4]).trim() : null,
      source: "wall",
    };
  }

  return null;
}

function parseBookedCall(body: string): BookedCallParse | null {
  const parsed = extractBookedCallRange(body);
  if (!parsed) return null;

  const sourceZone = parsed.tz || "UTC";

  if (parsed.kind === "instant") {
    const hasOffsetStart = /[zZ]|[+-]\d{2}:\d{2}$/.test(parsed.startRaw);
    const hasOffsetEnd = /[zZ]|[+-]\d{2}:\d{2}$/.test(parsed.endRaw);

    const s =
      parsed.tz && !hasOffsetStart
        ? DateTime.fromISO(parsed.startRaw, { zone: sourceZone })
        : DateTime.fromISO(parsed.startRaw, { setZone: true });

    const e =
      parsed.tz && !hasOffsetEnd
        ? DateTime.fromISO(parsed.endRaw, { zone: sourceZone })
        : DateTime.fromISO(parsed.endRaw, { setZone: true });

    if (!s.isValid || !e.isValid) return null;

    return {
      kind: parsed.source === "canonical" ? "canonical" : "iso",
      start: s,
      end: e,
    };
  }

  const s = DateTime.fromFormat(parsed.startRaw, "yyyy-MM-dd HH:mm", {
    zone: sourceZone,
  });
  const e = DateTime.fromFormat(parsed.endRaw, "yyyy-MM-dd HH:mm", {
    zone: sourceZone,
  });
  if (!s.isValid || !e.isValid) return null;

  return { kind: "wall", start: s, end: e };
}

function formatBookedCallBody(body: string, viewerTz: string) {
  const parsed = parseBookedCall(body);
  if (!parsed) return body;

  const targetZone = viewerTz || "UTC";
  const startLocal = parsed.start.setZone(targetZone);
  const endLocal = parsed.end.setZone(targetZone);

  const dateLabel = startLocal.toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = startLocal.toLocaleString(DateTime.TIME_SIMPLE);
  const endTime = endLocal.toLocaleString(DateTime.TIME_SIMPLE);

  return `Call booked for ${dateLabel} · ${startTime} – ${endTime}`;
}

/* -------------------- component -------------------- */

export function LeadMessagesClient() {
  const router = useRouter();

  // ✅ FIX TS2869: make id optional if you want fallback logic
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

  async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
    return data?.publicUrl ?? null;
  }

  // timezone
  useEffect(() => {
    const refresh = () => setViewerTz(readBrowserTimeZone());
    refresh();
    const i = window.setInterval(refresh, 30_000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(i);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Load workspace(teamId) + profiles + lead + booking link names
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
            setLoadingLead(false);
            setLoadingMessages(false);
          }
          return;
        }

        const userId = user.id;

        // profile -> team_id
        const { data: prof } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .single();
        let tId: string | null = (prof as any)?.team_id ?? null;

        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam) tId = metaTeam;
        }

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
        }

        // current user profile
        const { data: me } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url")
          .eq("id", userId)
          .single();

        if (!cancelled && me) {
          setCurrentUser({
            id: me.id,
            first_name: me.first_name ?? null,
            last_name: me.last_name ?? null,
            avatar_url: me.avatar_url ?? null,
          });
          setUserAvatarUrl(await resolveAvatarUrl(me.avatar_url ?? null));
        }

        // if missing prereqs, stop
        if (!tId || !leadId) {
          if (!cancelled) setLoadingLead(false);
          return;
        }

        // lead
        const leadRes = await fetch(
          `/api/crm/leads?teamId=${encodeURIComponent(tId)}&id=${encodeURIComponent(leadId)}`,
          { cache: "no-store" },
        );

        const ct = leadRes.headers.get("content-type") ?? "";
        if (!leadRes.ok || !ct.includes("application/json")) {
          if (!cancelled) setLead(null);
          return;
        }

        const leadJson = (await leadRes.json()) as LeadSummary;
        if (!cancelled) setLead(leadJson);

        // creator profile
        setCreatorProfile(null);
        setCreatorAvatarUrl(null);
        if (leadJson?.prospector_id) {
          const { data: creator } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", leadJson.prospector_id)
            .maybeSingle();

          if (!cancelled && creator) {
            setCreatorProfile({
              id: creator.id,
              first_name: creator.first_name ?? null,
              last_name: creator.last_name ?? null,
              avatar_url: creator.avatar_url ?? null,
            });
            setCreatorAvatarUrl(
              await resolveAvatarUrl(creator.avatar_url ?? null),
            );
          }
        }

        // booking link name map (optional)
        const { data: links } = await supabase
          .from("booking_links")
          .select("slug, name, deleted_at")
          .eq("team_id", tId);

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
        console.error("[LeadMessages] load error", e);
      } finally {
        if (!cancelled) setLoadingLead(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  // Load messages
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;
      if (!teamId || !leadId) {
        if (!cancelled) setLoadingMessages(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/crm/lead-messages?teamId=${encodeURIComponent(teamId)}&leadId=${encodeURIComponent(leadId)}`,
          { cache: "no-store" },
        );
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || !ct.includes("application/json"))
          throw new Error("messages_fetch_failed");

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

        if (!cancelled) setMessages(hydrated ?? []);
      } catch (e) {
        console.error("[LeadMessages] messages load error", e);
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, leadId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !leadId || !body.trim()) return;

    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const senderId = userRes.user?.id ?? null;

      const res = await fetch(
        `/api/crm/lead-messages?teamId=${encodeURIComponent(teamId)}&leadId=${encodeURIComponent(leadId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

      const created = (await res.json()) as LeadMessage;
      setMessages((prev) => [...prev, created]);
      setBody("");
      window.dispatchEvent(
        new CustomEvent("lead-message-logged", { detail: { teamId, leadId } }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (workspaceLoaded && !teamId) {
    return (
      <p className="text-sm text-slate-500">
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
      </p>
    );
  }

  const leadLabel = useMemo(() => {
    if (!lead) return "Lead in pipeline";

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
      : `Lead in “${lead.stage || "Pipeline"}” stage`;
  }, [lead]);

  const leadInitials = useMemo(
    () => initialsFromSingleString(leadLabel),
    [leadLabel],
  );

  const userFullName =
    `${currentUser?.first_name ?? ""} ${currentUser?.last_name ?? ""}`.trim() ||
    null;

  const timelineMessages = useMemo(() => {
    if (!lead) return [];

    const cleaned = (messages ?? []).filter((m) => !shouldHideFromTimeline(m));
    const sorted = [...cleaned].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
    );

    const alreadyHasLeadCreated = sorted.some(isLeadCreatedTimelineMessage);
    if (!alreadyHasLeadCreated) {
      sorted.push({
        id: `lead-created:${lead.id}`,
        direction: "outbound",
        channel: "pipeline",
        body: `LEAD_CREATED|${leadLabel}`,
        sent_at: lead.created_at,
        sender_profile_id: lead.prospector_id ?? null,
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

    return sorted;
  }, [messages, lead, leadLabel, creatorProfile, creatorAvatarUrl]);

  function formatBookingLinkTimelineBody(messageBody: string) {
    const slug = extractBookingSlugFromBody(messageBody);
    const name = slug ? bookingNameBySlug.get(slug) : null;
    return `Sent booking link: ${name || "Schedule page"}`;
  }

  const placeholder =
    direction === "outbound"
      ? "What did you send to this lead?"
      : messages.length
        ? "How did the lead respond?"
        : "What message did the lead send you?";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl space-y-6 pb-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900">
                Log Conversations for this Lead
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Track inbound/outbound so you always know the last touch.
              </p>
              {lead && (
                <p className="mt-2 text-xs text-slate-500">
                  Lead: <span className="font-medium">{leadLabel}</span> ·
                  Stage:{" "}
                  <span className="font-medium">
                    {lead.stage || "Unassigned"}
                  </span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(`/leads/${encodeURIComponent(leadId)}`)
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
            >
              Back to lead
            </button>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap gap-2">
            <select
              className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs cursor-pointer"
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>

            <select
              className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs cursor-pointer"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="dm">DM</option>
              <option value="sms">SMS</option>
              <option value="other">OTHER</option>
            </select>
          </div>

          <textarea
            className="h-28 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={placeholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Saving…" : "Log Message"}
            </button>
          </div>
        </form>

        {/* Timeline */}
        <div className="flex h-[520px] flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Activity Timeline
              </h2>
              <p className="text-xs text-slate-500">
                Messages + pipeline events.
              </p>
            </div>

            <button
              type="button"
              disabled={!leadId || !isUuid(leadId)}
              onClick={() =>
                router.push(`/leads/${encodeURIComponent(leadId)}`)
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              title="Open lead detail"
            >
              ↗
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingLead || loadingMessages ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : !lead ? (
              <p className="text-xs text-slate-500">Lead not found.</p>
            ) : timelineMessages.length === 0 ? (
              <p className="text-xs text-slate-500">No messages yet.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {timelineMessages.map((m) => {
                  const isOutbound = m.direction === "outbound";
                  const isPipeline =
                    (m.channel ?? "").toLowerCase() === "pipeline";
                  const bodyLower = (m.body ?? "").toLowerCase();

                  const isLeadCreated = isLeadCreatedTimelineMessage(m);
                  const isBookingLink =
                    isPipeline &&
                    (bodyLower.includes("booking link") ||
                      bodyLower.includes("/b/") ||
                      bodyLower.includes("schedule page"));
                  const isBookedCall = isPipeline && isBookedCallMessage(m);

                  const first = m.sender?.first_name ?? null;
                  const last = m.sender?.last_name ?? null;
                  const full = `${first ?? ""} ${last ?? ""}`.trim();

                  const authorName = isPipeline
                    ? isLeadCreated
                      ? full ||
                        `${creatorProfile?.first_name ?? ""} ${creatorProfile?.last_name ?? ""}`.trim() ||
                        "Prospector"
                      : "Setter"
                    : isOutbound
                      ? full || userFullName || "Team member"
                      : leadLabel;

                  const roleLabel = isPipeline
                    ? isLeadCreated
                      ? "Prospector"
                      : "Setter"
                    : isOutbound
                      ? "Setter"
                      : "Lead";

                  const avatarUrl = isOutbound
                    ? (m.sender?.avatar_url ?? userAvatarUrl ?? null)
                    : null;
                  const initials = isOutbound
                    ? initialsFromName(
                        first ?? currentUser?.first_name,
                        last ?? currentUser?.last_name,
                      )
                    : leadInitials;

                  const tsLabel = fmtMessageTimestamp(
                    m.sent_at,
                    viewerTz || "UTC",
                  );

                  const pipelineIcon = isLeadCreated
                    ? "/icons/new-lead.svg"
                    : isBookedCall
                      ? "/icons/booked-call.svg"
                      : isBookingLink
                        ? "/icons/booking-link.svg"
                        : "/icons/stage-change.svg";

                  const renderedBody = isLeadCreated
                    ? formatLeadCreatedBody(m.body, leadLabel)
                    : isBookedCall
                      ? formatBookedCallBody(m.body, viewerTz || "UTC")
                      : isBookingLink
                        ? formatBookingLinkTimelineBody(m.body)
                        : m.body;

                  return (
                    <div key={m.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {isPipeline ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pipelineIcon}
                            alt="Pipeline"
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarUrl}
                            alt={authorName}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${isOutbound ? "bg-indigo-600" : "bg-slate-500"}`}
                          >
                            {initials}
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1 min-w-0">
                              <span className="font-semibold text-slate-700 truncate">
                                {authorName}
                              </span>
                              <span className="text-slate-400 truncate">
                                · {roleLabel} · {formatChannel(m.channel)}
                              </span>
                            </span>
                            <span className="shrink-0">{tsLabel}</span>
                          </div>

                          <p className="whitespace-pre-wrap text-[11px] text-slate-800">
                            {renderedBody}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
