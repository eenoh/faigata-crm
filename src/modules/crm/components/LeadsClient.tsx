// src/modules/crm/components/LeadsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { getPipelineStages } from "@/modules/crm/data/pipelineStages";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import type { PipelineStageDef } from "@/modules/crm/data/pipelineStages";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";

type ScoreThresholds = {
  low: number;
  high: number;
};

type LeadContactType =
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

type LeadSourceCategory =
  | "inbound"
  | "outbound"
  | "referral"
  | "partner"
  | "purchased"
  | null;

type LeadSourceName =
  | "instagram"
  | "facebook"
  | "reddit"
  | "twitter_x"
  | "other"
  | null;

interface LeadRow {
  id: string;
  stage: string;

  // ✅ NEW: real DB column from API
  lead_name?: string | null;

  customValues: Record<string, any>;

  score?: number | null;

  niche?: string | null;
  lead_type?: "individual" | "business" | null;
  gender?: "male" | "female" | null;

  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;

  primary_contact_type?: LeadContactType;
  primary_contact_value?: string | null;

  source_category?: LeadSourceCategory;
  source_name?: LeadSourceName;

  prospector_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
}

/* -------------------- loading state -------------------- */

function LeadsLoadingState({ colCount = 7 }: { colCount?: number }) {
  const rows = Array.from({ length: 10 });

  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[800px] overflow-hidden rounded-xl">
        <div className="border-b border-slate-200 bg-slate-100 px-4 py-2">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: Math.max(0, colCount - 1) }).map((_, i) => (
              <div
                key={i}
                className="h-4 w-24 rounded bg-slate-200/80 animate-pulse"
              />
            ))}
            <div className="ml-auto h-4 w-16 rounded bg-slate-200/80 animate-pulse" />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((_, rIdx) => (
            <div key={rIdx} className="px-4 py-3">
              <div
                className="grid items-center gap-4"
                style={{
                  gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                }}
              >
                <div>
                  <div className="h-5 w-10 rounded-full bg-slate-200/80 animate-pulse" />
                </div>

                {Array.from({ length: Math.max(0, colCount - 3) }).map(
                  (_, cIdx) => (
                    <div
                      key={cIdx}
                      className="h-4 w-full max-w-[220px] rounded bg-slate-200/70 animate-pulse"
                    />
                  )
                )}

                <div className="justify-self-start">
                  <div className="h-6 w-20 rounded-full bg-slate-200/80 animate-pulse" />
                </div>

                <div className="justify-self-end">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-6 w-6 rounded bg-slate-200/80 animate-pulse"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 bg-white px-4 py-2">
          <div className="h-3 w-40 rounded bg-slate-200/60 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/* -------------------- helpers -------------------- */

function labelizeEnum(v: string | null | undefined) {
  if (!v) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
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

function contactHref(type: LeadContactType, value: string) {
  const raw = value.trim();
  if (!raw) return null;

  if (type === "email") return `mailto:${raw}`;
  if (type === "phone") return `tel:${raw.replace(/\s+/g, "")}`;

  if (looksLikeUrl(raw)) return normalizeUrl(raw);
  return null;
}

// ✅ FIX: prefer real DB column lead_name first, then custom_values fallbacks
function deriveLeadName(
  leadNameCol: string | null | undefined,
  customValues: Record<string, any>,
  stage: string
) {
  const directCol = String(leadNameCol ?? "").trim();
  if (directCol) return directCol;

  const cv = customValues ?? {};
  const direct = String(cv.lead_name ?? "").trim();
  if (direct) return direct;

  const preferredKeys = [
    "name",
    "full_name",
    "first_name",
    "last_name",
    "company",
    "account",
    "email",
  ];
  const entries = Object.entries(cv).map(([k, v]) => [k.toLowerCase(), v] as const);

  for (const pref of preferredKeys) {
    const match = entries.find(
      ([key, value]) =>
        key.includes(pref) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );
    if (match) return String(match[1]).trim();
  }

  const anyField = entries.find(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
  );
  if (anyField) return String(anyField[1]).trim();

  return stage ? `Lead in “${stage}” stage` : "Lead";
}

/* -------------------- column safety -------------------- */

const RESERVED_SYSTEM_KEYS = new Set<string>([
  "__score",
  "__lead_name",
  "__stage",

  "niche",
  "lead_type",
  "gender",
  "city",
  "region",
  "country",
  "postal_code",
  "primary_contact_type",
  "primary_contact_value",
  "source_category",
  "source_name",
]);

function normalizeKey(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/* -------------------- pill UI -------------------- */

function GrayPill({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex max-w-[240px] items-center truncate rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-900"
    >
      {children}
    </span>
  );
}

function GenderPill({ gender }: { gender: "male" | "female" }) {
  const isFemale = gender === "female";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        isFemale ? "bg-[#f2a2d1] text-[#cf037b]" : "bg-[#bfe1f6] text-[#2780b7]"
      }`}
    >
      {labelizeEnum(gender)}
    </span>
  );
}

/* -------------------- component -------------------- */

export function LeadsClient() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [thresholds, setThresholds] = useState<ScoreThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canAddLeads, setCanAddLeads] = useState(false);
  const [canDeleteLeads, setCanDeleteLeads] = useState(false);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);

  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const ROW_HEIGHT_PX = 44;
  const HEADER_HEIGHT_PX = 40;
  const VISIBLE_ROWS = 16;
  const TABLE_BODY_MAX_HEIGHT = HEADER_HEIGHT_PX + ROW_HEIGHT_PX * VISIBLE_ROWS;

  /* ---------- 1) Load workspace context ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[Leads] No authenticated user", userError);
          if (!cancelled) {
            setTeamId(null);
            setCurrentUserId(null);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        if (!cancelled) setCurrentUserId(userId);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id, role")
          .eq("id", userId)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[Leads] Failed to load profile", profileError);
        }

        let tId: string | null = profile?.team_id ?? null;

        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) {
            tId = metaTeam;
          }
        }

        const roles = (profile?.role ?? []) as string[];
        const normRoles = roles.map((r) => String(r).trim().toLowerCase());

        const isProspector = normRoles.includes("prospector");
        const managerOrAdmin = normRoles.includes("manager") || normRoles.includes("admin");

        if (!cancelled) {
          setTeamId(tId);
          setCanAddLeads(isProspector);
          setCanDeleteLeads(managerOrAdmin);
          setIsManagerOrAdmin(managerOrAdmin);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[Leads] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setCurrentUserId(null);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 2) Load leads / fields / thresholds ---------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workspaceLoaded) return;

      if (!teamId) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [fieldDefs, stageDefs, leadsRes, scoringConfig] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
          (async () => {
            const res = await fetch(`/api/crm/leads?teamId=${encodeURIComponent(teamId)}`);
            if (!res.ok) {
              const text = await res.text();
              console.error("[Leads] Failed to load leads", res.status, text.slice(0, 200));
              throw new Error("Failed to load leads");
            }
            return (await res.json()) as any[];
          })(),
          (async (): Promise<ScoreThresholds | null> => {
            const res = await fetch("/api/crm/lead-scoring-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamId, action: "get" }),
            });

            const ct = res.headers.get("content-type") ?? "";
            if (!res.ok || !ct.includes("application/json")) return null;

            const json = await res.json();
            const low = Number(json.thresholds?.low);
            const high = Number(json.thresholds?.high);
            if (Number.isNaN(low) || Number.isNaN(high)) return null;
            return { low, high };
          })(),
        ]);

        if (cancelled) return;

        const seen = new Set<string>();
        const safeFieldDefs = (fieldDefs ?? []).filter((f) => {
          const k = normalizeKey((f as any).key);
          if (!k) return false;
          if (RESERVED_SYSTEM_KEYS.has(k)) return false;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        setFields(safeFieldDefs);
        setStages(stageDefs);

        setLeads(
          (leadsRes ?? []).map((l) => {
            const cv = (l.custom_values ?? {}) as Record<string, any>;

            const pick = <T,>(colVal: T | null | undefined, ...cvKeys: string[]) => {
              if (
                colVal !== null &&
                colVal !== undefined &&
                (String(colVal) as any).trim?.() !== ""
              )
                return colVal;
              for (const k of cvKeys) {
                const v = cv?.[k];
                if (v !== null && v !== undefined && String(v).trim() !== "") return v as T;
              }
              return null;
            };

            return {
              id: l.id,
              stage: l.stage,

              // ✅ map real column from API
              lead_name: l.lead_name ?? null,

              customValues: cv,
              score: l.score ?? null,

              niche: pick<string>(l.niche ?? null, "niche", "industry"),
              lead_type: pick<"individual" | "business">(l.lead_type ?? null, "lead_type"),
              gender: pick<"male" | "female">(l.gender ?? null, "gender"),

              country: pick<string>(l.country ?? null, "country"),
              region: pick<string>(l.region ?? null, "region", "state", "province"),
              city: pick<string>(l.city ?? null, "city"),
              postal_code: pick<string>(l.postal_code ?? null, "postal_code", "zip", "zip_code"),

              primary_contact_type: pick<LeadContactType>(
                l.primary_contact_type ?? null,
                "primary_contact_type",
                "contact_type"
              ),
              primary_contact_value: pick<string>(
                l.primary_contact_value ?? null,
                "primary_contact_value",
                "primary_contact",
                "contact"
              ),

              source_category: pick<LeadSourceCategory>(l.source_category ?? null, "source_category"),
              source_name: pick<LeadSourceName>(l.source_name ?? null, "source_name"),

              prospector_id: l.prospector_id ?? null,
              setter_id: l.setter_id ?? null,
              closer_id: l.closer_id ?? null,
            } as LeadRow;
          })
        );

        setThresholds(scoringConfig);
      } catch (err) {
        console.error("[Leads] Failed to load leads", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoaded]);

  /* ---------- columns ---------- */

  type TableCol =
    | { kind: "score"; key: "__score"; label: string }
    | { kind: "core"; key: string; label: string }
    | { kind: "custom"; key: string; label: string; type: LeadFieldDefinition["type"] }
    | { kind: "stage"; key: "__stage"; label: string };

  const columns: TableCol[] = useMemo(() => {
    const core: TableCol[] = [
      { kind: "score", key: "__score", label: "Score" },

      { kind: "core", key: "__lead_name", label: "Lead Name" },
      { kind: "core", key: "niche", label: "Niche / Industry" },
      { kind: "core", key: "lead_type", label: "Lead Type" },
      { kind: "core", key: "gender", label: "Gender" },

      { kind: "core", key: "city", label: "City" },
      { kind: "core", key: "region", label: "Region" },
      { kind: "core", key: "country", label: "Country" },
      { kind: "core", key: "postal_code", label: "Postal Code" },

      { kind: "core", key: "primary_contact_type", label: "Primary Contact Type" },
      { kind: "core", key: "primary_contact_value", label: "Primary Contact" },
      { kind: "core", key: "source_category", label: "Source Category" },
      { kind: "core", key: "source_name", label: "Source Name" },

      { kind: "stage", key: "__stage", label: "Stage" },
    ];

    const additionalRaw: TableCol[] = (fields ?? [])
      .map((f) => ({
        kind: "custom" as const,
        key: normalizeKey(f.key),
        label: f.label,
        type: f.type,
      }))
      .filter((c) => c.key && !RESERVED_SYSTEM_KEYS.has(c.key));

    const out: TableCol[] = [];
    const seen = new Set<string>();
    for (const c of [...core, ...additionalRaw]) {
      const k = `${c.kind}:${c.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }, [fields]);

  /* ---------- filtering ---------- */

  const visibleLeads = useMemo(() => {
    if (isManagerOrAdmin) return leads;
    if (!currentUserId) return [];
    return leads.filter(
      (l) =>
        l.prospector_id === currentUserId ||
        l.setter_id === currentUserId ||
        l.closer_id === currentUserId
    );
  }, [leads, currentUserId, isManagerOrAdmin]);

  const filteredLeads = useMemo(() => {
    if (!query) return visibleLeads;

    return visibleLeads.filter((lead) => {
      const leadName = deriveLeadName(lead.lead_name, lead.customValues ?? {}, lead.stage || "");
      const coreHaystack = [
        leadName,
        lead.stage,
        lead.niche,
        lead.lead_type,
        lead.gender,
        lead.city,
        lead.region,
        lead.country,
        lead.postal_code,
        lead.primary_contact_type,
        lead.primary_contact_value,
        lead.source_category,
        lead.source_name,
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase());

      if (coreHaystack.some((v) => v.includes(query))) return true;

      return Object.values(lead.customValues ?? {}).some((v) => {
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(query);
      });
    });
  }, [visibleLeads, query]);

  const totalCount = visibleLeads.length;
  const visibleCount = filteredLeads.length;

  /* ---------- actions: ALWAYS visible on the right ---------- */

  const showLogAlways = true;
  const showViewAlways = true;
  const showEditAlways = true;
  const showDeleteAlways = true;

  // widths match the sticky right offsets
  const ACTION_COL_W = 64;
  const ACTION_COL_COUNT = 4; // Log, View, Edit, Delete
  const ACTION_AREA_W = ACTION_COL_W * ACTION_COL_COUNT;

  const actionThClass =
    "border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 text-center w-16 whitespace-nowrap";
  const actionTdClass = "border-b border-slate-100 px-2 py-2 align-top text-center w-16";

  // add a clear divider between data and actions
  const actionDividerThClass = "border-l-2 border-slate-200";
  const actionDividerTdClass = "border-l-2 border-slate-200";

  function getScoreBadgeClasses(score: number | null): string {
    if (score == null) return "bg-slate-100 text-slate-400";
    if (!thresholds) return "bg-amber-50 text-amber-700";

    const { low, high } = thresholds;
    if (score < low) return "bg-rose-50 text-rose-700";
    if (score >= high) return "bg-emerald-50 text-emerald-700";
    return "bg-amber-50 text-amber-700";
  }

  if (workspaceLoaded && !teamId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don&apos;t seem to be in any team yet. Open this page from a workspace, or complete onboarding first.
      </div>
    );
  }

  /* ---------- render helpers for pills ---------- */

  const CORE_PILL_KEYS = new Set([
    "niche",
    "lead_type",
    "primary_contact_type",
    "source_category",
    "source_name",
  ]);

  /* ---------- render ---------- */

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#F1F5F9] pb-2 pt-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">
            {loading
              ? "Loading your leads…"
              : query
              ? `Showing ${visibleCount} of ${totalCount} leads you have access to.`
              : `Showing ${totalCount} leads you have access to.`}
          </p>
        </div>

        {canAddLeads && (
          <Link
            href="/leads/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-indigo-700"
          >
            + Add Leads
          </Link>
        )}
      </div>

      {loading ? (
        <LeadsLoadingState colCount={Math.max(6, columns.length + 4)} />
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          <p>No leads yet (or none you can access).</p>
          {canAddLeads && (
            <p className="mt-1">
              Click <span className="font-semibold">+ Add Lead</span> to create your first one.
            </p>
          )}
        </div>
      ) : visibleCount === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <p className="font-semibold text-slate-700">No leads match “{query}”.</p>
          <p className="mt-1">Try searching for a different name, field value, or stage.</p>
        </div>
      ) : (
        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div
            className="relative overflow-auto rounded-xl"
            style={{ maxHeight: TABLE_BODY_MAX_HEIGHT }}
          >
            <table className="min-w-max w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100">
                <tr className="text-left">
                  {columns.map((col) => (
                    <th
                      key={`${col.kind}:${col.key}`}
                      className="border-b border-slate-200 px-5 py-2 font-semibold text-slate-700 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}

                  {/* Sticky right action headers */}
                  {showLogAlways && (
                    <th
                      className={`${actionThClass} ${actionDividerThClass} sticky z-30 bg-slate-100`}
                      style={{ right: ACTION_COL_W * 3 }}
                    >
                      Log
                    </th>
                  )}
                  {showViewAlways && (
                    <th
                      className={`${actionThClass} sticky z-30 bg-slate-100`}
                      style={{ right: ACTION_COL_W * 2 }}
                    >
                      View
                    </th>
                  )}
                  {showEditAlways && (
                    <th
                      className={`${actionThClass} sticky z-30 bg-slate-100`}
                      style={{ right: ACTION_COL_W * 1 }}
                    >
                      Edit
                    </th>
                  )}
                  {showDeleteAlways && (
                    <th className={`${actionThClass} sticky right-0 z-30 bg-slate-100`}>
                      Delete
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredLeads.map((lead) => {
                  const isSetterOrCloserForLead =
                    !!currentUserId &&
                    (lead.setter_id === currentUserId || lead.closer_id === currentUserId);

                  const canLogMessagesForLead = isSetterOrCloserForLead;
                  const canEditLeadForLead = isSetterOrCloserForLead;

                  // ✅ FIX: use lead.lead_name first
                  const leadName = deriveLeadName(lead.lead_name, lead.customValues ?? {}, lead.stage || "");

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      {columns.map((col) => {
                        const cellKey = `${col.kind}:${col.key}`;

                        // Score
                        if (col.kind === "score") {
                          const score = lead.score ?? null;
                          const classes = getScoreBadgeClasses(score);

                          return (
                            <td key={cellKey} className="border-b border-slate-100 px-5 py-2.5 align-top">
                              {score != null ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
                                >
                                  {score}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          );
                        }

                        // Stage
                        if (col.kind === "stage") {
                          return (
                            <td key={cellKey} className="border-b border-slate-100 px-5 py-2.5 align-top">
                              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                                {lead.stage || "—"}
                              </span>
                            </td>
                          );
                        }

                        // Core
                        if (col.kind === "core") {
                          if (col.key === "__lead_name") {
                            return (
                              <td
                                key={cellKey}
                                className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                              >
                                {safeValue(leadName)}
                              </td>
                            );
                          }

                          if (col.key === "primary_contact_value") {
                            const raw = String(lead.primary_contact_value ?? "").trim();
                            const href = raw ? contactHref(lead.primary_contact_type ?? null, raw) : null;

                            return (
                              <td
                                key={cellKey}
                                className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                              >
                                {href ? (
                                  <a
                                    href={href}
                                    target={href.startsWith("mailto:") || href.startsWith("tel:") ? undefined : "_blank"}
                                    rel={href.startsWith("mailto:") || href.startsWith("tel:") ? undefined : "noopener noreferrer"}
                                    className="inline-flex max-w-[240px] items-center gap-1 truncate text-indigo-600 hover:text-indigo-700 hover:underline"
                                  >
                                    <span className="truncate">{raw}</span>
                                  </a>
                                ) : (
                                  safeValue(raw || null)
                                )}
                              </td>
                            );
                          }

                          if (col.key === "gender") {
                            const show = lead.lead_type === "individual" ? lead.gender : null;
                            return (
                              <td
                                key={cellKey}
                                className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                              >
                                {show ? (
                                  <GenderPill gender={show} />
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </td>
                            );
                          }

                          const v = (lead as any)[col.key];

                          // requested core fields get unified gray pill
                          if (CORE_PILL_KEYS.has(col.key)) {
                            const label =
                              col.key === "niche" ? safeValue(v ?? null) : labelizeEnum(v ?? null);
                            return (
                              <td
                                key={cellKey}
                                className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                              >
                                {label === "—" ? (
                                  <span className="text-xs text-slate-400">—</span>
                                ) : (
                                  <GrayPill title={String(label)}>{label}</GrayPill>
                                )}
                              </td>
                            );
                          }

                          // everything else normal
                          return (
                            <td
                              key={cellKey}
                              className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                            >
                              {safeValue(v ?? null)}
                            </td>
                          );
                        }

                        // Custom
                        const value = lead.customValues?.[col.key];

                        // dropdown custom fields -> gray pill
                        if (col.kind === "custom" && col.type === "select") {
                          const label = safeValue(value);
                          return (
                            <td
                              key={cellKey}
                              className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                            >
                              {label === "—" ? (
                                <span className="text-xs text-slate-400">—</span>
                              ) : (
                                <GrayPill title={String(label)}>{String(label)}</GrayPill>
                              )}
                            </td>
                          );
                        }

                        // link custom fields
                        if (
                          col.kind === "custom" &&
                          col.type === "link" &&
                          typeof value === "string" &&
                          value.trim() !== ""
                        ) {
                          const raw = value.trim();
                          const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

                          return (
                            <td
                              key={cellKey}
                              className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                            >
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex max-w-[240px] items-center gap-1 truncate text-indigo-600 hover:text-indigo-700 hover:underline"
                              >
                                <span className="truncate">{raw}</span>
                              </a>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={cellKey}
                            className="border-b border-slate-100 px-5 py-2.5 align-top text-slate-800"
                          >
                            {value !== null && value !== undefined && String(value).trim() !== ""
                              ? String(value)
                              : "—"}
                          </td>
                        );
                      })}

                      {/* Sticky right action cells */}
                      {showLogAlways && (
                        <td
                          className={`${actionTdClass} ${actionDividerTdClass} sticky bg-white`}
                          style={{ right: ACTION_COL_W * 3 }}
                        >
                          {canLogMessagesForLead ? (
                            <Link
                              href={`/leads/${lead.id}/messages`}
                              className="inline-flex p-1 !text-emerald-600 hover:!text-emerald-700 transition-colors"
                              title="Log outbound / inbound messages"
                            >
                              <PlusCircleIcon className="h-5 w-5" />
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}

                      {showViewAlways && (
                        <td
                          className={`${actionTdClass} sticky bg-white`}
                          style={{ right: ACTION_COL_W * 2 }}
                        >
                          <Link
                            href={`/leads/${lead.id}`}
                            className="inline-flex p-1 !text-slate-600 hover:!text-slate-900 transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                        </td>
                      )}

                      {showEditAlways && (
                        <td
                          className={`${actionTdClass} sticky bg-white`}
                          style={{ right: ACTION_COL_W * 1 }}
                        >
                          {canEditLeadForLead ? (
                            <Link
                              href={`/leads/${lead.id}/edit`}
                              className="inline-flex p-1 !text-indigo-600 hover:!text-indigo-700 transition-colors"
                              title="Edit Lead"
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}

                      {showDeleteAlways && (
                        <td className={`${actionTdClass} sticky right-0 bg-white`}>
                          {canDeleteLeads ? (
                            <Link
                              href={`/leads/${lead.id}/delete`}
                              className="inline-flex p-1 !text-rose-500 hover:!text-rose-600 transition-colors"
                              title="Delete Lead"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
