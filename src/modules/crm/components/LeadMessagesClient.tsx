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
  lead_name?: string | null; // ✅ real column (if your /api/crm/leads returns it)
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

/* -------------------- timezone helpers (Luxon) -------------------- */

function readBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function fmtMessageTimestamp(iso: string, zone: string) {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  if (!dt.isValid) return iso;
  return dt.toLocaleString(DateTime.DATETIME_SHORT);
}

function floorIsoToMinute(iso: string): string {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) return iso;
  return dt.set({ second: 0, millisecond: 0 }).toUTC().toISO({ suppressMilliseconds: true }) || iso;
}

/* -------------------- small helpers -------------------- */

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function initialsFromName(first?: string | null, last?: string | null) {
  const f = first?.trim()?.charAt(0).toUpperCase();
  const l = last?.trim()?.charAt(0).toUpperCase();
  if (f && l) return `${f}${l}`;
  if (f) return f;
  if (l) return l;
  return "U";
}

function initialsFromSingleString(label: string) {
  const parts = label.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0]?.charAt(0).toUpperCase() || "L") + (parts[1]?.charAt(0).toUpperCase() || "");
}

function formatChannel(c: string | null): string {
  if (!c) return "DM";
  return c.toUpperCase();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/* -------------------- NEW: lead-created timeline helpers -------------------- */

function isLeadCreatedTimelineMessage(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;

  const body = String(m.body ?? "").toLowerCase();
  return body.startsWith("lead_created|") || body.startsWith("lead created|") || body.includes("new lead");
}

function formatLeadCreatedBody(body: string, leadLabel: string) {
  const raw = String(body || "");
  const parts = raw.split("|");
  const labelFromBody = (parts[1] ?? "").trim();
  const label = labelFromBody || leadLabel;
  return `New lead added: ${label}`;
}

/* -------------------- BOOKED CALL parsing helpers (same as LeadDetail) -------------------- */

type BookedCallParse = { kind: "canonical" | "iso" | "wall"; start: DateTime; end: DateTime };

function extractBookedCallRange(body: string): {
  kind: "instant" | "wall";
  startRaw: string;
  endRaw: string;
  tz: string | null;
  source: "canonical" | "iso" | "wall";
} | null {
  const s = body || "";

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

  const iso = s.match(
    /(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))\s*(?:→|—|–|-)\s*(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))(?:\s*\(([^)]+)\))?/i
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

  const wall = s.match(
    /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*(?:→|—|–|-)\s*(\d{2}:\d{2})(?:\s*\(([^)]+)\))?/i
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

    return { kind: parsed.source === "canonical" ? "canonical" : "iso", start: s, end: e };
  }

  const s = DateTime.fromFormat(parsed.startRaw, "yyyy-MM-dd HH:mm", { zone: sourceZone });
  const e = DateTime.fromFormat(parsed.endRaw, "yyyy-MM-dd HH:mm", { zone: sourceZone });
  if (!s.isValid || !e.isValid) return null;

  return { kind: "wall", start: s, end: e };
}

function bookedCallQualityScore(kind: BookedCallParse["kind"]): number {
  if (kind === "canonical") return 3;
  if (kind === "iso") return 2;
  return 1;
}

function bookedCallGroupKey(m: LeadMessage): string | null {
  const body = m.body || "";

  const canonical = body.match(/BOOKED_CALL\|([^|]+)\|([^|]+)(?:\|([^|]+))?/i);
  if (canonical) {
    const s = canonical[1].trim();
    const e = canonical[2].trim();
    const tz = (canonical[3] || "").trim();
    return `BOOKED_CALL|${s}|${e}|${tz}`;
  }

  const parsed = parseBookedCall(body);
  if (parsed && parsed.kind === "iso") {
    const sUTC = parsed.start.toUTC().toISO({ suppressMilliseconds: true });
    const eUTC = parsed.end.toUTC().toISO({ suppressMilliseconds: true });
    return `UTC|${sUTC}|${eUTC}`;
  }

  if (parsed && parsed.kind === "wall") {
    const bucket = floorIsoToMinute(m.sent_at);
    return `WALL_BATCH|${bucket}`;
  }

  return null;
}

function formatBookedCallBody(body: string, viewerTz: string) {
  const parsed = parseBookedCall(body);
  if (!parsed) return body;

  const targetZone = viewerTz || "UTC";
  const startLocal = parsed.start.setZone(targetZone);
  const endLocal = parsed.end.setZone(targetZone);

  const dateLabel = startLocal.toLocaleString({ weekday: "short", month: "short", day: "numeric" });
  const startTime = startLocal.toLocaleString(DateTime.TIME_SIMPLE);
  const endTime = endLocal.toLocaleString(DateTime.TIME_SIMPLE);

  return `Call booked for ${dateLabel} · ${startTime} – ${endTime}`;
}

/* -------------------- Timeline filters (same intent as LeadDetail) -------------------- */

function shouldHideFromTimeline(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;
  const body = (m.body ?? "").toLowerCase();
  return body.includes("call booked for") && body.includes("calendar event");
}

function isBookedCallMessage(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;
  const body = (m.body ?? "").toLowerCase();
  return body.includes("booked a call") || body.includes("call booked for") || body.includes("booked_call|");
}

function isVerboseCalendarVersion(m: LeadMessage) {
  const body = (m.body ?? "").toLowerCase();
  return body.includes("calendar event") || body.includes("calendar event:") || body.includes("event:");
}

function prefersThisBookedCallMessage(m: LeadMessage) {
  return isBookedCallMessage(m) && !isVerboseCalendarVersion(m);
}

/* -------------------- booking-link helpers (same intent as LeadDetail) -------------------- */

function extractBookingSlugFromBody(body: string): string | null {
  const s = String(body || "");
  const m = s.match(/\/b\/([a-z0-9_-]+)/i);
  return m?.[1] ? String(m[1]).trim() : null;
}

/* -------------------- client -------------------- */

export function LeadMessagesClient() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const leadId = useMemo(() => safeDecode(String(id ?? "")).trim(), [id]);

  // workspace / team
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // viewer timezone (same behavior as LeadDetail)
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
        { maximumAge: 60_000, timeout: 7_000 }
      );
    }

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // current user (fallback author for outbound if API doesn't include sender)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  // creator / prospector (for injected lead-created)
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(null);
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);

  // form state
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [channel, setChannel] = useState("dm");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  // (optional) schedule-page name map for nicer “Sent booking link …”
  const [bookingNameBySlug, setBookingNameBySlug] = useState<Map<string, string>>(new Map());

  /* ---------- avatar url resolver (match LeadDetail behavior) ---------- */
  async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

    // keep same as LeadDetail (public url)
    const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
    return data?.publicUrl ?? null;
  }

  /* ---------- 1) Load teamId from Supabase ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (!cancelled) {
            setTeamId(null);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[LeadMessages] Failed to load profile", profileError);
        }

        let tId: string | null = profile?.team_id ?? null;

        // fallback to metadata.primary_team_id
        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) tId = metaTeam;
        }

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[LeadMessages] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 2) Load lead + creator + booking links + current user ---------- */
  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId || cancelled) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url")
          .eq("id", userId)
          .single();

        if (error) {
          console.error("[LeadMessages] Failed to load user profile", error);
          return;
        }

        if (cancelled) return;

        const profile: UserProfile = {
          id: data?.id ?? userId,
          first_name: data?.first_name ?? null,
          last_name: data?.last_name ?? null,
          avatar_url: data?.avatar_url ?? null,
        };

        setCurrentUser(profile);

        const signed = await resolveAvatarUrl(profile.avatar_url);
        if (!cancelled) setUserAvatarUrl(signed);
      } catch (err) {
        console.error("[LeadMessages] Failed to load current user", err);
      }
    }

    async function loadLeadAndCreator() {
      if (!workspaceLoaded) return;
      if (!teamId || !leadId) {
        if (!cancelled) setLoadingLead(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(leadId)}`,
          { cache: "no-store" }
        );
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || !ct.includes("application/json")) {
          console.error("[LeadMessages] Failed to load lead", res.status, ct, await res.text().catch(() => ""));
          if (!cancelled) setLoadingLead(false);
          return;
        }

        const leadRes = (await res.json()) as LeadSummary;

        if (cancelled) return;
        setLead(leadRes);

        // load creator/prospector for injected lead-created event
        setCreatorProfile(null);
        setCreatorAvatarUrl(null);

        if (leadRes.prospector_id) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", leadRes.prospector_id)
            .maybeSingle();

          if (error) {
            console.error("[LeadMessages] Failed to load creator profile", error);
          } else if (!cancelled && data) {
            const prof: UserProfile = {
              id: data.id,
              first_name: data.first_name ?? null,
              last_name: data.last_name ?? null,
              avatar_url: data.avatar_url ?? null,
            };
            setCreatorProfile(prof);

            const signed = await resolveAvatarUrl(prof.avatar_url);
            if (!cancelled) setCreatorAvatarUrl(signed);
          }
        }
      } catch (err) {
        console.error("[LeadMessages] Failed to load lead", err);
      } finally {
        if (!cancelled) setLoadingLead(false);
      }
    }

    async function loadBookingLinkNames() {
      // optional, but lets us show “Sent booking link: {Schedule page name}”
      if (!workspaceLoaded) return;
      if (!teamId) return;

      try {
        const { data, error } = await supabase
          .from("booking_links")
          .select("slug, name, deleted_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });

        if (error) return;

        const m = new Map<string, string>();
        (data ?? [])
          .filter((r: any) => !r.deleted_at)
          .forEach((r: any) => {
            const slug = String(r.slug || "").trim();
            const name = String(r.name || "").trim();
            if (slug) m.set(slug, name || slug);
          });

        if (!cancelled) setBookingNameBySlug(m);
      } catch {
        // ignore
      }
    }

    loadCurrentUser();
    loadLeadAndCreator();
    loadBookingLinkNames();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, leadId]);

  /* ---------- 3) Load messages (hydrate sender avatars like LeadDetail) ---------- */
  useEffect(() => {
    let cancelled = false;

    async function fetchMessages(activeTeamId: string, activeLeadId: string) {
      const res = await fetch(
        `/api/crm/lead-messages?teamId=${encodeURIComponent(activeTeamId)}&leadId=${encodeURIComponent(activeLeadId)}`,
        { cache: "no-store" }
      );

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        console.error("[LeadMessages] /api/crm/lead-messages error", res.status, ct, await res.text().catch(() => ""));
        throw new Error("Failed to load messages");
      }
      if (!ct.includes("application/json")) {
        console.error("[LeadMessages] /api/crm/lead-messages returned non-JSON", res.status, ct);
        throw new Error("Messages API did not return JSON");
      }

      const data = (await res.json()) as LeadMessage[];

      // if API includes sender.avatar_url as storage path, resolve to public URL
      const withResolvedAvatars: LeadMessage[] = await Promise.all(
        (data ?? []).map(async (m) => {
          if (m.sender?.avatar_url) {
            const resolved = await resolveAvatarUrl(m.sender.avatar_url);
            return { ...m, sender: { ...m.sender, avatar_url: resolved } };
          }
          return m;
        })
      );

      return withResolvedAvatars;
    }

    (async () => {
      if (!workspaceLoaded) return;
      if (!teamId || !leadId) {
        if (!cancelled) setLoadingMessages(false);
        return;
      }

      try {
        const loaded = await fetchMessages(teamId, leadId);
        if (!cancelled) setMessages(loaded ?? []);
      } catch (err) {
        console.error("[LeadMessages] Failed to load messages", err);
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, leadId]);

  /* ---------- submit ---------- */

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
        }
      );

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/json")) {
        console.error("[LeadMessages] Failed to create message", res.status, ct, await res.text().catch(() => ""));
        return;
      }

      const created = (await res.json()) as LeadMessage;

      // local optimistic append (API may not include sender object; timeline code falls back)
      setMessages((prev) => [...prev, created]);
      setBody("");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lead-message-logged", { detail: { teamId, leadId } }));
      }
    } catch (err) {
      console.error("[LeadMessages] Failed to create message", err);
    } finally {
      setSaving(false);
    }
  }

  /* ---------- early return if no team ---------- */

  if (workspaceLoaded && !teamId) {
    return (
      <p className="text-sm text-slate-500">
        You don&apos;t seem to be in any team yet. Open this page from a workspace, or complete onboarding first.
      </p>
    );
  }

  /* ---------- derived values ---------- */

  const leadLabel: string = useMemo(() => {
    if (!lead) return "Lead in pipeline";

    // ✅ prefer real column if present
    const direct = String((lead as any)?.lead_name ?? "").trim();
    if (direct) return direct;

    const cv = lead.custom_values ?? {};
    const legacy = String((cv as any).lead_name ?? "").trim();
    if (legacy) return legacy;

    const preferredKeys = ["name", "full_name", "first_name", "last_name", "company", "account", "email"];
    const lowerEntries = Object.entries(cv).map(([k, v]) => [k.toLowerCase(), v] as const);

    for (const pref of preferredKeys) {
      const match = lowerEntries.find(
        ([key, value]) => key.includes(pref) && value != null && String(value).trim() !== ""
      );
      if (match) return String(match[1]).trim();
    }

    const anyField = lowerEntries.find(([, value]) => value != null && String(value).trim() !== "");
    if (anyField) return String(anyField[1]).trim();

    const stageLabel = lead.stage || "Pipeline";
    return `Lead in “${stageLabel}” stage`;
  }, [lead]);

  const leadInitials = useMemo(() => initialsFromSingleString(leadLabel), [leadLabel]);

  const userFullName =
    (currentUser?.first_name || currentUser?.last_name) &&
    `${currentUser?.first_name ?? ""} ${currentUser?.last_name ?? ""}`.trim();

  const userInitials = initialsFromName(currentUser?.first_name, currentUser?.last_name);

  const creatorFullName =
    (creatorProfile?.first_name || creatorProfile?.last_name) &&
    `${creatorProfile?.first_name ?? ""} ${creatorProfile?.last_name ?? ""}`.trim();

  /* -------------------- booking-link timeline text -------------------- */

  function formatBookingLinkTimelineBody(messageBody: string): string {
    const slug = extractBookingSlugFromBody(messageBody);
    const name = slug ? bookingNameBySlug.get(slug) : null;
    return `Sent booking link: ${name || "Schedule page"}`;
  }

  /* ---------- timeline: match LeadDetail rendering + grouping + injected lead-created at bottom ---------- */

  const timelineMessages: LeadMessage[] = useMemo(() => {
    if (!lead) return [];

    const cleaned = (messages ?? []).filter((m) => !shouldHideFromTimeline(m));

    // newest first
    const sorted = [...cleaned].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

    // group booked-call variants
    const bookedGroups = new Map<string, LeadMessage[]>();
    const passthrough: LeadMessage[] = [];

    for (const m of sorted) {
      if (!isBookedCallMessage(m)) {
        passthrough.push(m);
        continue;
      }
      const key = bookedCallGroupKey(m) ?? `fallback:${m.id}`;
      const list = bookedGroups.get(key) ?? [];
      list.push(m);
      bookedGroups.set(key, list);
    }

    const chosenBooked: LeadMessage[] = [];

    for (const [, group] of bookedGroups) {
      const candidates = group.slice().sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

      const scored = candidates.map((m) => {
        const p = parseBookedCall(m.body || "");
        const quality = p ? bookedCallQualityScore(p.kind) : 0;
        const preferred = prefersThisBookedCallMessage(m) ? 1 : 0;
        const sent = new Date(m.sent_at).getTime();
        return { m, preferred, quality, sent };
      });

      scored.sort((x, y) => {
        if (y.preferred !== x.preferred) return y.preferred - x.preferred;
        if (y.quality !== x.quality) return y.quality - x.quality;
        return y.sent - x.sent;
      });

      chosenBooked.push(scored[0].m);
    }

    const finalList = [...passthrough, ...chosenBooked].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );

    const alreadyHasLeadCreated = finalList.some(isLeadCreatedTimelineMessage);

    if (!alreadyHasLeadCreated) {
      const leadCreatedEvent: LeadMessage = {
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
      };

      // ✅ appears at the very bottom (end of list)
      finalList.push(leadCreatedEvent);
    }

    return finalList;
  }, [messages, lead, leadLabel, creatorProfile, creatorAvatarUrl]);

  /* ---------- UI placeholders ---------- */

  const hasHistory = (messages ?? []).length > 0;
  const placeholder =
    direction === "outbound" ? "What did you send to this lead?" : hasHistory ? "How did the lead respond?" : "What message did the lead send you?";

  const leadCreatedLabel = useMemo(() => {
    if (!lead?.created_at) return null;
    const dt = DateTime.fromISO(lead.created_at, { setZone: true }).setZone(viewerTz || "UTC");
    return dt.isValid ? dt.toLocaleString(DateTime.DATETIME_SHORT) : lead.created_at;
  }, [lead?.created_at, viewerTz]);

  /* -------------------- render -------------------- */

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl space-y-6 pb-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900">Log Conversations for this Lead</h1>
              <p className="mt-1 text-sm text-slate-600">Track outbound and inbound conversations so you always know the last touch.</p>

              {lead && (
                <p className="mt-2 text-xs text-slate-500">
                  Lead: <span className="font-medium">{leadLabel}</span> · Stage:{" "}
                  <span className="font-medium">{lead.stage || "Unassigned"}</span>
                  {leadCreatedLabel ? <span className="text-slate-400"> · Created {leadCreatedLabel}</span> : null}
                </p>
              )}
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => router.push(`/leads/${encodeURIComponent(leadId)}`)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
              >
                Back to lead
              </button>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <select
              className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>

            <select className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" value={channel} onChange={(e) => setChannel(e.target.value)}>
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
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Log message"}
            </button>
          </div>
        </form>

        {/* Activity Timeline (styled like LeadDetail) */}
        <div className="flex h-[520px] flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Activity Timeline</h2>
              <p className="text-xs text-slate-500">Lead creation, stage changes, and messages in one view.</p>
            </div>

            <button
              type="button"
              disabled={!leadId || !isUuid(leadId)}
              onClick={() => router.push(`/leads/${encodeURIComponent(leadId)}`)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              title="Open lead detail"
            >
              ↗
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loadingLead || loadingMessages ? (
              <div className="space-y-3 animate-pulse">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="h-8 w-8 rounded-full bg-slate-100" />
                    <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="space-y-2">
                          <div className="h-3 w-44 rounded bg-slate-100" />
                          <div className="h-3 w-32 rounded bg-slate-100" />
                        </div>
                        <div className="h-3 w-24 rounded bg-slate-100" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 w-full rounded bg-slate-100" />
                        <div className="h-3 w-2/3 rounded bg-slate-100" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !lead ? (
              <p className="text-xs text-slate-500">Lead not found.</p>
            ) : timelineMessages.length === 0 ? (
              <p className="text-xs text-slate-500">No messages yet.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {timelineMessages.map((m) => {
                  const isOutbound = m.direction === "outbound";
                  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";

                  const bodyLower = (m.body ?? "").toLowerCase();

                  const isBookingLinkEvent =
                    isPipeline && (bodyLower.includes("booking link") || bodyLower.includes("/b/") || bodyLower.includes("schedule page"));

                  const isBookedCallEvent =
                    isPipeline && (bodyLower.includes("booked a call") || bodyLower.includes("call booked for") || bodyLower.includes("booked_call|"));

                  const isLeadCreatedEvent = isLeadCreatedTimelineMessage(m);

                  const first = m.sender?.first_name ?? null;
                  const last = m.sender?.last_name ?? null;
                  const fullName = `${first ?? ""} ${last ?? ""}`.trim();

                  const prospectorName =
                    fullName || `${creatorProfile?.first_name ?? ""} ${creatorProfile?.last_name ?? ""}`.trim() || "Prospector";

                  // author labels like LeadDetail
                  const authorName = isPipeline
                    ? isLeadCreatedEvent
                      ? prospectorName
                      : "Setter"
                    : isOutbound
                    ? fullName || userFullName || "Team member"
                    : leadLabel;

                  const roleLabel = isPipeline ? (isLeadCreatedEvent ? "Prospector" : "Setter") : isOutbound ? "Setter" : "Lead";

                  // avatar logic like LeadDetail
                  const avatarUrl = isOutbound ? (m.sender?.avatar_url ?? userAvatarUrl ?? null) : null;
                  const initials = isOutbound ? initialsFromName(first ?? currentUser?.first_name, last ?? currentUser?.last_name) : leadInitials;

                  const tsLabel = fmtMessageTimestamp(m.sent_at, viewerTz || "UTC");

                  // choose pipeline icon like LeadDetail
                  const pipelineIconSrc = isLeadCreatedEvent
                    ? "/icons/new-lead.svg"
                    : isBookedCallEvent
                    ? "/icons/booked-call.svg"
                    : isBookingLinkEvent
                    ? "/icons/booking-link.svg"
                    : "/icons/stage-change.svg";

                  const pipelineIconAlt = isLeadCreatedEvent
                    ? "New lead"
                    : isBookedCallEvent
                    ? "Call booked"
                    : isBookingLinkEvent
                    ? "Booking link sent"
                    : "Pipeline activity";

                  const renderedBody = isLeadCreatedEvent
                    ? formatLeadCreatedBody(m.body, leadLabel)
                    : isBookedCallEvent
                    ? formatBookedCallBody(m.body, viewerTz || "UTC")
                    : isBookingLinkEvent
                    ? formatBookingLinkTimelineBody(m.body)
                    : m.body;

                  return (
                    <div key={m.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {isPipeline ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pipelineIconSrc}
                            alt={pipelineIconAlt}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl} alt={authorName} className="h-8 w-8 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                              isOutbound ? "bg-indigo-600" : "bg-slate-500"
                            }`}
                          >
                            {initials}
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1 min-w-0">
                              <span className="font-semibold text-slate-700 truncate">{authorName}</span>
                              <span className="text-slate-400 truncate">
                                · {roleLabel} · {formatChannel(m.channel)}
                              </span>
                            </span>
                            <span className="shrink-0">{tsLabel}</span>
                          </div>

                          <p className="whitespace-pre-wrap text-[11px] text-slate-800">{renderedBody}</p>
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
