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

  source_category: "inbound" | "outbound" | "referral" | "partner" | "purchased" | null;
  source_name: "instagram" | "facebook" | "reddit" | "twitter_x" | "other" | null;

  created_at: string;
  updated_at?: string | null;

  custom_values: Record<string, any>;

  prospector_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;

  notes?: string | null;

  score?: number | null;
  score_updated_at?: string | null;
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

function buildNormalizedCustomMap(custom: Record<string, any> | null | undefined) {
  const out: Record<string, any> = {};
  const obj = custom && typeof custom === "object" ? custom : {};
  for (const [k, v] of Object.entries(obj)) out[normalizeKey(k)] = v;
  return out;
}

function getCustomValue(
  custom: Record<string, any> | null | undefined,
  normalizedCustom: Record<string, any>,
  fieldKey: string
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

type LeadDetailClientProps = {
  leadId?: string;
};

const RESERVED_CUSTOM_KEYS_NORMALIZED = new Set<string>(["lead_name"].map(normalizeKey));

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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
    console.error("[LeadDetail] leads API failed", res.status, ct, text.slice(0, 300));
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
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      }
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
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <div className="mb-3 h-4 w-28 rounded bg-slate-100" />
            <SkeletonPill w="w-28" />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <div className="mb-3 h-4 w-32 rounded bg-slate-100" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <SkeletonLine w="w-24" />
                  <SkeletonLine w={i % 2 === 0 ? "w-52" : "w-40"} />
                </div>
              ))}
            </div>
          </div>
        </div>

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
  return body.startsWith("lead_created|") || body.startsWith("lead created|") || body.includes("new lead");
}

function formatLeadCreatedBody(body: string, leadLabel: string) {
  const raw = String(body || "");
  const parts = raw.split("|");
  const labelFromBody = (parts[1] ?? "").trim();
  const label = labelFromBody || leadLabel;
  return `New lead added: ${label}`;
}

/* -------------------- call-outcome timeline helpers (SEPARATE STATES + legacy support) -------------------- */

function isPipelineEvent(m: LeadMessage) {
  return (m.channel ?? "").toLowerCase() === "pipeline";
}

function isCallAttendanceEvent(m: LeadMessage) {
  return isPipelineEvent(m) && String(m.body ?? "").toUpperCase().startsWith("CALL_ATTENDANCE|");
}
function isCallOfferMadeEvent(m: LeadMessage) {
  return isPipelineEvent(m) && String(m.body ?? "").toUpperCase().startsWith("CALL_OFFER_MADE|");
}
function isCallClosedEvent(m: LeadMessage) {
  return isPipelineEvent(m) && String(m.body ?? "").toUpperCase().startsWith("CALL_CLOSED_ON_CALL|");
}

/**
 * Legacy combined format that you still have in DB:
 * CALL_OUTCOME|<bookingId>|<prevStatus>|<nextStatus>|<offerMade0/1>|<closed0/1>
 */
function isLegacyCallOutcomeEvent(m: LeadMessage) {
  return isPipelineEvent(m) && String(m.body ?? "").toUpperCase().startsWith("CALL_OUTCOME|");
}

function normalizeOutcomeStatus(v: string) {
  const s = String(v ?? "").trim().toLowerCase();
  const allowed = new Set(["unknown", "attended", "no_show", "cancelled", "rescheduled"]);
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

/**
 * Offer-made format supported:
 * - CALL_OFFER_MADE|bookingId|1/0|productId
 * - CALL_OFFER_MADE|bookingId|1/0|productId|productTitle
 *
 * IMPORTANT: your DB stores Stripe product IDs in booking_outcomes.offer_product_id,
 * so productId here may be a Stripe product id (e.g. "prod_...").
 */
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

function formatClosedBody(body: string, productTitle: string | null) {
  const { on } = parseClosedOnCall(body);
  if (!on) return "Closed on call removed";

  const title = String(productTitle ?? "").trim();
  return title ? `Closed on call: ${title}` : "Closed on call";
}


function parseClosedOnCall(body: string) {
  // CALL_CLOSED_ON_CALL|bookingId|1/0|productId?
  const parts = String(body || "").split("|");
  const on = String(parts[2] ?? "0").trim() === "1";
  const productId = String(parts[3] ?? "").trim(); // optional
  return { on, productId };
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
  // CALL_OUTCOME|bookingId|prev|next|offer|closed  -> NEVER show bookingId or raw string
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

/* -------------------- booked call parsing helpers (UNCHANGED) -------------------- */

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

function isBookedCallMessage(m: LeadMessage) {
  const isPipeline = (m.channel ?? "").toLowerCase() === "pipeline";
  if (!isPipeline) return false;
  const body = (m.body ?? "").toLowerCase();
  return body.includes("booked a call") || body.includes("call booked for") || body.includes("booked_call|");
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

/* -------------------- stripe product title lookup (for offer-made events) -------------------- */

function isStripeProdOrPriceId(id: string) {
  return /^prod_[a-zA-Z0-9]+$/.test(id) || /^price_[a-zA-Z0-9]+$/.test(id);
}


/**
 * Calls /api/stripe/products to resolve Stripe prod_... IDs -> product names.
 * Returns: { [prodId]: "Name" }
 */
async function fetchStripeProductLabels(ids: string[]): Promise<Record<string, string>> {
  const uniq: string[] = Array.from(
    new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean).filter(isStripeProdOrPriceId))
  );
  if (uniq.length === 0) return {};

  try {
    // ✅ IMPORTANT: billing endpoints require Authorization
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
      console.error("[LeadDetail] /api/billing/products/labels failed", res.status, ct, json);
      return {};
    }

    const labels = json?.labels;
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

function logSupabaseError(prefix: string, error: any, extra?: Record<string, any>) {
  if (!error) return;
  console.error(prefix, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    ...extra,
  });
}

/* -------------------- page component -------------------- */

export function LeadDetailClient({ leadId }: LeadDetailClientProps) {
  const router = useRouter();
  const normalizedLeadId = useMemo(() => safeDecode(String(leadId ?? "")).trim(), [leadId]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);
  const [canDeleteLead, setCanDeleteLead] = useState(false);

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

  const [creator, setCreator] = useState<CreatorProfile | null>(null);

  const [bookingLinks, setBookingLinks] = useState<BookingLinkRow[]>([]);
  const [bookingLinksLoading, setBookingLinksLoading] = useState(false);
  const [bookingLinksError, setBookingLinksError] = useState<string | null>(null);

  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  const [hasBookedCalls, setHasBookedCalls] = useState(false);
  const [callsCheckLoading, setCallsCheckLoading] = useState(false);

  // productId (stripe prod_...) -> productTitle
  const [productLabels, setProductLabels] = useState<Record<string, string>>({});

  const activeBookingLinks = useMemo(() => (bookingLinks ?? []).filter((b) => !b.deleted_at), [bookingLinks]);

  const normalizedCustom = useMemo(() => buildNormalizedCustomMap(lead?.custom_values ?? {}), [lead?.custom_values]);

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

  function initialsFromSingleString(label: string) {
    const parts = label.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0]?.charAt(0).toUpperCase() || "L") + (parts[1]?.charAt(0).toUpperCase() || "");
  }

  function formatChannel(c: string | null): string {
    if (!c) return "DM";
    return c.toUpperCase();
  }

  function getScoreGrade(score: number | null) {
    if (score == null) return { label: "Unscored", short: "?", circle: "bg-slate-100 text-slate-500" };
    if (!thresholds) return { label: "Scored", short: "S", circle: "bg-amber-100 text-amber-800" };
    const { low, high } = thresholds;
    if (score < low) return { label: "Low", short: "L", circle: "bg-rose-100 text-rose-800" };
    if (score >= high) return { label: "High", short: "H", circle: "bg-emerald-100 text-emerald-800" };
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
      console.error("[LeadDetail] /api/crm/lead-messages error", res.status, ct, text.slice(0, 400));
      throw new Error("Failed to load messages");
    }
    if (!ct.includes("application/json")) {
      const text = await res.text();
      console.error("[LeadDetail] /api/crm/lead-messages returned non-JSON", res.status, ct, text.slice(0, 400));
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
    return body.includes("calendar event") || body.includes("calendar event:") || body.includes("event:");
  }

  /* ---------- 1) Load teamId + role + current user id ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (!cancelled) {
            setTeamId(null);
            setCurrentUserId(null);
            setIsManagerOrAdmin(false);
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

        let tId: string | null = profile?.team_id ?? null;

        if (!tId) {
          const metaTeam = (userRes.user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) tId = metaTeam;
        }

        const roles = (profile?.role ?? []) as string[];
        const normRoles = roles.map((r) => String(r).trim().toLowerCase());
        const managerOrAdmin = normRoles.includes("manager") || normRoles.includes("admin");

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
          setIsManagerOrAdmin(managerOrAdmin);
          setCanDeleteLead(managerOrAdmin);
        }

        if (profileError && profileError.code !== "PGRST116") {
          logSupabaseError("[LeadDetail] Failed to load profile", profileError);
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setCurrentUserId(null);
          setIsManagerOrAdmin(false);
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
          return;
        }

        const normalized = { ...leadRes, custom_values: leadRes.custom_values ?? {} };
        setLead(normalized);

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
            logSupabaseError("[LeadDetail] Failed to load creator profile", creatorError);
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

  /* ---------- 3.1) Build timeline list (newest at top, lead-created at bottom) ---------- */
  const leadLabel: string = useMemo(() => {
    if (!lead) return "Lead in pipeline";

    const directCol = String(lead.lead_name ?? "").trim();
    if (directCol) return directCol;

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

    finalList.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
    return finalList;
  }, [messages, lead, leadLabel, creator]);

  /* ---------- 3.2) Product title lookup for offer-made items (Stripe) ---------- */
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

      const uniq = Array.from(new Set([...offerIds, ...closedIds].filter(isStripeProdOrPriceId)));
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

  /* ---------- 3.5) Determine if lead booked calls (Calls button) ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      const tId = teamId;
      if (!tId) return;
      if (!hasLeadId) return;
      if (!lead) return;

      const allowed = isManagerOrAdmin || (currentUserId && String(lead.closer_id ?? "") === String(currentUserId));

      if (!allowed) {
        if (!cancelled) setHasBookedCalls(false);
        return;
      }

      try {
        setCallsCheckLoading(true);
        const yes = await fetchHasCalls(tId, normalizedLeadId);
        if (!cancelled) setHasBookedCalls(yes);
      } finally {
        if (!cancelled) setCallsCheckLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, hasLeadId, normalizedLeadId, lead, lead?.closer_id, isManagerOrAdmin, currentUserId]);

  /* ---------- 4) Load booking links ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded) return;

      const tId = teamId;

      if (!tId) return;
      if (!canManageLeadActions) return;

      try {
        setBookingLinksLoading(true);
        setBookingLinksError(null);

        const { data, error } = await supabase
          .from("booking_links")
          .select("id, name, slug, booking_type, owner_user_id, deleted_at")
          .eq("team_id", tId)
          .order("created_at", { ascending: false });

        if (error) {
          logSupabaseError("[LeadDetail] booking_links load error", error);
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

        const ownerIds = Array.from(new Set(rows.map((r) => r.owner_user_id).filter(Boolean) as string[]));

        const ownerMap = new Map<string, string>();
        if (ownerIds.length) {
          const { data: owners, error: ownerErr } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", ownerIds);

          if (ownerErr) {
            logSupabaseError("[LeadDetail] owners load error", ownerErr);
          } else {
            (owners ?? []).forEach((p: any) => {
              const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
              ownerMap.set(p.id, full || "Host");
            });
          }
        }

        const hydrated: BookingLinkRow[] = rows.map((r) => ({
          ...r,
          owner_name: r.owner_user_id ? ownerMap.get(r.owner_user_id) ?? "Host" : "Host",
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
  }, [workspaceLoaded, teamId, canManageLeadActions]);

  async function createBookingInvite(bookingLinkId: string) {
    if (!canManageLeadActions) return;

    if (!leadIdIsUuid) {
      setInviteError("Invalid lead id (expected UUID).");
      return;
    }
    if (!isUuid(bookingLinkId)) {
      setInviteError("Invalid booking link id.");
      return;
    }

    const selected = bookingLinks.find((b) => b.id === bookingLinkId);
    if (selected?.deleted_at) {
      setInviteError("That schedule page was deleted and can’t be used.");
      return;
    }

    setInviteLoadingId(bookingLinkId);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(normalizedLeadId)}/booking-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingLinkId }),
      });

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

      const tId = teamId;

      if (tId) {
        setMessagesLoading(true);
        try {
          const loaded = await fetchMessages(tId, normalizedLeadId);
          setMessages(loaded);
        } finally {
          setMessagesLoading(false);
        }

        const allowed = isManagerOrAdmin || (currentUserId && String(lead?.closer_id ?? "") === String(currentUserId));
        if (allowed) {
          setCallsCheckLoading(true);
          try {
            const yes = await fetchHasCalls(tId, normalizedLeadId);
            setHasBookedCalls(yes);
          } finally {
            setCallsCheckLoading(false);
          }
        } else {
          setHasBookedCalls(false);
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

  /* ---------- early returns ---------- */
  if (!mounted || !workspaceLoaded || loading) {
    return <LeadDetailPageSkeleton />;
  }

  if (workspaceLoaded && !teamId) {
    return (
      <p className="text-sm text-slate-500">
        You don&apos;t seem to be in any team yet. Open this page from a workspace, or complete onboarding first.
      </p>
    );
  }

  if (!hasLeadId) {
    return <p className="text-sm text-rose-600">Missing lead id in route params (check your dynamic segment name).</p>;
  }

  if (!lead) return <p className="text-sm text-slate-500">Lead not found.</p>;

  const createdDT = DateTime.fromISO(lead.created_at, { setZone: true }).setZone(viewerTz || "UTC");
  const createdLabel = createdDT.isValid ? createdDT.toLocaleString(DateTime.DATETIME_SHORT) : lead.created_at;

  const updatedIso = lead.updated_at ?? null;
  const updatedDT = updatedIso ? DateTime.fromISO(updatedIso, { setZone: true }).setZone(viewerTz || "UTC") : null;
  const updatedLabel = updatedDT && updatedDT.isValid ? updatedDT.toLocaleString(DateTime.DATETIME_SHORT) : "—";

  const score = lead.score ?? null;
  const gradeInfo = getScoreGrade(score);

  const contactValue = String(lead.primary_contact_value ?? "").trim();
  const contactLink = contactValue ? contactHref(lead.primary_contact_type, contactValue) : null;

  const postal = lead.postal_code?.trim() || "";
  const city = lead.city?.trim() || "";
  const region = lead.region?.trim() || "";
  const country = lead.country?.trim() || "";

  const firstPart = [postal, city].filter(Boolean).join(" ").trim();
  const locationLine = [firstPart, region, country].filter(Boolean).join(", ");

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        {/* LEFT */}
        <div className="space-y-6 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{leadLabel}</h1>
              <p className="text-sm text-slate-500">Created on {createdLabel}</p>
            </div>

            <div className="flex gap-2">
              {canSeeCallsButton && (
                <button
                  type="button"
                  disabled={!normalizedLeadId || callsCheckLoading}
                  onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/calls`)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs font-semibold",
                    "border border-emerald-300",
                    "bg-emerald-50 text-emerald-700",
                    "hover:bg-emerald-100 hover:border-emerald-400",
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
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  title="Create a unique booking link for this lead"
                >
                  Booking link
                </button>
              )}

              {canManageLeadActions && (
                <button
                  type="button"
                  onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/edit`)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold !text-white shadow-sm hover:bg-indigo-700 cursor-pointer h-[28px] w-16"
                >
                  Edit
                </button>
              )}

              {canDeleteLead && (
                <button
                  type="button"
                  onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/delete`)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer h-[28px] w-16"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Score */}
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
                  {updatedLabel !== "—" && <p className="text-[11px] text-slate-500">Updated {updatedLabel}</p>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No score yet. Configure lead scoring in Settings → Lead scoring.</p>
            )}
          </div>

          {/* Stage */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Pipeline Stage</h2>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
              {lead.stage || "—"}
            </span>
          </div>

          {/* Core details */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Core Details</h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lead Name</p>
                <p className="text-sm text-slate-800">{safeValue(leadLabel)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Niche / Industry</p>
                <p className="text-sm text-slate-800">{safeValue(lead.niche)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Lead Type</p>
                <p className="text-sm text-slate-800">{labelizeEnum(lead.lead_type)}</p>
              </div>

              {lead.lead_type === "individual" && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gender</p>
                  <p className="text-sm text-slate-800">{labelizeEnum(lead.gender)}</p>
                </div>
              )}

              <div className="space-y-1 md:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</p>
                <p className="text-sm text-slate-800">{locationLine || "—"}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Primary Contact Type</p>
                <p className="text-sm text-slate-800">{labelizeEnum(lead.primary_contact_type)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Primary Contact</p>

                {contactLink ? (
                  <a
                    href={contactLink}
                    target={contactLink.startsWith("mailto:") || contactLink.startsWith("tel:") ? undefined : "_blank"}
                    rel={
                      contactLink.startsWith("mailto:") || contactLink.startsWith("tel:")
                        ? undefined
                        : "noopener noreferrer"
                    }
                    className="inline-flex max-w-full items-center gap-1 truncate text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    <span className="truncate">{contactValue || "—"}</span>
                  </a>
                ) : (
                  <p className="text-sm text-slate-800">{contactValue ? contactValue : "—"}</p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Source Category</p>
                <div className="flex flex-wrap gap-2">
                  {lead.source_category ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {labelizeEnum(lead.source_category)}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-800">—</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Source Name</p>
                <div className="flex flex-wrap gap-2">
                  {lead.source_name ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {labelizeEnum(lead.source_name)}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-800">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Custom fields */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Additional Fields</h2>

            {customFieldDefs.length === 0 ? (
              <p className="text-sm text-slate-500">No custom fields configured for this workspace yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {customFieldDefs.map((field) => {
                  const value = getCustomValue(lead.custom_values, normalizedCustom, field.storageKey);

                  if (field.type === "link" && typeof value === "string" && value.trim()) {
                    const raw = value.trim();
                    const href = normalizeUrl(raw);
                    return (
                      <div key={field.key} className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{field.label}</p>
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
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{field.label}</p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{formatCustomValue(value)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Notes</h2>
              <p className="mt-1 text-xs text-slate-500">Internal notes about this lead. Only visible to your team.</p>
            </div>

            <div
              role="textbox"
              aria-readonly="true"
              tabIndex={0}
              className={[
                "w-full rounded-lg border border-slate-200 bg-white px-3 py-2",
                "text-sm text-slate-800 whitespace-pre-wrap",
                "min-h-[140px] max-h-[320px] overflow-y-auto",
                "focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300",
              ].join(" ")}
            >
              {String(lead.notes ?? "").trim() ? String(lead.notes) : <span className="text-slate-400">No notes yet.</span>}
            </div>
          </div>
        </div>

        {/* RIGHT: timeline */}
        <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Activity Timeline</h2>
              <p className="text-xs text-slate-500">Newest activity at the top.</p>
            </div>

            {canManageLeadActions && (
              <button
                type="button"
                onClick={() => router.push(`/leads/${encodeURIComponent(normalizedLeadId)}/messages`)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-600 shadow-sm hover:border-emerald-400 hover:bg-emerald-100 cursor-pointer"
                title="Log new message"
              >
                +
              </button>
            )}
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
                  const isInbound = m.direction === "inbound";
                  const isPipeline = isPipelineEvent(m);

                  const bodyLower = (m.body ?? "").toLowerCase();

                  const isBookingLinkEvent =
                    isPipeline &&
                    (bodyLower.includes("booking link") || bodyLower.includes("/b/") || bodyLower.includes("schedule page"));

                  const isBookedCallEvent = isPipeline && isBookedCallMessage(m);

                  const isLeadCreatedEvent = isLeadCreatedTimelineMessage(m);

                  const isAttendance = isCallAttendanceEvent(m);
                  const isOfferMade = isCallOfferMadeEvent(m);
                  const isClosed = isCallClosedEvent(m);

                  const isLegacyOutcome = isLegacyCallOutcomeEvent(m);

                  const first = m.sender?.first_name ?? "";
                  const last = m.sender?.last_name ?? "";
                  const fullName = `${first} ${last}`.trim();

                  const prospectorName =
                    fullName || `${creator?.first_name ?? ""} ${creator?.last_name ?? ""}`.trim() || "Team member";

                  // ✅ NO "Setter" label; show actual user (sender). Inbound = lead name.
                  const authorName = isInbound ? leadLabel : isLeadCreatedEvent ? prospectorName : fullName || "Team member";
                  const roleLabel = isInbound ? "Lead" : "Team";

                  const avatarUrl = isOutbound ? m.sender?.avatar_url ?? null : null;
                  const initials = isOutbound ? initialsFromName(first, last) : leadInitials;

                  const tsLabel = fmtMessageTimestamp(m.sent_at, viewerTz || "UTC");

                  // ✅ icon selection
                  let pipelineIcon = "/icons/stage-change.svg";

                  if (isLeadCreatedEvent) pipelineIcon = "/icons/new-lead.svg";
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
                  } else if (isBookedCallEvent) pipelineIcon = "/icons/booked-call.svg";
                  else if (isBookingLinkEvent) pipelineIcon = "/icons/booking-link.svg";

                  const pipelineAlt = isLeadCreatedEvent
                    ? "New lead"
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

                  // Product title for offer/closed-made (productId is Stripe prod_...)
                  const offerParsed = isOfferMade ? parseOfferMade(m.body) : null;
                  const offerTitle = offerParsed?.productId ? productLabels[offerParsed.productId] ?? null : null;

                  const closedParsed = isClosed ? parseClosedOnCall(m.body) : null;
                  const closedTitle = closedParsed?.productId ? productLabels[closedParsed.productId] ?? null : null;


                  return (
                    <div key={m.id} className="flex gap-2">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {isPipeline ? (
                          <img
                            src={pipelineIcon}
                            alt={pipelineAlt}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : avatarUrl ? (
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
                              <span className="text-slate-400">· {roleLabel} · {formatChannel(m.channel)}</span>
                            </span>
                            <span>{tsLabel}</span>
                          </div>

                          <p className="whitespace-pre-wrap text-[11px] text-slate-800">
                            {isLeadCreatedEvent
                              ? formatLeadCreatedBody(m.body, leadLabel)
                              : isAttendance
                              ? formatAttendanceBody(m.body)
                              : isOfferMade
                              ? formatOfferMadeBody(m.body, offerTitle)
                              : isClosed
                              ? formatClosedBody(m.body, closedTitle)
                              : isLegacyOutcome
                              ? formatLegacyOutcomeBody(m.body)
                              : isBookedCallEvent
                              ? formatBookedCallBody(m.body, viewerTz || "UTC")
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
      {isBookingModalOpen && canManageLeadActions && (
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
                  Choose a schedule page below. We’ll generate a unique invite for this lead and log it in the timeline.
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
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Latest link</div>
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
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">Type</th>
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">Host</th>
                          <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {activeBookingLinks.map((link) => {
                          const isBusy = inviteLoadingId === link.id;

                          return (
                            <tr key={link.id} className="group border-b border-slate-100 hover:bg-slate-50/70">
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
