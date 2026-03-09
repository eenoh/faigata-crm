"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { DateTime } from "luxon";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import { useTheme } from "next-themes";

interface LeadData {
  id: string;
  stage: string;

  lead_name?: string | null;

  niche: string | null;
  lead_type: "individual" | "business" | null;
  gender: "male" | "female" | null;

  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;

  primary_contact_type:
    | "email"
    | "phone"
    | "instagram"
    | "facebook"
    | "reddit"
    | "twitter_x"
    | "linkedin"
    | "tiktok"
    | "youtube"
    | "whatsapp"
    | "telegram"
    | "discord"
    | "other"
    | null;
  primary_contact_value: string | null;

  source_category:
    | "inbound"
    | "outbound"
    | "referral"
    | "partner"
    | "purchased"
    | null;
  source_name:
    | "instagram"
    | "facebook"
    | "reddit"
    | "twitter_x"
    | "other"
    | null;

  created_at: string;
  updated_at?: string | null;

  custom_values: Record<string, any> | null;

  prospector_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;

  notes?: string | null;

  score?: number | null;
  score_updated_at?: string | null;

  // OPTIONAL (if your leads API selects these columns)
  rejected_count?: number | null;
  rejected_by?: string[] | null;
}

/* -------------------- custom field key safety -------------------- */

function normalizeKey(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

const CUSTOM_KEY_ALIASES: Record<string, string> = {
  industry: "field_2",
};

function buildNormalizedCustomMap(
  custom: Record<string, any> | null | undefined,
) {
  const out: Record<string, any> = {};
  const obj = custom && typeof custom === "object" ? custom : {};
  for (const [k, v] of Object.entries(obj)) out[normalizeKey(k)] = v;
  return out;
}

function getCustomValue(
  custom: Record<string, any> | null | undefined,
  normalizedCustom: Record<string, any>,
  fieldKey: string,
) {
  const direct = custom?.[fieldKey];
  if (direct !== undefined) return direct;

  const nk = normalizeKey(fieldKey);
  if (nk in normalizedCustom) return normalizedCustom[nk];

  const aliasTo = CUSTOM_KEY_ALIASES[nk];
  if (aliasTo) {
    const directAlias = custom?.[aliasTo];
    if (directAlias !== undefined) return directAlias;

    const nka = normalizeKey(aliasTo);
    if (nka in normalizedCustom) return normalizedCustom[nka];
  }

  for (const [legacy, newKey] of Object.entries(CUSTOM_KEY_ALIASES)) {
    if (normalizeKey(newKey) === nk) {
      const legacyDirect = custom?.[legacy];
      if (legacyDirect !== undefined) return legacyDirect;
      const nLegacy = normalizeKey(legacy);
      if (nLegacy in normalizedCustom) return normalizedCustom[nLegacy];
    }
  }

  return undefined;
}

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
  owner_name: string;
  deleted_at?: string | null;
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

async function fetchLead(
  teamId: string,
  leadId: string,
): Promise<LeadData | null> {
  const res = await fetch(
    `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(leadId)}`,
    { cache: "no-store" },
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
): Promise<ScoreThresholds | null> {
  const res = await fetch("/api/crm/lead-scoring-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, action: "get" }),
  });

  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("application/json")) return null;

  const json = await res.json().catch(() => ({}) as any);
  const low = Number(json.thresholds?.low);
  const high = Number(json.thresholds?.high);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;

  return { low, high };
}

/* -------------------- has-calls helper -------------------- */

async function fetchHasCalls(teamId: string, leadId: string): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? null;

    const res = await fetch(
      `/api/crm/leads/${encodeURIComponent(leadId)}/calls?teamId=${encodeURIComponent(teamId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
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

/* -------------------- loading UI (page skeleton) -------------------- */

function SkeletonLine({
  w = "w-full",
  isDark,
}: {
  w?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`h-3 ${w} rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
    />
  );
}
function SkeletonPill({ w = "w-24", isDark }: { w?: string; isDark: boolean }) {
  return (
    <div
      className={`h-6 ${w} rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
    />
  );
}
function SkeletonButton({
  w = "w-24",
  isDark,
}: {
  w?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`h-8 ${w} rounded-lg ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
    />
  );
}

function LeadDetailPageSkeleton({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const borderSoft = isDark ? "border-slate-900" : "border-slate-100";

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)] animate-pulse">
        <div className="space-y-6 pb-6">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div
                  className={`h-7 w-44 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
                />
                <div className="mt-2 space-y-2">
                  <SkeletonLine isDark={isDark} w="w-72" />
                  <SkeletonLine isDark={isDark} w="w-56" />
                </div>
              </div>

              <div className="flex gap-2">
                <SkeletonButton isDark={isDark} w="w-28" />
                <SkeletonButton isDark={isDark} w="w-16" />
                <SkeletonButton isDark={isDark} w="w-16" />
              </div>
            </div>

            <div className="space-y-2">
              <div
                className={`h-16 rounded-2xl ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
              />
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 shadow-sm ${card}`}>
            <div
              className={`mb-3 h-4 w-24 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
              />
              <div className="flex-1 space-y-2">
                <SkeletonLine isDark={isDark} w="w-44" />
                <SkeletonLine isDark={isDark} w="w-60" />
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 shadow-sm ${card}`}>
            <div
              className={`mb-3 h-4 w-28 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
            <SkeletonPill isDark={isDark} w="w-28" />
          </div>

          <div className={`rounded-2xl border px-4 py-4 shadow-sm ${card}`}>
            <div
              className={`mb-3 h-4 w-32 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <SkeletonLine isDark={isDark} w="w-24" />
                  <SkeletonLine
                    isDark={isDark}
                    w={i % 2 === 0 ? "w-52" : "w-40"}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`flex h-full flex-col rounded-2xl border shadow-sm ${card}`}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${borderSoft}`}
          >
            <div className="min-w-0">
              <div
                className={`h-4 w-36 rounded ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
              />
              <div className="mt-2 space-y-2">
                <SkeletonLine isDark={isDark} w="w-64" />
                <SkeletonLine isDark={isDark} w="w-48" />
              </div>
            </div>

            <div
              className={`h-7 w-7 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex h-8 w-8 items-center justify-center">
                    <div
                      className={`h-8 w-8 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-100"}`}
                    />
                  </div>

                  <div className="flex-1">
                    <div
                      className={`rounded-xl border px-3 py-2 ${
                        isDark
                          ? "border-slate-900 bg-slate-900/40"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <SkeletonLine
                            isDark={isDark}
                            w={i % 2 === 0 ? "w-56" : "w-44"}
                          />
                          <SkeletonLine
                            isDark={isDark}
                            w={i % 2 === 0 ? "w-36" : "w-52"}
                          />
                        </div>
                        <SkeletonLine isDark={isDark} w="w-24" />
                      </div>

                      <div className="space-y-2">
                        <SkeletonLine isDark={isDark} w="w-full" />
                        <SkeletonLine
                          isDark={isDark}
                          w={i % 3 === 0 ? "w-5/6" : "w-2/3"}
                        />
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

/* -------------------- small formatting helpers -------------------- */

function labelizeEnum(v: string | null | undefined) {
  if (!v) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatCustomValue(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : "—";
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function fieldStorageKey(def: LeadFieldDefinition) {
  const k = normalizeKey(def.key);

  if (/^field_\d+$/.test(k)) return k;

  if (typeof def.position === "number" && def.position > 0) {
    return `field_${def.position}`;
  }

  return k;
}

function safeValue(v: any) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function looksLikeUrl(v: string) {
  return /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}([/].*)?$/i.test(v);
}

function normalizeUrl(v: string) {
  const raw = v.trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function contactHref(type: LeadData["primary_contact_type"], value: string) {
  const raw = value.trim();
  if (!raw) return null;

  if (type === "email") return `mailto:${raw}`;
  if (type === "phone") return `tel:${raw.replace(/\s+/g, "")}`;

  if (looksLikeUrl(raw)) return normalizeUrl(raw);
  return null;
}

/* -------------------- lead-created timeline helpers -------------------- */

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
  const raw = String(body || "");
  const parts = raw.split("|");
  const labelFromBody = (parts[1] ?? "").trim();
  const label = labelFromBody || leadLabel;
  return `New lead added: ${label}`;
}

/* -------------------- pipeline event helpers -------------------- */

function isPipelineEvent(m: LeadMessage) {
  return (m.channel ?? "").toLowerCase() === "pipeline";
}

/* -------------------- ✅ lead rejected timeline helpers -------------------- */

function isLeadRejectedEvent(m: LeadMessage) {
  return (
    isPipelineEvent(m) &&
    String(m.body ?? "")
      .toUpperCase()
      .startsWith("LEAD_REJECTED|")
  );
}

function parseLeadRejected(body: string) {
  // LEAD_REJECTED|oldSetterId|newSetterId|count
  const parts = String(body || "").split("|");
  const oldSetterId = String(parts[1] ?? "").trim();
  const newSetterId = String(parts[2] ?? "").trim();
  const count = Number(parts[3] ?? "0");
  return {
    oldSetterId,
    newSetterId,
    count: Number.isFinite(count) ? count : 0,
  };
}

function formatLeadRejectedBody(body: string, newSetterName?: string | null) {
  const { count } = parseLeadRejected(body);
  const suffix = count === 1 ? "(1 rejection)" : `(${count} rejections)`;

  const name = String(newSetterName ?? "").trim();
  return `Lead rejected ${suffix} · Reassigned to ${name || "another setter"}`;
}

/* -------------------- call-outcome timeline helpers (SEPARATE STATES + legacy support) -------------------- */

function isCallAttendanceEvent(m: LeadMessage) {
  return (
    isPipelineEvent(m) &&
    String(m.body ?? "")
      .toUpperCase()
      .startsWith("CALL_ATTENDANCE|")
  );
}
function isCallOfferMadeEvent(m: LeadMessage) {
  return (
    isPipelineEvent(m) &&
    String(m.body ?? "")
      .toUpperCase()
      .startsWith("CALL_OFFER_MADE|")
  );
}
function isCallClosedEvent(m: LeadMessage) {
  return (
    isPipelineEvent(m) &&
    String(m.body ?? "")
      .toUpperCase()
      .startsWith("CALL_CLOSED_ON_CALL|")
  );
}

/**
 * Legacy combined format:
 * CALL_OUTCOME|<bookingId>|<prevStatus>|<nextStatus>|<offerMade0/1>|<closed0/1>
 */
function isLegacyCallOutcomeEvent(m: LeadMessage) {
  return (
    isPipelineEvent(m) &&
    String(m.body ?? "")
      .toUpperCase()
      .startsWith("CALL_OUTCOME|")
  );
}

function normalizeOutcomeStatus(v: string) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  const allowed = new Set([
    "unknown",
    "attended",
    "no_show",
    "cancelled",
    "rescheduled",
  ]);
  return allowed.has(s) ? s : "unknown";
}

function statusLabel(s: string) {
  const v = normalizeOutcomeStatus(s);
  if (v === "no_show") return "No-show";
  if (v === "unknown") return "Unknown";
  return v.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function iconForAttendance(nextStatus: string) {
  const s = normalizeOutcomeStatus(nextStatus);
  if (s === "attended") return "/icons/call-attended.svg";
  if (s === "no_show") return "/icons/call-no-show.svg";
  if (s === "cancelled") return "/icons/call-cancelled.svg";
  if (s === "rescheduled") return "/icons/call-rescheduled.svg";
  return "/icons/booked-call.svg";
}

function formatAttendanceBody(body: string) {
  // CALL_ATTENDANCE|bookingId|prev|next
  const parts = String(body || "").split("|");
  const prev = normalizeOutcomeStatus(parts[2] ?? "unknown");
  const next = normalizeOutcomeStatus(parts[3] ?? "unknown");
  return `Call status updated: ${statusLabel(prev)} → ${statusLabel(next)}`;
}

function parseOfferMade(body: string) {
  const parts = String(body || "").split("|");
  const on = String(parts[2] ?? "0").trim() === "1";
  const productId = String(parts[3] ?? "").trim();
  const productTitleInline = String(parts[4] ?? "").trim(); // optional
  return { on, productId, productTitleInline };
}

function formatOfferMadeBody(body: string, productTitle: string | null) {
  const { on, productTitleInline } = parseOfferMade(body);
  if (!on) return "Offer removed";
  const title = productTitleInline || productTitle || "Product";
  return `Offer made: ${title}`;
}

function parseClosedOnCall(body: string) {
  // CALL_CLOSED_ON_CALL|bookingId|1/0|productId?
  const parts = String(body || "").split("|");
  const on = String(parts[2] ?? "0").trim() === "1";
  const productId = String(parts[3] ?? "").trim(); // optional
  return { on, productId };
}

function formatClosedBody(body: string, productTitle: string | null) {
  const { on } = parseClosedOnCall(body);
  if (!on) return "Closed on call removed";

  const title = String(productTitle ?? "").trim();
  return title ? `Closed on call: ${title}` : "Closed on call";
}

function iconForLegacyOutcome(body: string) {
  const parts = String(body || "").split("|");
  const next = parts[3] ?? "unknown";
  const offer = String(parts[4] ?? "0").trim() === "1";
  const closed = String(parts[5] ?? "0").trim() === "1";

  if (closed) return "/icons/call-closed.svg";
  if (offer) return "/icons/call-offer-made.svg";

  return iconForAttendance(next);
}

function formatLegacyOutcomeBody(body: string) {
  const parts = String(body || "").split("|");
  const prev = normalizeOutcomeStatus(parts[2] ?? "unknown");
  const next = normalizeOutcomeStatus(parts[3] ?? "unknown");
  const offer = String(parts[4] ?? "0").trim() === "1";
  const closed = String(parts[5] ?? "0").trim() === "1";

  const base = `Call status updated: ${statusLabel(prev)} → ${statusLabel(next)}`;
  const extras: string[] = [];
  if (offer) extras.push("Offer made");
  if (closed) extras.push("Closed on call");
  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}

/* -------------------- booked call parsing helpers -------------------- */

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

function getRejectLeadErrorMessage(errorCode: unknown) {
  const code = String(errorCode ?? "").trim();

  switch (code) {
    case "no_other_setter_available":
      return "This lead can’t be rejected right now because there isn’t another setter available to reassign it to.";

    case "not_current_setter":
      return "Only the current setter can reject this lead.";

    case "not_a_setter":
      return "You don’t have permission to reject this lead.";

    case "lead_not_found":
      return "This lead could not be found.";

    case "team_mismatch":
      return "This lead does not belong to your current workspace.";

    case "missing_auth_token":
    case "unauthorized":
      return "Your session expired. Please refresh the page and try again.";

    case "failed_to_load_setters":
      return "We couldn’t load the available setters right now. Please try again in a moment.";

    case "lead_update_failed":
      return "We couldn’t update the lead right now. Please try again.";

    case "profile_not_found":
    case "profile_load_failed":
      return "We couldn’t verify your profile right now. Please try again.";

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

/* -------------------- stripe product title lookup (for offer-made events) -------------------- */

function isStripeProdOrPriceId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id) || /^price_[a-zA-Z0-9]+$/.test(id);
}

async function fetchStripeProductLabels(
  ids: string[],
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return {};

    const res = await fetch("/api/billing/products/labels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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

/* -------------------- misc logging helper -------------------- */

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

function InlineAlert({
  title,
  message,
  tone = "warning",
  onClose,
  isDark = false,
}: {
  title?: string;
  message: string;
  tone?: "warning" | "danger" | "info";
  onClose?: () => void;
  isDark?: boolean;
}) {
  const toneClasses = (() => {
    if (tone === "danger") {
      return isDark
        ? "border-rose-900/60 bg-rose-950/40 text-rose-200"
        : "border-rose-200 bg-rose-50 text-rose-800";
    }
    if (tone === "info") {
      return isDark
        ? "border-sky-900/60 bg-sky-950/40 text-sky-100"
        : "border-sky-200 bg-sky-50 text-sky-900";
    }
    return isDark
      ? "border-amber-900/60 bg-amber-950/35 text-amber-100"
      : "border-amber-200 bg-amber-50 text-amber-900";
  })();

  const icon = tone === "danger" ? "!" : tone === "info" ? "i" : "⚠";

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={[
              "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold",
              isDark
                ? "border-white/10 bg-white/5"
                : "border-black/10 bg-white/60",
            ].join(" ")}
          >
            {icon}
          </div>
          <div className="min-w-0">
            {title && <div className="text-sm font-semibold">{title}</div>}
            <div className="mt-0.5 text-xs leading-relaxed opacity-90">
              {message}
            </div>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "warning",
  loading,
  onConfirm,
  onCancel,
  isDark = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "warning" | "danger" | "info";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDark?: boolean;
}) {
  if (!open) return null;

  const shell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const borderSoft = isDark ? "border-slate-900" : "border-slate-100";
  const footer = isDark ? "bg-slate-900/40" : "bg-slate-50";
  const titleCls = isDark ? "text-slate-100" : "text-slate-900";
  const msgCls = isDark ? "text-slate-300" : "text-slate-600";

  const toneBadge = (() => {
    if (tone === "danger")
      return isDark
        ? "bg-rose-500/15 text-rose-200 ring-rose-900/40"
        : "bg-rose-50 text-rose-700 ring-rose-200";
    if (tone === "info")
      return isDark
        ? "bg-sky-500/15 text-sky-200 ring-sky-900/40"
        : "bg-sky-50 text-sky-700 ring-sky-200";
    return isDark
      ? "bg-amber-500/15 text-amber-100 ring-amber-900/40"
      : "bg-amber-50 text-amber-800 ring-amber-200";
  })();

  const confirmBtn =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : tone === "info"
        ? "bg-sky-600 hover:bg-sky-700 text-white"
        : "bg-amber-600 hover:bg-amber-700 text-white";

  const cancelBtn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="absolute inset-0" onClick={onCancel} />

      <div
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${shell}`}
      >
        <div
          className={`flex items-start gap-3 border-b px-5 py-4 ${borderSoft}`}
        >
          <span
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 text-xs font-bold",
              toneBadge,
            ].join(" ")}
          >
            {tone === "danger" ? "!" : tone === "info" ? "i" : "⚠"}
          </span>

          <div className="min-w-0">
            <div className={`text-sm font-semibold ${titleCls}`}>{title}</div>
            <div className={`mt-1 text-xs leading-relaxed ${msgCls}`}>
              {message}
            </div>
          </div>
        </div>

        <div
          className={`flex items-center justify-end gap-2 px-5 py-3 ${footer}`}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={[
              "rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm cursor-pointer",
              cancelBtn,
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold shadow-sm cursor-pointer",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              confirmBtn,
            ].join(" ")}
          >
            {loading ? "Working…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- page component -------------------- */

type LeadDetailClientProps = {
  /** Optional for old versions that pass page params into the client component */
  leadId?: string;
};

export function LeadDetailClient({ leadId }: LeadDetailClientProps) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

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

  // reject state
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // productId (stripe prod_...) -> productTitle
  const [productLabels, setProductLabels] = useState<Record<string, string>>(
    {},
  );

  // profileId -> "First Last" (used for rejected events + assigned people display)
  const [profileLabels, setProfileLabels] = useState<Record<string, string>>(
    {},
  );

  // assigned display (setter/closer)
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

    // setters can reject, but NOT if they are also the closer
    return isCurrentSetter && isSetter && !isCurrentCloser;
  }, [lead, currentUserId, isSetter]);

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

  function goToBookingLinksSettings() {
    setIsBookingModalOpen(false); // close modal first (better UX)
    router.push("/settings/booking-links");
  }

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
    const mk = (light: string, dark: string) => (isDark ? dark : light);

    if (score == null)
      return {
        label: "Unscored",
        short: "?",
        circle: mk(
          "bg-slate-100 text-slate-500",
          "bg-slate-900/60 text-slate-300",
        ),
      };
    if (!thresholds)
      return {
        label: "Scored",
        short: "S",
        circle: mk(
          "bg-amber-100 text-amber-800",
          "bg-amber-500/15 text-amber-200",
        ),
      };
    const { low, high } = thresholds;
    if (score < low)
      return {
        label: "Low",
        short: "L",
        circle: mk("bg-rose-100 text-rose-800", "bg-rose-500/15 text-rose-200"),
      };
    if (score >= high)
      return {
        label: "High",
        short: "H",
        circle: mk(
          "bg-emerald-100 text-emerald-800",
          "bg-emerald-500/15 text-emerald-200",
        ),
      };
    return {
      label: "Medium",
      short: "M",
      circle: mk(
        "bg-amber-100 text-amber-800",
        "bg-amber-500/15 text-amber-200",
      ),
    };
  }

  function typeClasses(t: BookingType | null) {
    const mk = (light: string, dark: string) => (isDark ? dark : light);
    switch (t) {
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
      `/api/crm/lead-messages?teamId=${encodeURIComponent(activeTeamId)}&leadId=${encodeURIComponent(activeLeadId)}`,
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

  /* -------------------- Booking links loader -------------------- */
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
        owner_name: owner_name || "Host",
        deleted_at: row.deleted_at ?? null,
      };
    });

    return rows;
  }

  /* -------------------- createBookingInvite -------------------- */
  async function refreshLeadDetailAfterScoring(
    activeTeamId: string,
    activeLeadId: string,
  ) {
    try {
      const [leadRes, configRes, loadedMessages] = await Promise.all([
        fetchLead(activeTeamId, activeLeadId),
        fetchScoreConfig(activeTeamId),
        fetchMessages(activeTeamId, activeLeadId).catch(() => null),
      ]);

      if (leadRes) {
        setLead({ ...leadRes, custom_values: leadRes.custom_values ?? {} });
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
      setInviteError("Lead id must be a UUID to create an invite.");
      return;
    }

    setInviteError(null);
    setInviteSuccess(null);
    setInviteLoadingId(bookingLinkId);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) throw new Error("missing_session");

      const res = await fetch("/api/crm/booking-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
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
        throw new Error(
          "Invite was created but no URL was returned. Update /api/crm/booking-invite to return { url }.",
        );
      }

      setLastInviteUrl(inviteUrl);

      try {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteSuccess("Booking link created and copied to clipboard.");
      } catch {
        setInviteSuccess(
          "Booking link created. Copy manually from the latest link box.",
        );
      }

      // live refresh score + timeline
      await refreshLeadDetailAfterScoring(teamId, normalizedLeadId);
    } catch (e: any) {
      setInviteError(String(e?.message ?? "Failed to create booking invite"));
    } finally {
      setInviteLoadingId(null);
    }
  }

  /* ---------- Reject action ---------- */
  async function confirmRejectLead() {
    if (!teamId || !normalizedLeadId) return;
    if (!canRejectLead) return;

    setRejecting(true);
    setRejectError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;
      if (!accessToken) throw new Error("missing_session");

      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(normalizedLeadId)}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ teamId }),
        },
      );

      const json = await res.json().catch(() => ({}) as any);

      if (!res.ok) {
        const friendlyMessage = getRejectLeadErrorMessage((json as any)?.error);
        throw new Error(friendlyMessage);
      }

      router.push("/leads");
    } catch (e: any) {
      setRejectError(String(e?.message ?? "Failed to reject lead"));
    } finally {
      setRejecting(false);
      setRejectConfirmOpen(false);
    }
  }

  /* ---------- 1) Load teamId + role + current user id ---------- */
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
            setCanDeleteLead(false);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const userId = userRes.user.id;
        if (!cancelled) setCurrentUserId(userId);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id, role")
          .eq("id", userId)
          .single();

        let tId: string | null = (profile as any)?.team_id ?? null;

        if (!tId) {
          const metaTeam = (userRes.user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0)
            tId = metaTeam;
        }

        const rolesRaw = (profile as any)?.role;
        const roles: string[] = Array.isArray(rolesRaw) ? rolesRaw : [];
        const normRoles = roles.map((r) => String(r).trim().toLowerCase());

        const managerOrAdmin =
          normRoles.includes("manager") || normRoles.includes("admin");
        const setter = normRoles.includes("setter");

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
          setIsManagerOrAdmin(managerOrAdmin);
          setIsSetter(setter);
          setCanDeleteLead(managerOrAdmin);
        }

        if (profileError && (profileError as any).code !== "PGRST116") {
          logSupabaseError("[LeadDetail] Failed to load profile", profileError);
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setCurrentUserId(null);
          setIsManagerOrAdmin(false);
          setIsSetter(false);
          setCanDeleteLead(false);
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

      const tId = teamId;
      if (!tId) {
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
          getLeadFieldDefinitions(tId),
          fetchLead(tId, normalizedLeadId),
          fetchScoreConfig(tId),
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

        setLead({ ...leadRes, custom_values: leadRes.custom_values ?? {} });

        // prospector (creator)
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
            if (!cancelled)
              setCreator({
                id: (creatorProfile as any).id,
                first_name: (creatorProfile as any).first_name,
                last_name: (creatorProfile as any).last_name,
                avatar_url: signedAvatar,
              });
          } else if (creatorError) {
            logSupabaseError(
              "[LeadDetail] Failed to load creator profile",
              creatorError,
            );
          }
        }

        // setter + closer display names
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
              map[p.id] = full || "Team member";
            }

            const merged = { ...profileLabels, ...map };

            if (!cancelled && Object.keys(map).length) {
              setProfileLabels(merged);

              const sId = String(leadRes.setter_id ?? "").trim();
              const cId = String(leadRes.closer_id ?? "").trim();

              setSetterName(sId ? (merged[sId] ?? "Team member") : null);
              setCloserName(cId ? (merged[cId] ?? "Team member") : null);
            }
          }
        } else {
          if (!cancelled) {
            setSetterName(null);
            setCloserName(null);
          }
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
  }, [workspaceLoaded, teamId, hasLeadId, normalizedLeadId]);

  /* ---------- 2.5) Check if lead has calls (used by canSeeCallsButton) ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;
      if (!teamId) return;
      if (!leadIdIsUuid) return;

      setCallsCheckLoading(true);
      try {
        const has = await fetchHasCalls(teamId, normalizedLeadId);
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
  }, [workspaceLoaded, teamId, leadIdIsUuid, normalizedLeadId]);

  /* ---------- 3) Load messages ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      const tId = teamId;

      if (!tId) {
        if (!cancelled) setMessagesLoading(false);
        return;
      }
      if (!hasLeadId) {
        if (!cancelled) setMessagesLoading(false);
        return;
      }

      try {
        const loaded = await fetchMessages(tId, normalizedLeadId);
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

  /* ---------- 3.05) Load schedule pages when modal opens ---------- */
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
        if (!cancelled)
          setBookingLinksError(
            String(e?.message ?? "Failed to load schedule pages"),
          );
      } finally {
        if (!cancelled) setBookingLinksLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBookingModalOpen, teamId]);

  /* ---------- 3.1) Build timeline list ---------- */
  const leadLabel: string = useMemo(() => {
    if (!lead) return "Lead in pipeline";

    const directCol = String(lead.lead_name ?? "").trim();
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

    const stageLabel = lead.stage || "Pipeline";
    return `Lead in “${stageLabel}” stage`;
  }, [lead]);

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
    if (!lead) return [];

    const cleaned = (messages ?? []).filter((m) => !shouldHideFromTimeline(m));

    const alreadyHasLeadCreated = cleaned.some(isLeadCreatedTimelineMessage);
    const finalList = [...cleaned];

    if (!alreadyHasLeadCreated) {
      finalList.push({
        id: `lead-created:${lead.id}`,
        direction: "outbound",
        channel: "pipeline",
        body: `LEAD_CREATED|${leadLabel}`,
        sent_at: lead.created_at,
        sender_profile_id: lead.prospector_id ?? null,
        sender: creator
          ? {
              id: creator.id,
              first_name: creator.first_name,
              last_name: creator.last_name,
              avatar_url: creator.avatar_url,
            }
          : null,
      });
    }

    finalList.sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
    );
    return finalList;
  }, [messages, lead, leadLabel, creator]);

  /* ---------- ✅ Load profile names for rejected events (old/new setter ids) ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ids = (timelineMessages ?? [])
        .filter(isLeadRejectedEvent)
        .map((m) => parseLeadRejected(m.body))
        .flatMap(({ oldSetterId, newSetterId }) => [oldSetterId, newSetterId])
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
        if (p.id) map[p.id] = full || "Team member";
      }

      if (!cancelled && Object.keys(map).length) {
        setProfileLabels((prev) => ({ ...prev, ...map }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timelineMessages, profileLabels]);

  /* ---------- Product title lookup for offer-made items (Stripe) ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const offerIds = timelineMessages
        .filter(isCallOfferMadeEvent)
        .map((m) => parseOfferMade(m.body))
        .filter((p) => p.on && p.productId && !p.productTitleInline)
        .map((p) => p.productId);

      const closedIds = timelineMessages
        .filter(isCallClosedEvent)
        .map((m) => parseClosedOnCall(m.body))
        .filter((p) => p.on && p.productId)
        .map((p) => p.productId);

      const uniq = Array.from(
        new Set([...offerIds, ...closedIds].filter(isStripeProdOrPriceId)),
      );
      if (uniq.length === 0) return;

      const missing = uniq.filter((id) => !productLabels[id]);
      if (missing.length === 0) return;

      const map = await fetchStripeProductLabels(missing);
      if (!cancelled && map && Object.keys(map).length) {
        setProductLabels((prev) => ({ ...prev, ...map }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timelineMessages, productLabels]);

  /* ---------- theme classes ---------- */
  const pageText = isDark ? "text-slate-200" : "text-slate-800";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const cardShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const cardTitle = isDark ? "text-slate-100" : "text-slate-800";
  const cardBorderSoft = isDark ? "border-slate-900" : "border-slate-100";

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

  const timelineWrap = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const timelineItem = isDark
    ? "border-slate-900 bg-slate-900/40"
    : "border-slate-100 bg-slate-50";
  const timelineMeta = isDark ? "text-slate-400" : "text-slate-500";
  const timelineAuthor = isDark ? "text-slate-200" : "text-slate-700";
  const timelineBody = isDark ? "text-slate-200" : "text-slate-800";

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

  /* ---------- early returns ---------- */
  if (!workspaceLoaded || loading)
    return <LeadDetailPageSkeleton isDark={isDark} />;

  if (workspaceLoaded && !teamId) {
    return (
      <p className={`text-sm ${mutedText}`}>
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
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

  if (!lead) return <p className={`text-sm ${mutedText}`}>Lead not found.</p>;

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
  const city = lead.city?.trim() || "";
  const region = lead.region?.trim() || "";
  const country = lead.country?.trim() || "";

  const firstPart = [postal, city].filter(Boolean).join(" ").trim();
  const locationLine = [firstPart, region, country].filter(Boolean).join(", ");

  return (
    <div className={`h-full overflow-y-auto ${pageText}`}>
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        {/* LEFT */}
        <div className="space-y-6 pb-6">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className={`text-2xl font-semibold ${titleText}`}>
                  {leadLabel}
                </h1>
                <p className={`text-sm ${mutedText}`}>
                  Created on {createdLabel}
                </p>
              </div>

              <div className="flex gap-2">
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
                      "disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer h-[28px] w-16",
                    ].join(" ")}
                    title="View and track outcomes for all booked calls"
                  >
                    {callsCheckLoading ? "Calls…" : "Calls"}
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
                    title="Create a unique booking link for this lead"
                  >
                    Booking link
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
                    title="Reject this lead and reassign to another setter"
                  >
                    {rejecting ? "Rejecting…" : "Reject"}
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
                      "rounded-lg px-3 py-1.5 text-xs font-semibold h-[28px] w-16 border shadow-sm cursor-pointer",
                      editBtn,
                    ].join(" ")}
                  >
                    Edit
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
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer h-[28px] w-16",
                      deleteBtn,
                    ].join(" ")}
                  >
                    Delete
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
                    title="Couldn’t reject lead"
                    message={rejectError}
                    onClose={() => setRejectError(null)}
                  />
                )}

                {bookingLinksError && (
                  <InlineAlert
                    isDark={isDark}
                    tone="danger"
                    title="Couldn’t load booking links"
                    message={bookingLinksError}
                    onClose={() => setBookingLinksError(null)}
                  />
                )}

                {inviteError && (
                  <InlineAlert
                    isDark={isDark}
                    tone="danger"
                    title="Couldn’t create booking link"
                    message={inviteError}
                    onClose={() => setInviteError(null)}
                  />
                )}

                {inviteSuccess && (
                  <InlineAlert
                    isDark={isDark}
                    tone="info"
                    title="Booking link created"
                    message={inviteSuccess}
                    onClose={() => setInviteSuccess(null)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Score */}
          <div
            className={`rounded-2xl border px-4 py-3 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-2 text-sm font-semibold ${cardTitle}`}>
              Lead Score
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
                      Updated {updatedLabel}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className={`text-xs ${mutedText}`}>
                No score yet. Configure lead scoring in Settings → Lead scoring.
              </p>
            )}
          </div>

          {/* Stage */}
          <div
            className={`rounded-2xl border px-4 py-3 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-2 text-sm font-semibold ${cardTitle}`}>
              Pipeline Stage
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pillStage}`}
            >
              {lead.stage || "—"}
            </span>
          </div>

          {/* Assigned */}
          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-3 text-sm font-semibold ${cardTitle}`}>
              Assigned
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Prospector
                </p>
                <p className={`text-sm ${pageText}`}>
                  {creator
                    ? `${creator.first_name ?? ""} ${creator.last_name ?? ""}`.trim() ||
                      "Team member"
                    : "—"}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Setter
                </p>
                <p className={`text-sm ${pageText}`}>
                  {lead.setter_id
                    ? safeValue(setterName ?? "Team member")
                    : "—"}
                </p>
              </div>

              {lead.closer_id ? (
                <div className="space-y-1">
                  <p
                    className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                  >
                    Closer
                  </p>
                  <p className={`text-sm ${pageText}`}>
                    {safeValue(closerName ?? "Team member")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Core details */}
          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-3 text-sm font-semibold ${cardTitle}`}>
              Core Details
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Lead Name
                </p>
                <p className={`text-sm ${pageText}`}>{safeValue(leadLabel)}</p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Niche / Industry
                </p>
                <p className={`text-sm ${pageText}`}>{safeValue(lead.niche)}</p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Lead Type
                </p>
                <p className={`text-sm ${pageText}`}>
                  {labelizeEnum(lead.lead_type)}
                </p>
              </div>

              {lead.lead_type === "individual" && (
                <div className="space-y-1">
                  <p
                    className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                  >
                    Gender
                  </p>
                  <p className={`text-sm ${pageText}`}>
                    {labelizeEnum(lead.gender)}
                  </p>
                </div>
              )}

              <div className="space-y-1 md:col-span-2">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Location
                </p>
                <p className={`text-sm ${pageText}`}>{locationLine || "—"}</p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Primary Contact Type
                </p>
                <p className={`text-sm ${pageText}`}>
                  {labelizeEnum(lead.primary_contact_type)}
                </p>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Primary Contact
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
                    <span className="truncate">{contactValue || "—"}</span>
                  </a>
                ) : (
                  <p className={`text-sm ${pageText}`}>
                    {contactValue ? contactValue : "—"}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Source Category
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.source_category ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pillNeutral}`}
                    >
                      {labelizeEnum(lead.source_category)}
                    </span>
                  ) : (
                    <span className={`text-sm ${pageText}`}>—</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}
                >
                  Source Name
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.source_name ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${pillNeutral}`}
                    >
                      {labelizeEnum(lead.source_name)}
                    </span>
                  ) : (
                    <span className={`text-sm ${pageText}`}>—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Custom fields */}
          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <h2 className={`mb-3 text-sm font-semibold ${cardTitle}`}>
              Additional Fields
            </h2>

            {customFieldDefs.length === 0 ? (
              <p className={`text-sm ${mutedText}`}>
                No custom fields configured for this workspace yet.
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
                          <span className="truncate">{raw}</span>
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
                        {formatCustomValue(value)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div
            className={`rounded-2xl border px-4 py-4 shadow-sm ${cardShell}`}
          >
            <div className="mb-3">
              <h2 className={`text-sm font-semibold ${cardTitle}`}>Notes</h2>
              <p className={`mt-1 text-xs ${mutedText}`}>
                Internal notes about this lead. Only visible to your team.
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
              {String(lead.notes ?? "").trim() ? (
                String(lead.notes)
              ) : (
                <span className={isDark ? "text-slate-600" : "text-slate-400"}>
                  No notes yet.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: timeline */}
        <div
          className={`flex h-full flex-col rounded-2xl border shadow-sm ${timelineWrap}`}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${cardBorderSoft}`}
          >
            <div>
              <h2 className={`text-sm font-semibold ${cardTitle}`}>
                Activity Timeline
              </h2>
              <p className={`text-xs ${mutedText}`}>
                Newest activity at the top.
              </p>
            </div>

            {canManageLeadActions && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/leads/${encodeURIComponent(normalizedLeadId)}/messages`,
                  )
                }
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold shadow-sm cursor-pointer",
                  isDark
                    ? "border-emerald-900/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    : "border-emerald-300 bg-emerald-50 text-emerald-600 hover:border-emerald-400 hover:bg-emerald-100",
                ].join(" ")}
                title="Log new message"
              >
                +
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messagesLoading ? (
              <p className={`text-xs ${mutedText}`}>Loading…</p>
            ) : timelineMessages.length === 0 ? (
              <p className={`text-xs ${mutedText}`}>No messages yet.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {timelineMessages.map((m) => {
                  const isOutbound = m.direction === "outbound";
                  const isInbound = m.direction === "inbound";
                  const isPipeline = isPipelineEvent(m);

                  const bodyLower = (m.body ?? "").toLowerCase();

                  const isBookingLinkEvent =
                    isPipeline &&
                    (bodyLower.includes("booking link") ||
                      bodyLower.includes("/b/") ||
                      bodyLower.includes("schedule page"));

                  const isBookedCallEvent =
                    isPipeline && isBookedCallMessage(m);

                  const isLeadCreatedEvent = isLeadCreatedTimelineMessage(m);
                  const isRejectedEvent = isLeadRejectedEvent(m);

                  const isAttendance = isCallAttendanceEvent(m);
                  const isOfferMade = isCallOfferMadeEvent(m);
                  const isClosed = isCallClosedEvent(m);

                  const isLegacyOutcome = isLegacyCallOutcomeEvent(m);

                  const first = m.sender?.first_name ?? "";
                  const last = m.sender?.last_name ?? "";
                  const fullName = `${first} ${last}`.trim();

                  const prospectorName = fullName || "Team member";

                  const authorName = isInbound
                    ? leadLabel
                    : isLeadCreatedEvent
                      ? prospectorName
                      : fullName || "Team member";
                  const roleLabel = isInbound ? "Lead" : "Team";

                  const avatarUrl = isOutbound
                    ? (m.sender?.avatar_url ?? null)
                    : null;
                  const initials = isOutbound
                    ? initialsFromName(first, last)
                    : leadInitials;

                  const tsLabel = fmtMessageTimestamp(
                    m.sent_at,
                    viewerTz || "UTC",
                  );

                  let pipelineIcon = "/icons/stage-change.svg";
                  if (isLeadCreatedEvent) pipelineIcon = "/icons/new-lead.svg";
                  else if (isRejectedEvent)
                    pipelineIcon = "/icons/lead-rejected.svg";
                  else if (isAttendance) {
                    const parts = String(m.body || "").split("|");
                    const next = parts[3] ?? "unknown";
                    pipelineIcon = iconForAttendance(next);
                  } else if (isOfferMade) {
                    pipelineIcon = "/icons/call-offer-made.svg";
                  } else if (isClosed) {
                    pipelineIcon = "/icons/call-closed.svg";
                  } else if (isLegacyOutcome) {
                    pipelineIcon = iconForLegacyOutcome(m.body);
                  } else if (isBookedCallEvent)
                    pipelineIcon = "/icons/booked-call.svg";
                  else if (isBookingLinkEvent)
                    pipelineIcon = "/icons/booking-link.svg";

                  const pipelineAlt = isLeadCreatedEvent
                    ? "New lead"
                    : isRejectedEvent
                      ? "Lead rejected"
                      : isAttendance
                        ? "Call status"
                        : isOfferMade
                          ? "Offer made"
                          : isClosed
                            ? "Closed on call"
                            : isLegacyOutcome
                              ? "Call outcome update"
                              : isBookedCallEvent
                                ? "Call booked"
                                : isBookingLinkEvent
                                  ? "Booking link sent"
                                  : "Pipeline activity";

                  const offerParsed = isOfferMade
                    ? parseOfferMade(m.body)
                    : null;
                  const offerTitle = offerParsed?.productId
                    ? (productLabels[offerParsed.productId] ?? null)
                    : null;

                  const closedParsed = isClosed
                    ? parseClosedOnCall(m.body)
                    : null;
                  const closedTitle = closedParsed?.productId
                    ? (productLabels[closedParsed.productId] ?? null)
                    : null;

                  const rejectedParsed = isRejectedEvent
                    ? parseLeadRejected(m.body)
                    : null;
                  const newSetterName = rejectedParsed?.newSetterId
                    ? (profileLabels[rejectedParsed.newSetterId] ?? null)
                    : null;

                  return (
                    <div key={m.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {isPipeline ? (
                          <img
                            src={pipelineIcon}
                            alt={pipelineAlt}
                            className={[
                              "h-8 w-8 rounded-full object-cover border",
                              isDark ? "border-slate-800" : "border-slate-200",
                            ].join(" ")}
                          />
                        ) : avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={authorName}
                            className={[
                              "h-8 w-8 rounded-full object-cover border",
                              isDark ? "border-slate-800" : "border-slate-200",
                            ].join(" ")}
                          />
                        ) : (
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                              isOutbound
                                ? "bg-indigo-600"
                                : isDark
                                  ? "bg-slate-700"
                                  : "bg-slate-500"
                            }`}
                          >
                            {initials}
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div
                          className={`rounded-xl border px-3 py-2 ${timelineItem}`}
                        >
                          <div
                            className={`mb-1 flex items-center justify-between gap-2 text-[11px] ${timelineMeta}`}
                          >
                            <span className="flex items-center gap-1">
                              <span
                                className={`font-semibold ${timelineAuthor}`}
                              >
                                {authorName}
                              </span>
                              <span
                                className={
                                  isDark ? "text-slate-500" : "text-slate-400"
                                }
                              >
                                · {roleLabel} · {formatChannel(m.channel)}
                              </span>
                            </span>
                            <span>{tsLabel}</span>
                          </div>

                          <p
                            className={`whitespace-pre-wrap text-[11px] ${timelineBody}`}
                          >
                            {isLeadCreatedEvent
                              ? formatLeadCreatedBody(m.body, leadLabel)
                              : isRejectedEvent
                                ? formatLeadRejectedBody(m.body, newSetterName)
                                : isAttendance
                                  ? formatAttendanceBody(m.body)
                                  : isOfferMade
                                    ? formatOfferMadeBody(m.body, offerTitle)
                                    : isClosed
                                      ? formatClosedBody(m.body, closedTitle)
                                      : isLegacyOutcome
                                        ? formatLegacyOutcomeBody(m.body)
                                        : isBookedCallEvent
                                          ? formatBookedCallBody(
                                              m.body,
                                              viewerTz || "UTC",
                                            )
                                          : isBookingLinkEvent
                                            ? formatBookingLinkTimelineBody(
                                                m.body,
                                              )
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

      <ConfirmModal
        open={rejectConfirmOpen}
        isDark={isDark}
        tone="warning"
        title="Reject Lead?"
        message="This lead will be reassigned to another team member and logged in the timeline."
        confirmText="Reject Lead"
        cancelText="Cancel"
        loading={rejecting}
        onCancel={() => setRejectConfirmOpen(false)}
        onConfirm={confirmRejectLead}
      />

      {/* Booking modal */}
      {isBookingModalOpen && canManageLeadActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className="absolute inset-0"
            onClick={() => setIsBookingModalOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create booking link"
            className={[
              "relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl",
              isDark
                ? "border-slate-800 bg-slate-950"
                : "border-slate-200 bg-white",
            ].join(" ")}
          >
            <div className="flex items-center justify-between bg-indigo-600 px-6 py-4 text-white">
              <div>
                <h2 className="text-lg font-semibold">Create booking link</h2>
                <p className="mt-1 text-xs text-indigo-100">
                  Choose a schedule page below. We’ll generate a unique invite
                  for this lead and log it in the timeline.
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
                        Latest link
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
                          setInviteSuccess("Booking link copied to clipboard.");
                        } catch {
                          setInviteSuccess(
                            "Copy failed — copy manually from the link.",
                          );
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {bookingLinksLoading ? (
                <p className={`text-sm ${mutedText}`}>
                  Loading schedule pages…
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
                      alt="Schedule page"
                      className="h-8 w-8"
                    />

                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${titleText}`}>
                        No schedule pages yet
                      </p>
                      <p
                        className={`mt-1 text-xs leading-relaxed ${mutedText}`}
                      >
                        Create a schedule page first so you can generate a
                        booking link for this lead.
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={goToBookingLinksSettings}
                          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
                        >
                          Create schedule page
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsBookingModalOpen(false)}
                          className={[
                            "inline-flex items-center justify-center rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-sm cursor-pointer",
                            secondaryBtn,
                          ].join(" ")}
                        >
                          Not now
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
                            Schedule page
                          </th>
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            Type
                          </th>
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            Host
                          </th>
                          <th
                            className={[
                              "border-b px-4 py-2 font-semibold",
                              isDark
                                ? "border-slate-800 text-slate-200"
                                : "border-slate-200 text-slate-700",
                            ].join(" ")}
                          >
                            Action
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
                                      ? "Lead id must be a UUID to create an invite."
                                      : undefined
                                  }
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
                  className={[
                    "rounded-lg border px-4 py-2 text-xs font-semibold shadow-sm cursor-pointer",
                    secondaryBtn,
                  ].join(" ")}
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
