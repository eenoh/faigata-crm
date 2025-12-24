"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

interface LeadData {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
  created_at: string;
  prospector_id?: string | null;
  notes?: string | null;
  score?: number | null;
  score_grade?: string | null;
  score_breakdown?:
    | {
        ruleId: string;
        label: string;
        points: number;
      }[]
    | null;
  score_updated_at?: string | null;
}

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

type ScoreThresholds = { low: number; high: number };

type CreatorProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type BookingType = "one_on_one" | "group" | "round_robin";

type BookingLinkRow = {
  id: string;
  name: string;
  slug: string;
  booking_type: BookingType | null;
  owner_user_id: string | null;
  owner_name: string; // computed
  deleted_at?: string | null; // ✅ soft delete marker
};

type LeadDetailClientProps = {
  leadId?: string; // optional (can be wired via page params OR props)
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

async function fetchLead(teamId: string, leadId: string): Promise<LeadData | null> {
  const res = await fetch(
    `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(leadId)}`,
    { cache: "no-store" }
  );

  const ct = res.headers.get("content-type") ?? "";

  if (!res.ok || !ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    console.error(
      "[LeadDetail] leads API failed",
      res.status,
      ct,
      text.slice(0, 300)
    );
    return null;
  }

  const json = await res.json().catch(() => null);
  return (json ?? null) as LeadData | null;
}

async function fetchScoreConfig(teamId: string): Promise<ScoreThresholds | null> {
  const res = await fetch("/api/crm/lead-scoring-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, action: "get" }),
  });

  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("application/json")) return null;

  const json = await res.json().catch(() => ({} as any));
  const low = Number(json.thresholds?.low);
  const high = Number(json.thresholds?.high);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;

  return { low, high };
}

/* -------------------- loading UI (page skeleton) -------------------- */

function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-3 ${w} rounded bg-slate-100`} />;
}

function SkeletonPill({ w = "w-24" }: { w?: string }) {
  return <div className={`h-6 ${w} rounded-full bg-slate-100`} />;
}

function SkeletonButton({ w = "w-24" }: { w?: string }) {
  return <div className={`h-8 ${w} rounded-lg bg-slate-100`} />;
}

function LeadDetailPageSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)] animate-pulse">
        {/* LEFT skeleton */}
        <div className="space-y-6 pb-6">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="h-7 w-44 rounded bg-slate-100" />
              <div className="mt-2 space-y-2">
                <SkeletonLine w="w-72" />
                <SkeletonLine w="w-56" />
              </div>
            </div>

            <div className="flex gap-2">
              <SkeletonButton w="w-28" />
              <SkeletonButton w="w-16" />
              <SkeletonButton w="w-16" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <div className="mb-3 h-4 w-24 rounded bg-slate-100" />
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <SkeletonLine w="w-44" />
                <SkeletonLine w="w-60" />
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 h-3 w-28 rounded bg-slate-100" />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <SkeletonLine w="w-48" />
                  <SkeletonLine w="w-10" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <SkeletonLine w="w-40" />
                  <SkeletonLine w="w-10" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <SkeletonLine w="w-52" />
                  <SkeletonLine w="w-10" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <div className="mb-3 h-4 w-28 rounded bg-slate-100" />
            <SkeletonPill w="w-28" />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <div className="mb-3 h-4 w-24 rounded bg-slate-100" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <SkeletonLine w="w-24" />
                  <SkeletonLine
                    w={i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-52" : "w-36"}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT skeleton */}
        <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <div className="h-4 w-36 rounded bg-slate-100" />
              <div className="mt-2 space-y-2">
                <SkeletonLine w="w-64" />
                <SkeletonLine w="w-48" />
              </div>
            </div>

            <div className="h-7 w-7 rounded-full bg-slate-100" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex h-8 w-8 items-center justify-center">
                    <div className="h-8 w-8 rounded-full bg-slate-100" />
                  </div>

                  <div className="flex-1">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <SkeletonLine w={i % 2 === 0 ? "w-56" : "w-44"} />
                          <SkeletonLine w={i % 2 === 0 ? "w-36" : "w-52"} />
                        </div>
                        <SkeletonLine w="w-24" />
                      </div>

                      <div className="space-y-2">
                        <SkeletonLine w="w-full" />
                        <SkeletonLine w={i % 3 === 0 ? "w-5/6" : "w-2/3"} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  return (
    dt
      .set({ second: 0, millisecond: 0 })
      .toUTC()
      .toISO({ suppressMilliseconds: true }) || iso
  );
}

export function LeadDetailClient({ leadId }: LeadDetailClientProps) {
  const router = useRouter();
  const normalizedLeadId = useMemo(
    () => safeDecode(String(leadId ?? "")).trim(),
    [leadId]
  );

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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasLeadId = normalizedLeadId.length > 0;
  const leadIdIsUuid = useMemo(() => isUuid(normalizedLeadId), [normalizedLeadId]);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [thresholds, setThresholds] = useState<ScoreThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  // kept (creator is used elsewhere in your app — leaving as-is)
  const [creator, setCreator] = useState<CreatorProfile | null>(null);

  const [bookingLinks, setBookingLinks] = useState<BookingLinkRow[]>([]);
  const [bookingLinksLoading, setBookingLinksLoading] = useState(false);
  const [bookingLinksError, setBookingLinksError] = useState<string | null>(null);

  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  // ✅ ACTIVE ONLY (soft-deleted schedule pages are not selectable)
  const activeBookingLinks = useMemo(
    () => (bookingLinks ?? []).filter((b) => !b.deleted_at),
    [bookingLinks]
  );

  async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
    if (!raw) return null;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const { data } = supabase.storage.from("avatars").getPublicUrl(raw);
    return data?.publicUrl ?? null;
  }

  function initialsFromName(first?: string | null, last?: string | null) {
    const f = first?.trim()?.charAt(0).toUpperCase();
    const l = last?.trim()?.charAt(0).toUpperCase();
    if (f && l) return `${f}${l}`;
    if (f) return f;
    if (l) return l;
    return "U";
  }

  /* -------------------- BOOKED CALL: parsing + rendering + dedupe -------------------- */

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

    // 0) Canonical pipeline format (preferred)
    // BOOKED_CALL|<startISO>|<endISO>|<optionalTZ>
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

    // 1) ISO range
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

    // 2) Wall-clock range (legacy)
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
      // Respect offsets/Z when present; if tz exists but no offset, interpret in tz.
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

    // wall clock (legacy)
    const s = DateTime.fromFormat(parsed.startRaw, "yyyy-MM-dd HH:mm", {
      zone: sourceZone,
    });
    const e = DateTime.fromFormat(parsed.endRaw, "yyyy-MM-dd HH:mm", {
      zone: sourceZone,
    });
    if (!s.isValid || !e.isValid) return null;

    return { kind: "wall", start: s, end: e };
  }

  function bookedCallQualityScore(kind: BookedCallParse["kind"]): number {
    if (kind === "canonical") return 3;
    if (kind === "iso") return 2;
    return 1; // wall
  }

  function bookedCallGroupKey(m: LeadMessage): string | null {
    const body = m.body || "";

    // If canonical exists, group by canonical token contents (best)
    const canonical = body.match(/BOOKED_CALL\|([^|]+)\|([^|]+)(?:\|([^|]+))?/i);
    if (canonical) {
      const s = canonical[1].trim();
      const e = canonical[2].trim();
      const tz = (canonical[3] || "").trim();
      return `BOOKED_CALL|${s}|${e}|${tz}`;
    }

    // If ISO instants exist, group by normalized UTC instants
    const parsed = parseBookedCall(body);
    if (parsed && parsed.kind === "iso") {
      const sUTC = parsed.start.toUTC().toISO({ suppressMilliseconds: true });
      const eUTC = parsed.end.toUTC().toISO({ suppressMilliseconds: true });
      return `UTC|${sUTC}|${eUTC}`;
    }

    // Legacy wall-clock: group by the write-batch moment (sent_at floored to minute)
    if (parsed && parsed.kind === "wall") {
      const bucket = floorIsoToMinute(m.sent_at);
      return `WALL_BATCH|${bucket}`;
    }

    return null;
  }

  function formatBookedCallBody(body: string) {
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

  /* -------------------- misc helpers -------------------- */

  function initialsFromSingleString(label: string) {
    const parts = label.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      (parts[0]?.charAt(0).toUpperCase() || "L") +
      (parts[1]?.charAt(0).toUpperCase() || "")
    );
  }

  function formatChannel(c: string | null): string {
    if (!c) return "DM";
    return c.toUpperCase();
  }

  function getScoreGrade(score: number | null) {
    if (score == null)
      return {
        label: "Unscored",
        short: "?",
        circle: "bg-slate-100 text-slate-500",
      };
    if (!thresholds)
      return { label: "Scored", short: "S", circle: "bg-amber-100 text-amber-800" };
    const { low, high } = thresholds;
    if (score < low)
      return { label: "Low", short: "L", circle: "bg-rose-100 text-rose-800" };
    if (score >= high)
      return { label: "High", short: "H", circle: "bg-emerald-100 text-emerald-800" };
    return { label: "Medium", short: "M", circle: "bg-amber-100 text-amber-800" };
  }

  function typeClasses(t: BookingType | null) {
    switch (t) {
      case "one_on_one":
        return "bg-indigo-50 text-indigo-700 ring-indigo-200";
      case "group":
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";
      case "round_robin":
        return "bg-amber-50 text-amber-800 ring-amber-200";
      default:
        return "bg-slate-100 text-slate-700 ring-slate-200";
    }
  }

  function formatType(t: BookingType | null): string {
    switch (t) {
      case "one_on_one":
        return "1:1";
      case "group":
        return "Group";
      case "round_robin":
        return "Round robin";
      default:
        return "—";
    }
  }

  function hostLabelForLink(link: BookingLinkRow) {
    if (link.booking_type === "round_robin") return "Round robin";
    return link.owner_name || "Host";
  }

  async function fetchMessages(activeTeamId: string, activeLeadId: string) {
    const res = await fetch(
      `/api/crm/lead-messages?teamId=${encodeURIComponent(activeTeamId)}&leadId=${encodeURIComponent(activeLeadId)}`
    );

    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[LeadDetail] /api/crm/lead-messages error",
        res.status,
        ct,
        text.slice(0, 400)
      );
      throw new Error("Failed to load messages");
    }
    if (!ct.includes("application/json")) {
      const text = await res.text();
      console.error(
        "[LeadDetail] /api/crm/lead-messages returned non-JSON",
        res.status,
        ct,
        text.slice(0, 400)
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
      })
    );
    return withResolvedAvatars;
  }

  function shouldHideFromTimeline(m: LeadMessage) {
    const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
    if (!isPipeline) return false;

    const body = (m.body ?? "").toLowerCase();
    const isVerboseBookedCall = body.includes("call booked for") && body.includes("calendar event");
    return isVerboseBookedCall;
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

  /* ---------- 1) Load teamId ---------- */
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

        const userId = userRes.user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .single();

        let tId: string | null = profile?.team_id ?? null;

        if (!tId) {
          const metaTeam = (userRes.user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) tId = metaTeam;
        }

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
        }

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[LeadDetail] Failed to load profile", profileError);
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load workspace context", err);
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

  /* ---------- 2) Load lead ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      if (!teamId) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!hasLeadId) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setLoading(true);

      try {
        const [defs, leadRes, configRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          fetchLead(teamId, normalizedLeadId),
          fetchScoreConfig(teamId),
        ]);

        if (cancelled) return;

        setFields(defs);
        setThresholds(configRes);

        if (!leadRes) {
          setLead(null);
          setCreator(null);
          return;
        }

        setLead(leadRes);

        setCreator(null);
        if (leadRes.prospector_id) {
          const { data: creatorProfile, error: creatorError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", leadRes.prospector_id)
            .maybeSingle();

          if (!cancelled && !creatorError && creatorProfile) {
            const signedAvatar = await resolveAvatarUrl(creatorProfile.avatar_url);
            if (!cancelled) setCreator({ ...creatorProfile, avatar_url: signedAvatar });
          } else if (creatorError) {
            console.error("[LeadDetail] Failed to load creator profile", creatorError);
          }
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load lead detail", err);
        if (!cancelled) {
          setLead(null);
          setCreator(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, hasLeadId, normalizedLeadId]);

  /* ---------- 3) Load messages ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      if (!teamId) {
        if (!cancelled) setMessagesLoading(false);
        return;
      }
      if (!hasLeadId) {
        if (!cancelled) setMessagesLoading(false);
        return;
      }

      try {
        const loaded = await fetchMessages(teamId, normalizedLeadId);
        if (!cancelled) setMessages(loaded);
      } catch (err) {
        console.error("[LeadDetail] Failed to load messages", err);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, hasLeadId, normalizedLeadId]);

  /* ---------- 4) Load booking links ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;
      if (!teamId) return;

      try {
        setBookingLinksLoading(true);
        setBookingLinksError(null);

        // ✅ include deleted_at so we can filter soft-deleted pages
        const { data, error } = await supabase
          .from("booking_links")
          .select("id, name, slug, booking_type, owner_user_id, deleted_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[LeadDetail] booking_links load error:", error);
          if (!cancelled) setBookingLinksError("Failed to load booking links.");
          return;
        }

        const rows = (data ?? []) as {
          id: string;
          name: string;
          slug: string;
          booking_type: BookingType | null;
          owner_user_id: string | null;
          deleted_at: string | null;
        }[];

        const ownerIds = Array.from(
          new Set(rows.map((r) => r.owner_user_id).filter(Boolean) as string[])
        );

        const ownerMap = new Map<string, string>();
        if (ownerIds.length) {
          const { data: owners, error: ownerErr } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", ownerIds);

          if (ownerErr) {
            console.error("[LeadDetail] owners load error:", ownerErr);
          } else {
            (owners ?? []).forEach((p: any) => {
              const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
              ownerMap.set(p.id, full || "Host");
            });
          }
        }

        const hydrated: BookingLinkRow[] = rows.map((r) => ({
          ...r,
          owner_name: r.owner_user_id
            ? ownerMap.get(r.owner_user_id) ?? "Host"
            : "Host",
        }));

        if (!cancelled) setBookingLinks(hydrated);
      } catch (e) {
        console.error("[LeadDetail] booking_links load unexpected:", e);
        if (!cancelled) setBookingLinksError("Failed to load booking links.");
      } finally {
        if (!cancelled) setBookingLinksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId]);

  async function createBookingInvite(bookingLinkId: string) {
    if (!leadIdIsUuid) {
      setInviteError("Invalid lead id (expected UUID).");
      return;
    }
    if (!isUuid(bookingLinkId)) {
      setInviteError("Invalid booking link id.");
      return;
    }

    // ✅ client-side guard: prevent selecting soft-deleted links even if UI changes
    const selected = bookingLinks.find((b) => b.id === bookingLinkId);
    if (selected?.deleted_at) {
      setInviteError("That schedule page was deleted and can’t be used.");
      return;
    }

    setInviteLoadingId(bookingLinkId);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(normalizedLeadId)}/booking-invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingLinkId }),
        }
      );

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(json?.error || `invite_failed_${res.status}`);

      const relativeUrl = String(json?.url || "");
      if (!relativeUrl) throw new Error("invite_missing_url");

      const fullUrl = `${window.location.origin}${relativeUrl}`;
      setLastInviteUrl(fullUrl);

      try {
        await navigator.clipboard.writeText(fullUrl);
        setInviteSuccess("Booking link copied to clipboard.");
      } catch {
        setInviteSuccess("Booking link created (copy manually below).");
      }

      if (teamId) {
        setMessagesLoading(true);
        try {
          const loaded = await fetchMessages(teamId, normalizedLeadId);
          setMessages(loaded);
        } finally {
          setMessagesLoading(false);
        }
      }
    } catch (e: any) {
      setInviteError(String(e?.message ?? "Failed to create booking link"));
    } finally {
      setInviteLoadingId(null);
    }
  }

  useEffect(() => {
    if (!isBookingModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsBookingModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBookingModalOpen]);

  useEffect(() => {
    if (!isBookingModalOpen) return;
    setInviteError(null);
    setInviteSuccess(null);
  }, [isBookingModalOpen]);

  const leadLabel: string = useMemo(() => {
    if (!lead) return "Lead in pipeline";

    const cv = lead.custom_values ?? {};
    const preferredKeys = ["name", "full_name", "first_name", "last_name", "company", "account", "email"];
    const lowerEntries = Object.entries(cv).map(([k, v]) => [k.toLowerCase(), v] as const);

    for (const pref of preferredKeys) {
      const match = lowerEntries.find(
        ([key, value]) =>
          key.includes(pref) &&
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      );
      if (match) return String(match[1]).trim();
    }

    const anyField = lowerEntries.find(
      ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
    );
    if (anyField) return String(anyField[1]).trim();

    const stageLabel = lead.stage || "Pipeline";
    return `Lead in “${stageLabel}” stage`;
  }, [lead]);

  const leadInitials = useMemo(() => initialsFromSingleString(leadLabel), [leadLabel]);

  // ✅ map slug -> name (used to render timeline booking-link messages cleanly)
  // NOTE: uses ALL bookingLinks (including deleted) so timeline can still show a readable name.
  const bookingNameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    (bookingLinks ?? []).forEach((b) => {
      const slug = String(b.slug || "").trim();
      if (slug) m.set(slug, String(b.name || "").trim() || slug);
    });
    return m;
  }, [bookingLinks]);

  function extractBookingSlugFromBody(body: string): string | null {
    const s = String(body || "");
    const m = s.match(/\/b\/([a-z0-9_-]+)/i);
    return m?.[1] ? String(m[1]).trim() : null;
  }

  function formatBookingLinkTimelineBody(messageBody: string): string {
    const slug = extractBookingSlugFromBody(messageBody);
    const name = slug ? bookingNameBySlug.get(slug) : null;
    return `Sent booking link: ${name || "Schedule page"}`;
  }

  const timelineMessages: LeadMessage[] = useMemo(() => {
    if (!messages.length) return [];

    const cleaned = messages.filter((m) => !shouldHideFromTimeline(m));
    const sorted = [...cleaned].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );

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
      const candidates = group
        .slice()
        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

      const scored = candidates.map((m) => {
        const p = parseBookedCall(m.body || "");
        const quality = p ? bookedCallQualityScore(p.kind) : 0;
        const preferred = prefersThisBookedCallMessage(m) ? 1 : 0;
        return { m, preferred, quality, sent: new Date(m.sent_at).getTime() };
      });

      scored.sort((x, y) => {
        if (y.preferred !== x.preferred) return y.preferred - x.preferred;
        if (y.quality !== x.quality) return y.quality - x.quality;
        return y.sent - x.sent;
      });

      chosenBooked.push(scored[0].m);
    }

    return [...passthrough, ...chosenBooked].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
  }, [messages, viewerTz]);

  /* ---------- early returns ---------- */
  if (!mounted || !workspaceLoaded || loading) {
    return <LeadDetailPageSkeleton />;
  }

  if (workspaceLoaded && !teamId) {
    return (
      <p className="text-sm text-slate-500">
        You don&apos;t seem to be in any team yet. Open this page from a workspace,
        or complete onboarding first.
      </p>
    );
  }

  if (!hasLeadId) {
    return (
      <p className="text-sm text-rose-600">
        Missing lead id in route params (check your dynamic segment name).
      </p>
    );
  }

  if (!lead) return <p className="text-sm text-slate-500">Lead not found.</p>;

  const createdDT = DateTime.fromISO(lead.created_at, { setZone: true }).setZone(viewerTz || "UTC");
  const createdLabel = createdDT.isValid
    ? createdDT.toLocaleString(DateTime.DATETIME_SHORT)
    : lead.created_at;

  const score = lead.score ?? null;
  const gradeInfo = getScoreGrade(score);

  /* ---------- render ---------- */
  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        {/* LEFT */}
        <div className="space-y-6 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Lead Details</h1>
              <p className="text-sm text-slate-500">Created on {createdLabel}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!normalizedLeadId || !teamId}
                onClick={() => setIsBookingModalOpen(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                title="Create a unique booking link for this lead"
              >
                Booking link
              </button>

              <button
                type="button"
                onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/edit`)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer w-15"
              >
                Edit
              </button>

              <button
                type="button"
                onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/delete`)}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer w-15"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Lead Score</h2>
            {score != null ? (
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${gradeInfo.circle}`}
                >
                  {gradeInfo.short}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {score} · {gradeInfo.label}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No score yet. Configure lead scoring in Settings → Lead scoring.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Pipeline Stage</h2>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
              {lead.stage || "—"}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Lead Fields</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {fields.map((field) => {
                const value = lead.custom_values?.[field.key];

                if (field.type === "link" && typeof value === "string" && value) {
                  const raw = value.trim();
                  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
                  return (
                    <div key={field.key} className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {field.label}
                      </p>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        <span className="truncate">{raw}</span>
                      </a>
                    </div>
                  );
                }

                return (
                  <div key={field.key} className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {field.label}
                    </p>
                    <p className="text-sm text-slate-800">
                      {value !== null && value !== undefined && value !== ""
                        ? String(value)
                        : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: timeline */}
        <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Activity Timeline</h2>
              <p className="text-xs text-slate-500">
                Lead creation, stage changes, and messages in one view.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/messages`)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-600 shadow-sm hover:border-emerald-400 hover:bg-emerald-100 cursor-pointer"
              title="Log new message"
            >
              +
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messagesLoading ? (
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
            ) : timelineMessages.length === 0 ? (
              <p className="text-xs text-slate-500">No messages yet.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {timelineMessages.map((m) => {
                  const isOutbound = m.direction === "outbound";
                  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";

                  const bodyLower = (m.body ?? "").toLowerCase();

                  const isBookingLinkEvent =
                    isPipeline &&
                    (bodyLower.includes("booking link") ||
                      bodyLower.includes("/b/") ||
                      bodyLower.includes("schedule page"));

                  const isBookedCallEvent =
                    isPipeline &&
                    (bodyLower.includes("booked a call") ||
                      bodyLower.includes("call booked for") ||
                      bodyLower.includes("booked_call|"));

                  const first = m.sender?.first_name ?? "";
                  const last = m.sender?.last_name ?? "";
                  const fullName = `${first} ${last}`.trim() || "Team member";

                  const authorName = isOutbound ? fullName : leadLabel;
                  const avatarUrl = isOutbound ? m.sender?.avatar_url ?? null : null;
                  const initials = isOutbound ? initialsFromName(first, last) : leadInitials;

                  const tsLabel = fmtMessageTimestamp(m.sent_at, viewerTz || "UTC");

                  return (
                    <div key={m.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {isPipeline ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              isBookedCallEvent
                                ? "/icons/booked-call.svg"
                                : isBookingLinkEvent
                                ? "/icons/booking-link.svg"
                                : "/icons/stage-change.svg"
                            }
                            alt={
                              isBookedCallEvent
                                ? "Call booked"
                                : isBookingLinkEvent
                                ? "Booking link sent"
                                : "Pipeline activity"
                            }
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
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-slate-700">{authorName}</span>
                              <span className="text-slate-400">
                                · {isPipeline ? "Setter" : isOutbound ? "Setter" : "Lead"} ·{" "}
                                {formatChannel(m.channel)}
                              </span>
                            </span>
                            <span>{tsLabel}</span>
                          </div>

                          <p className="whitespace-pre-wrap text-[11px] text-slate-800">
                            {isBookedCallEvent
                              ? formatBookedCallBody(m.body)
                              : isBookingLinkEvent
                              ? formatBookingLinkTimelineBody(m.body)
                              : m.body}
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

      {/* Booking modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="absolute inset-0" onClick={() => setIsBookingModalOpen(false)} />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create booking link"
            className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between bg-indigo-600 px-6 py-4 text-white">
              <div>
                <h2 className="text-lg font-semibold">Create booking link</h2>
                <p className="mt-1 text-xs text-indigo-100">
                  Choose a schedule page below. We’ll generate a unique invite for this lead
                  and log it in the timeline.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsBookingModalOpen(false)}
                className="rounded-full p-1 text-indigo-100 hover:bg-indigo-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
                title="Close"
              >
                <span className="sr-only">Close</span>✕
              </button>
            </div>

            <div className="space-y-4 bg-slate-50 px-6 pb-6 pt-5">
              {bookingLinksError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bookingLinksError}
                </div>
              )}

              {inviteError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {inviteError}
                </div>
              )}

              {inviteSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {inviteSuccess}
                </div>
              )}

              {lastInviteUrl && (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Latest link
                      </div>
                      <div className="mt-1 truncate text-xs font-medium text-slate-800">{lastInviteUrl}</div>
                    </div>

                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(lastInviteUrl);
                          setInviteSuccess("Booking link copied to clipboard.");
                        } catch {
                          setInviteSuccess("Copy failed — copy manually from the link.");
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {bookingLinksLoading ? (
                <p className="text-sm text-slate-500">Loading schedule pages…</p>
              ) : activeBookingLinks.length === 0 ? (
                // ✅ use activeBookingLinks so deleted pages don't appear or count
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                  <p className="font-semibold text-slate-700">No schedule pages available.</p>
                  <p className="mt-1">Create one in Settings → Schedule Pages first.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="max-h-[420px] overflow-y-auto overflow-x-auto rounded-xl">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-100">
                        <tr className="text-left">
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                            Schedule page
                          </th>
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                            Type
                          </th>
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                            Host
                          </th>
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {/* ✅ map activeBookingLinks (NOT bookingLinks) */}
                        {activeBookingLinks.map((link) => {
                          const isBusy = inviteLoadingId === link.id;

                          return (
                            <tr
                              key={link.id}
                              className="group border-b border-slate-100 hover:bg-slate-50/70"
                            >
                              <td className="px-4 py-3">
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">{link.name}</div>
                                  <div className="mt-0.5 text-[11px] text-slate-500">/b/{link.slug}</div>
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
                                <span className="text-sm text-slate-700">{hostLabelForLink(link)}</span>
                              </td>

                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  disabled={isBusy || !teamId || !leadIdIsUuid}
                                  onClick={() => createBookingInvite(link.id)}
                                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                  title={!leadIdIsUuid ? "Lead id must be a UUID to create an invite." : undefined}
                                >
                                  {isBusy ? "Creating…" : "Create & copy"}
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
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
