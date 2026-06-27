"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLeadFieldDefinitions } from "@/features/crm/data/leadFields";
import { getLeadFormNicheOptions } from "@/features/crm/data/niches";
import { getPipelineStages } from "@/features/crm/data/pipelineStages";
import { supabase } from "@/lib/supabaseClient";
import type {
  LeadContactType,
  LeadFieldDefinition,
  LeadGender,
  LeadSourceCategory,
  LeadSourceName,
  LeadType,
} from "@/features/crm/types/lead";
import type { LeadNicheOption } from "@/features/crm/server/niches.shared";
import type { PipelineStageDef } from "@/features/crm/data/pipelineStages";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useAppLocale } from "@/context/LocaleContext";
import {
  contactHref,
  deriveLeadName,
  getLeadFieldSelectLabel,
  isReservedLeadTableColumnKey,
  normalizeLeadKey as normalizeKey,
  safeValue,
} from "@/features/crm/utils/lead";
import {
  getLeadContactTypeLabel,
  getLeadGenderLabel,
  getLeadSourceCategoryLabel,
  getLeadSourceNameLabel,
  getLeadTypeLabel,
} from "@/i18n/domain-values";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

type ScoreThresholds = {
  low: number;
  high: number;
};

interface LeadRow {
  id: string;
  stage: string;
  stage_id?: string | null;
  lead_name?: string | null;
  customValues: Record<string, any>;
  displayValues?: Record<string, string | null> | null;
  score?: number | null;

  niche_id?: string | null;
  niche?: string | null;
  lead_type?: LeadType;
  gender?: LeadGender;

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

/* -------------------- pills -------------------- */

function GrayPill({
  children,
  title,
  isDark,
}: {
  children: React.ReactNode;
  title?: string;
  isDark: boolean;
}) {
  const cls = isDark
    ? "border-slate-800 bg-slate-900/60 text-slate-100"
    : "border-slate-200 bg-slate-100 text-slate-900";

  return (
    <span
      title={title}
      className={`inline-flex max-w-[240px] items-center truncate rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function GenderPill({
  gender,
  label,
}: {
  gender: "male" | "female";
  label: string;
}) {
  const isFemale = gender === "female";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        isFemale ? "bg-[#f2a2d1] text-[#cf037b]" : "bg-[#bfe1f6] text-[#2780b7]"
      }`}
    >
      {label}
    </span>
  );
}

/* -------------------- loading state -------------------- */

function LeadsLoadingState({
  colCount = 7,
  isDark,
}: {
  colCount?: number;
  isDark: boolean;
}) {
  const rows = Array.from({ length: 10 });

  const shell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const head = isDark
    ? "border-slate-800 bg-slate-900/40"
    : "border-slate-200 bg-slate-100";
  const rowDivider = isDark ? "divide-slate-900" : "divide-slate-100";
  const foot = isDark
    ? "border-slate-900 bg-slate-950"
    : "border-slate-100 bg-white";

  const skelStrong = isDark ? "bg-slate-800/80" : "bg-slate-200/80";
  const skel = isDark ? "bg-slate-800/70" : "bg-slate-200/70";
  const skelSoft = isDark ? "bg-slate-800/60" : "bg-slate-200/60";

  return (
    <div className={`flex-1 rounded-xl border shadow-sm ${shell}`}>
      <div className="max-h-[800px] overflow-hidden rounded-xl">
        <div className={`border-b px-4 py-2 ${head}`}>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: Math.max(0, colCount - 1) }).map((_, i) => (
              <div
                key={i}
                className={`h-4 w-24 rounded animate-pulse ${skelStrong}`}
              />
            ))}
            <div
              className={`ml-auto h-4 w-16 rounded animate-pulse ${skelStrong}`}
            />
          </div>
        </div>

        <div className={`divide-y ${rowDivider}`}>
          {rows.map((_, rIdx) => (
            <div key={rIdx} className="px-4 py-3">
              <div
                className="grid items-center gap-4"
                style={{
                  gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                }}
              >
                <div>
                  <div
                    className={`h-5 w-10 rounded-full animate-pulse ${skelStrong}`}
                  />
                </div>

                {Array.from({ length: Math.max(0, colCount - 3) }).map(
                  (_, cIdx) => (
                    <div
                      key={cIdx}
                      className={`h-4 w-full max-w-[220px] rounded animate-pulse ${skel}`}
                    />
                  ),
                )}

                <div className="justify-self-start">
                  <div
                    className={`h-6 w-20 rounded-full animate-pulse ${skelStrong}`}
                  />
                </div>

                <div className="justify-self-end">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-6 w-6 rounded animate-pulse ${skelStrong}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={`border-t px-4 py-2 ${foot}`}>
          <div className={`h-3 w-40 rounded animate-pulse ${skelSoft}`} />
        </div>
      </div>
    </div>
  );
}

/* -------------------- component -------------------- */

type SortDir = "asc" | "desc";
type SortState = { key: string | null; dir: SortDir };

type TeamMembershipRow = {
  team_id: string | null;
  role: unknown;
};

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
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }

  return null;
}

async function crmLocaleFetch(
  input: RequestInfo | URL,
  args: {
    accessToken: string;
    locale?: string;
    init?: RequestInit;
  },
): Promise<Response> {
  const { accessToken, locale, init } = args;

  return fetch(input, {
    ...init,
    headers: withLocaleHeader(
      {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
      locale,
    ),
  });
}

export function LeadsClient() {
  const t = useTranslations("LeadsPage");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");
  const tLeadFallback = useTranslations("LeadMessagesPage.fallback");
  const { locale } = useAppLocale();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [nicheOptions, setNicheOptions] = useState<LeadNicheOption[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [thresholds, setThresholds] = useState<ScoreThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canAddLeads, setCanAddLeads] = useState(false);
  const [canDeleteLeads, setCanDeleteLeads] = useState(false);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);

  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const ROW_HEIGHT_PX = 44;
  const HEADER_HEIGHT_PX = 40;
  const VISIBLE_ROWS = 16;
  const TABLE_BODY_MAX_HEIGHT = HEADER_HEIGHT_PX + ROW_HEIGHT_PX * VISIBLE_ROWS;

  function leadTypeLabel(value: LeadType | null | undefined) {
    return getLeadTypeLabel(tDomain, value);
  }

  function genderLabel(value: LeadGender | null | undefined) {
    return getLeadGenderLabel(tDomain, value);
  }

  function primaryContactTypeLabel(value: LeadContactType | null | undefined) {
    return getLeadContactTypeLabel(tDomain, value);
  }

  function sourceCategoryLabel(value: LeadSourceCategory | null | undefined) {
    return getLeadSourceCategoryLabel(tDomain, value);
  }

  function sourceNameLabel(value: LeadSourceName | null | undefined) {
    return getLeadSourceNameLabel(tDomain, value);
  }

  const emptyLabel = tDomain("fallbacks.empty");

  function displayValue(value: unknown) {
    return safeValue(value) ?? emptyLabel;
  }

  function displayValueOverride(lead: Pick<LeadRow, "id">, key: string) {
    return displayValuesByLead[lead.id]?.[normalizeKey(key)] ?? null;
  }

  function leadNameFallback(stage: string | null | undefined) {
    const stageLabel = safeValue(stage);
    return stageLabel
      ? tLeadFallback("leadInStage", { stage: stageLabel })
      : tLeadFallback("pipelineLead");
  }

  function resolveLeadDisplayName(
    lead: Pick<
      LeadRow,
      "id" | "lead_name" | "customValues" | "stage" | "stage_id"
    >,
  ) {
    const stageLabel = stageDisplayLabel(lead);
    return (
      deriveLeadName(
        displayValueOverride(lead, "lead_name") ?? lead.lead_name,
        displayCustomValuesByLead[lead.id] ?? lead.customValues ?? {},
        stageLabel === emptyLabel ? "" : stageLabel,
      ) ?? leadNameFallback(stageLabel === emptyLabel ? null : stageLabel)
    );
  }

  function coreDisplayLabel(
    lead: Pick<LeadRow, "id">,
    key: string,
    value: unknown,
  ) {
    if (key === "lead_type") return leadTypeLabel(value as LeadType | null);
    if (key === "gender") return genderLabel(value as LeadGender | null);
    if (key === "primary_contact_type")
      return primaryContactTypeLabel(value as LeadContactType | null);
    if (key === "source_category")
      return sourceCategoryLabel(value as LeadSourceCategory | null);
    if (key === "source_name")
      return sourceNameLabel(value as LeadSourceName | null);
    return displayValue(displayValueOverride(lead, key) ?? value);
  }

  const stageLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const stage of stages) {
      const id = String((stage as { id?: string }).id ?? "").trim();
      const name = String(stage.name ?? "").trim();
      if (id && name) map.set(id, name);
    }
    return map;
  }, [stages]);

  const stageLabelByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const stage of stages) {
      const name = String(stage.name ?? "").trim();
      const normalized = normalizeKey(name);
      if (normalized && name) map.set(normalized, name);
    }
    return map;
  }, [stages]);

  const nicheLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of nicheOptions) {
      const id = String(option.id ?? "").trim();
      const label = String(option.label ?? "").trim();
      if (id && label) map.set(id, label);
    }
    return map;
  }, [nicheOptions]);

  const fieldDefinitionByKey = useMemo(() => {
    const map = new Map<string, LeadFieldDefinition>();
    for (const field of fields) {
      const key = normalizeKey(field.key);
      if (key) map.set(key, field);
    }
    return map;
  }, [fields]);

  function stageDisplayLabel(lead: Pick<LeadRow, "stage" | "stage_id">) {
    const byId =
      typeof lead.stage_id === "string"
        ? stageLabelById.get(lead.stage_id)
        : null;
    if (byId) return byId;

    const raw = String(lead.stage ?? "").trim();
    if (!raw) return emptyLabel;

    return stageLabelByName.get(normalizeKey(raw)) ?? raw;
  }

  function nicheDisplayLabel(lead: Pick<LeadRow, "id" | "niche" | "niche_id">) {
    const byId =
      typeof lead.niche_id === "string"
        ? nicheLabelById.get(lead.niche_id)
        : null;
    if (byId) return byId;

    return displayValue(lead.niche ?? null);
  }

  function customSelectDisplayLabel(fieldKey: string, value: unknown) {
    const field = fieldDefinitionByKey.get(fieldKey);
    if (!field || field.type !== "select") {
      return displayValue(value);
    }

    return displayValue(getLeadFieldSelectLabel(field, value));
  }

  function customDisplayLabel(
    leadId: string,
    fieldKey: string,
    type: LeadFieldDefinition["type"] | undefined,
    rawValue: unknown,
  ) {
    if (type === "select") {
      return customSelectDisplayLabel(fieldKey, rawValue);
    }

    const derivedDisplayValue = displayValuesByLead[leadId]?.[fieldKey];
    return displayValue(derivedDisplayValue ?? rawValue);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

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

        const [{ data: profile, error: profileError }, membershipsResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("team_id")
              .eq("id", userId)
              .maybeSingle(),
            (supabase as any)
              .from("team_members")
              .select("team_id, role")
              .eq("user_id", userId),
          ]);

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[Leads] Failed to load profile", profileError);
        }

        const membershipError = membershipsResult?.error ?? null;
        if (membershipError) {
          console.error(
            "[Leads] Failed to load team memberships",
            membershipError,
          );
        }

        type NormalizedTeamMembershipRow = {
          team_id: string | null;
          role: unknown | null;
        };

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

        const activeRoles = membershipRows
          .filter((membership) => membership.team_id === tId)
          .flatMap((membership) => normalizeTeamRoleNames(membership.role));

        const isProspector = activeRoles.includes("prospector");
        const managerOrAdmin =
          activeRoles.includes("manager") || activeRoles.includes("admin");

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

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token ?? null;

        if (sessionError || !accessToken) {
          console.error(
            "[Leads] Missing session token for leads request",
            sessionError,
          );
          throw new Error("Unauthorized");
        }

        const [fieldDefs, stageDefs, leadsRes, scoringConfig, nicheData] =
          await Promise.all([
            getLeadFieldDefinitions(teamId, locale),
            getPipelineStages(teamId, locale),
            (async () => {
              const res = await crmLocaleFetch(
                `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`,
                {
                  accessToken,
                  locale,
                  init: {
                    cache: "no-store",
                  },
                },
              );

              if (!res.ok) {
                const text = await res.text();
                console.error(
                  "[Leads] Failed to load leads",
                  res.status,
                  text.slice(0, 200),
                );
                throw new Error("Failed to load leads");
              }

              return (await res.json()) as any[];
            })(),
            (async (): Promise<ScoreThresholds | null> => {
              const res = await crmLocaleFetch("/api/crm/lead-scoring-config", {
                accessToken,
                locale,
                init: {
                  method: "POST",
                  cache: "no-store",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ teamId, action: "get" }),
                },
              });

              const ct = res.headers.get("content-type") ?? "";
              if (!res.ok || !ct.includes("application/json")) return null;

              const json = await res.json();
              const low = Number(json.thresholds?.low);
              const high = Number(json.thresholds?.high);
              if (Number.isNaN(low) || Number.isNaN(high)) return null;
              return { low, high };
            })(),
            getLeadFormNicheOptions(undefined, locale).catch((error) => {
              console.error("[Leads] Failed to load niche options", error);
              return { ok: true as const, options: [] };
            }),
          ]);

        if (cancelled) return;

        const seen = new Set<string>();
        const safeFieldDefs = (fieldDefs ?? []).filter((f) => {
          const k = normalizeKey((f as any).key);
          if (!k) return false;
          if (isReservedLeadTableColumnKey(k)) return false;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        setFields(safeFieldDefs);
        setStages(stageDefs);
        setNicheOptions(nicheData.options ?? []);

        setLeads(
          (leadsRes ?? []).map((l) => {
            const cv = (l.custom_values ?? {}) as Record<string, any>;

            const pick = <T,>(
              colVal: T | null | undefined,
              ...cvKeys: string[]
            ) => {
              if (
                colVal !== null &&
                colVal !== undefined &&
                (String(colVal) as any).trim?.() !== ""
              ) {
                return colVal;
              }
              for (const k of cvKeys) {
                const v = cv?.[k];
                if (v !== null && v !== undefined && String(v).trim() !== "") {
                  return v as T;
                }
              }
              return null;
            };

            return {
              id: l.id,
              stage: l.stage,
              stage_id: l.stage_id ?? null,
              lead_name: l.lead_name ?? null,
              customValues: cv,
              displayValues:
                l.display_values && typeof l.display_values === "object"
                  ? (l.display_values as Record<string, string | null>)
                  : null,
              score: l.score ?? null,

              niche_id: l.niche_id ?? null,
              niche: pick<string>(l.niche ?? null, "niche", "industry"),
              lead_type: pick<"individual" | "business">(
                l.lead_type ?? null,
                "lead_type",
              ),
              gender: pick<"male" | "female">(l.gender ?? null, "gender"),

              country: pick<string>(l.country ?? null, "country"),
              region: pick<string>(
                l.region ?? null,
                "region",
                "state",
                "province",
              ),
              city: pick<string>(l.city ?? null, "city"),
              postal_code: pick<string>(
                l.postal_code ?? null,
                "postal_code",
                "zip",
                "zip_code",
              ),

              primary_contact_type: pick<LeadContactType>(
                l.primary_contact_type ?? null,
                "primary_contact_type",
                "contact_type",
              ),
              primary_contact_value: pick<string>(
                l.primary_contact_value ?? null,
                "primary_contact_value",
                "primary_contact",
                "contact",
              ),

              source_category: pick<LeadSourceCategory>(
                l.source_category ?? null,
                "source_category",
              ),
              source_name: pick<LeadSourceName>(
                l.source_name ?? null,
                "source_name",
              ),

              prospector_id: l.prospector_id ?? null,
              setter_id: l.setter_id ?? null,
              closer_id: l.closer_id ?? null,
            } as LeadRow;
          }),
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
  }, [teamId, workspaceLoaded, locale]);

  type TableCol =
    | { kind: "score"; key: "__score"; label: string }
    | { kind: "core"; key: string; label: string }
    | {
        kind: "custom";
        key: string;
        label: string;
        type: LeadFieldDefinition["type"];
      }
    | { kind: "stage"; key: "__stage"; label: string };

  const columns: TableCol[] = useMemo(() => {
    const core: TableCol[] = [
      { kind: "score", key: "__score", label: t("columns.score") },
      { kind: "core", key: "__lead_name", label: t("columns.leadName") },
      { kind: "core", key: "niche", label: t("columns.nicheIndustry") },
      { kind: "core", key: "lead_type", label: t("columns.leadType") },
      { kind: "core", key: "gender", label: t("columns.gender") },
      { kind: "core", key: "city", label: t("columns.city") },
      { kind: "core", key: "region", label: t("columns.region") },
      { kind: "core", key: "country", label: t("columns.country") },
      { kind: "core", key: "postal_code", label: t("columns.postalCode") },
      {
        kind: "core",
        key: "primary_contact_type",
        label: t("columns.primaryContactType"),
      },
      {
        kind: "core",
        key: "primary_contact_value",
        label: t("columns.primaryContact"),
      },
      {
        kind: "core",
        key: "source_category",
        label: t("columns.sourceCategory"),
      },
      { kind: "core", key: "source_name", label: t("columns.sourceName") },
      { kind: "stage", key: "__stage", label: t("columns.stage") },
    ];

    const additionalRaw: TableCol[] = (fields ?? [])
      .map((f) => ({
        kind: "custom" as const,
        key: normalizeKey(f.key),
        label: f.label,
        type: f.type,
      }))
      .filter((c) => c.key && !isReservedLeadTableColumnKey(c.key));

    const out: TableCol[] = [];
    const seen = new Set<string>();
    for (const c of [...core, ...additionalRaw]) {
      const k = `${c.kind}:${c.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }, [fields, t]);

  const columnBySortKey = useMemo(() => {
    const map = new Map<string, TableCol>();
    for (const c of columns) map.set(`${c.kind}:${c.key}`, c);
    return map;
  }, [columns]);

  const visibleLeads = useMemo(() => {
    if (isManagerOrAdmin) return leads;
    if (!currentUserId) return [];
    return leads.filter(
      (l) =>
        l.prospector_id === currentUserId ||
        l.setter_id === currentUserId ||
        l.closer_id === currentUserId,
    );
  }, [leads, currentUserId, isManagerOrAdmin]);

  const normalizedCustomValues = useMemo(() => {
    return (leads ?? []).reduce(
      (acc, lead) => {
        const cv = lead.customValues ?? {};
        const norm: Record<string, any> = {};
        for (const [k, v] of Object.entries(cv)) {
          const normalizedKey = normalizeKey(k);
          if (!normalizedKey) continue;
          norm[normalizedKey] = v;
        }
        acc[lead.id] = norm;
        return acc;
      },
      {} as Record<string, Record<string, any>>,
    );
  }, [leads]);

  const displayValuesByLead = useMemo(() => {
    return (leads ?? []).reduce(
      (acc, lead) => {
        const displayValues = lead.displayValues ?? {};
        const norm: Record<string, string | null> = {};

        for (const [key, value] of Object.entries(displayValues)) {
          const normalizedKey = normalizeKey(key);
          if (!normalizedKey) continue;
          norm[normalizedKey] = typeof value === "string" ? value : null;
        }

        acc[lead.id] = norm;
        return acc;
      },
      {} as Record<string, Record<string, string | null>>,
    );
  }, [leads]);

  const displayCustomValuesByLead = useMemo(() => {
    return (leads ?? []).reduce(
      (acc, lead) => {
        const rawValues = normalizedCustomValues[lead.id] ?? {};
        const nextValues: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(rawValues)) {
          nextValues[key] = displayValuesByLead[lead.id]?.[key] ?? value;
        }

        acc[lead.id] = nextValues;
        return acc;
      },
      {} as Record<string, Record<string, unknown>>,
    );
  }, [displayValuesByLead, leads, normalizedCustomValues]);

  const filteredLeads = useMemo(() => {
    if (!query) return visibleLeads;

    return visibleLeads.filter((lead) => {
      const leadName = resolveLeadDisplayName(lead);

      const coreHaystack = [
        leadName,
        stageDisplayLabel(lead),
        nicheDisplayLabel(lead),
        leadTypeLabel(lead.lead_type),
        genderLabel(lead.gender),
        coreDisplayLabel(lead, "city", lead.city),
        coreDisplayLabel(lead, "region", lead.region),
        coreDisplayLabel(lead, "country", lead.country),
        coreDisplayLabel(lead, "postal_code", lead.postal_code),
        primaryContactTypeLabel(lead.primary_contact_type),
        lead.primary_contact_value,
        sourceCategoryLabel(lead.source_category),
        sourceNameLabel(lead.source_name),
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase());

      if (coreHaystack.some((v) => v.includes(query))) return true;

      return (fields ?? []).some((field) => {
        const key = normalizeKey(field.key);
        if (!key) return false;

        const value = normalizedCustomValues[lead.id]?.[key];
        if (value === null || value === undefined) return false;

        return customDisplayLabel(lead.id, key, field.type, value)
          .toLowerCase()
          .includes(query);
      });
    });
  }, [
    visibleLeads,
    query,
    fields,
    normalizedCustomValues,
    displayValuesByLead,
    displayCustomValuesByLead,
  ]);

  const sortedLeads = useMemo(() => {
    if (!sort.key) return filteredLeads;

    const col = columnBySortKey.get(sort.key);
    if (!col) return filteredLeads;

    const dirMul = sort.dir === "asc" ? 1 : -1;

    const toSortableString = (v: any) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v.trim().toLowerCase();
      if (typeof v === "number") return String(v);
      if (typeof v === "boolean") return v ? "true" : "false";
      try {
        return JSON.stringify(v).toLowerCase();
      } catch {
        return String(v).toLowerCase();
      }
    };

    const getSortValue = (
      lead: LeadRow,
    ): { t: "n" | "s"; v: number | string } => {
      if (col.kind === "score") {
        const n = lead.score;
        return {
          t: "n",
          v:
            typeof n === "number" && !Number.isNaN(n)
              ? n
              : Number.NEGATIVE_INFINITY,
        };
      }

      if (col.kind === "stage") {
        return { t: "s", v: toSortableString(stageDisplayLabel(lead)) };
      }

      if (col.kind === "core") {
        if (col.key === "__lead_name") {
          const name = resolveLeadDisplayName(lead);
          return { t: "s", v: toSortableString(name) };
        }

        const raw = (lead as any)[col.key];

        if (
          col.key === "niche" ||
          col.key === "lead_type" ||
          col.key === "gender" ||
          col.key === "primary_contact_type" ||
          col.key === "source_category" ||
          col.key === "source_name"
        ) {
          return {
            t: "s",
            v: toSortableString(
              col.key === "niche"
                ? nicheDisplayLabel(lead)
                : coreDisplayLabel(lead, col.key, raw),
            ),
          };
        }

        if (typeof raw === "number") return { t: "n", v: raw };
        return {
          t: "s",
          v: toSortableString(coreDisplayLabel(lead, col.key, raw)),
        };
      }

      const rawValue = normalizedCustomValues[lead.id]?.[col.key];
      if (typeof rawValue === "number") return { t: "n", v: rawValue };
      return {
        t: "s",
        v: toSortableString(
          customDisplayLabel(lead.id, col.key, col.type, rawValue),
        ),
      };
    };

    const withIndex = filteredLeads.map((l, i) => ({ l, i }));
    withIndex.sort((a, b) => {
      const av = getSortValue(a.l);
      const bv = getSortValue(b.l);

      const aBlank =
        (av.t === "s" && String(av.v).trim() === "") ||
        (av.t === "n" && (av.v as number) === Number.NEGATIVE_INFINITY);
      const bBlank =
        (bv.t === "s" && String(bv.v).trim() === "") ||
        (bv.t === "n" && (bv.v as number) === Number.NEGATIVE_INFINITY);

      if (aBlank && !bBlank) return 1;
      if (!aBlank && bBlank) return -1;

      if (av.t === "n" && bv.t === "n") {
        const diff = (av.v as number) - (bv.v as number);
        if (diff !== 0) return diff * dirMul;
        return a.i - b.i;
      }

      const cmp = String(av.v).localeCompare(String(bv.v), locale, {
        numeric: true,
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp * dirMul;
      return a.i - b.i;
    });

    return withIndex.map((x) => x.l);
  }, [
    filteredLeads,
    sort.key,
    sort.dir,
    columnBySortKey,
    normalizedCustomValues,
    displayValuesByLead,
    displayCustomValuesByLead,
    locale,
  ]);

  const totalCount = visibleLeads.length;
  const visibleCount = filteredLeads.length;

  const showLogAlways = true;
  const showViewAlways = true;
  const showEditAlways = true;
  const showDeleteAlways = true;

  const ACTION_COL_W = 88;

  const tableShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const theadBg = isDark ? "bg-slate-950" : "bg-slate-100";
  const headBorder = isDark ? "border-slate-800" : "border-slate-200";
  const rowBorder = isDark ? "border-slate-900" : "border-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/40" : "hover:bg-slate-50";
  const cellText = isDark ? "text-slate-200" : "text-slate-800";
  const headText = isDark ? "text-slate-200" : "text-slate-700";
  const muted = isDark ? "text-slate-500" : "text-slate-400";
  const mutedDash = isDark ? "text-slate-600" : "text-slate-300";

  const stickyCellBg = isDark ? "bg-slate-950" : "bg-white";
  const stickyHeadBg = isDark ? "bg-slate-950" : "bg-slate-100";

  const dividerBorder = isDark ? "border-slate-800" : "border-slate-200";

  const actionThClass = `border-b px-2 py-2 font-semibold text-center w-16 whitespace-nowrap ${headBorder} ${headText}`;
  const actionTdClass = `border-b px-2 py-2 align-top text-center w-16 ${rowBorder}`;

  const actionDividerThClass = `border-l-2 ${dividerBorder}`;
  const actionDividerTdClass = `border-l-2 ${dividerBorder}`;

  function getScoreBadgeClasses(score: number | null): string {
    if (score == null)
      return isDark
        ? "bg-slate-900/60 text-slate-500"
        : "bg-slate-100 text-slate-400";
    if (!thresholds)
      return isDark
        ? "bg-amber-500/10 text-amber-200"
        : "bg-amber-50 text-amber-700";

    const { low, high } = thresholds;
    if (score < low)
      return isDark
        ? "bg-rose-500/10 text-rose-200"
        : "bg-rose-50 text-rose-700";
    if (score >= high)
      return isDark
        ? "bg-emerald-500/10 text-emerald-200"
        : "bg-emerald-50 text-emerald-700";
    return isDark
      ? "bg-amber-500/10 text-amber-200"
      : "bg-amber-50 text-amber-700";
  }

  const CORE_PILL_KEYS = new Set([
    "niche",
    "lead_type",
    "primary_contact_type",
    "source_category",
    "source_name",
  ]);

  const getAriaSort = (sortKey: string) => {
    if (sort.key !== sortKey) return "none" as const;
    return sort.dir === "asc"
      ? ("ascending" as const)
      : ("descending" as const);
  };

  const sortIndicator = (sortKey: string) => {
    if (sort.key !== sortKey) return null;
    return sort.dir === "asc" ? "▲" : "▼";
  };

  const onHeaderClick = (sortKey: string) => {
    setSort((prev) => {
      if (prev.key === sortKey) {
        return { key: sortKey, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      const nextDir: SortDir = sortKey === "score:__score" ? "desc" : "asc";
      return { key: sortKey, dir: nextDir };
    });
  };

  if (workspaceLoaded && !teamId) {
    return (
      <div
        className={`rounded-xl border p-6 text-sm shadow-sm ${
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-300"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        {t("empty.noWorkspace")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-inherit pb-2 pt-1">
        <div>
          <h1
            className={`text-2xl font-semibold ${
              isDark ? "text-slate-100" : "text-slate-900"
            }`}
          >
            {t("page.title")}
          </h1>
          <p
            className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            {loading
              ? t("page.loading")
              : query
                ? t("page.showingFiltered", {
                    visible: visibleCount,
                    total: totalCount,
                  })
                : t("page.showingAll", { total: totalCount })}
          </p>
        </div>

        {canAddLeads && (
          <Link
            href="/leads/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-indigo-700"
          >
            {t("actions.addLeads")}
          </Link>
        )}
      </div>

      {loading ? (
        <LeadsLoadingState
          colCount={Math.max(6, columns.length + 4)}
          isDark={isDark}
        />
      ) : totalCount === 0 ? (
        <div
          className={`rounded-xl border border-dashed p-6 text-sm ${
            isDark
              ? "border-slate-800 bg-slate-950 text-slate-400"
              : "border-slate-300 bg-slate-50 text-slate-500"
          }`}
        >
          <p>{t("empty.noLeads")}</p>
          {canAddLeads && (
            <p className="mt-1">
              {t.rich("empty.addFirstLead", {
                strong: (chunks) => (
                  <span className="font-semibold">{chunks}</span>
                ),
              })}
            </p>
          )}
        </div>
      ) : visibleCount === 0 ? (
        <div
          className={`rounded-xl border p-6 text-sm ${
            isDark
              ? "border-slate-800 bg-slate-950 text-slate-400"
              : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <p
            className={`font-semibold ${
              isDark ? "text-slate-200" : "text-slate-700"
            }`}
          >
            {t("empty.noMatch", { query })}
          </p>
          <p className="mt-1">{t("empty.tryDifferentSearch")}</p>
        </div>
      ) : (
        <div className={`flex-1 rounded-xl border shadow-sm ${tableShell}`}>
          <div
            className="relative overflow-auto rounded-xl"
            style={{ maxHeight: TABLE_BODY_MAX_HEIGHT }}
          >
            <table className="min-w-max w-full border-collapse text-sm">
              <thead className={`sticky top-0 z-20 ${theadBg}`}>
                <tr className="text-left">
                  {columns.map((col) => {
                    const sortKey = `${col.kind}:${col.key}`;
                    const active = sort.key === sortKey;

                    return (
                      <th
                        key={sortKey}
                        aria-sort={getAriaSort(sortKey)}
                        className={`border-b px-5 py-2 font-semibold whitespace-nowrap ${headBorder} ${headText}`}
                      >
                        <button
                          type="button"
                          onClick={() => onHeaderClick(sortKey)}
                          className={[
                            "inline-flex items-center gap-2 select-none cursor-pointer",
                            "hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 focus-visible:ring-offset-2",
                            isDark
                              ? "focus-visible:ring-offset-slate-950"
                              : "focus-visible:ring-offset-white",
                            active ? "opacity-100" : "opacity-80",
                          ].join(" ")}
                          title={t("actions.sortBy", { label: col.label })}
                        >
                          <span>{col.label}</span>
                          <span
                            className={[
                              "text-[10px] leading-none",
                              active
                                ? isDark
                                  ? "text-indigo-200"
                                  : "text-indigo-700"
                                : isDark
                                  ? "text-slate-500"
                                  : "text-slate-400",
                            ].join(" ")}
                            aria-hidden="true"
                          >
                            {active ? sortIndicator(sortKey) : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}

                  {showLogAlways && (
                    <th
                      className={`${actionThClass} ${actionDividerThClass} sticky z-30 ${stickyHeadBg}`}
                      style={{
                        right: ACTION_COL_W * 3,
                        width: ACTION_COL_W,
                        minWidth: ACTION_COL_W,
                      }}
                    >
                      {t("actions.log")}
                    </th>
                  )}
                  {showViewAlways && (
                    <th
                      className={`${actionThClass} sticky z-30 ${stickyHeadBg}`}
                      style={{
                        right: ACTION_COL_W * 2,
                        width: ACTION_COL_W,
                        minWidth: ACTION_COL_W,
                      }}
                    >
                      {common("actions.view")}
                    </th>
                  )}
                  {showEditAlways && (
                    <th
                      className={`${actionThClass} sticky z-30 ${stickyHeadBg}`}
                      style={{
                        right: ACTION_COL_W * 1,
                        width: ACTION_COL_W,
                        minWidth: ACTION_COL_W,
                      }}
                    >
                      {common("actions.edit")}
                    </th>
                  )}
                  {showDeleteAlways && (
                    <th
                      className={`${actionThClass} sticky right-0 z-30 ${stickyHeadBg}`}
                      style={{ width: ACTION_COL_W, minWidth: ACTION_COL_W }}
                    >
                      {common("actions.delete")}
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {sortedLeads.map((lead) => {
                  const isAssignedToLead =
                    !!currentUserId &&
                    (lead.setter_id === currentUserId ||
                      lead.closer_id === currentUserId);

                  const canLogMessagesForLead =
                    isManagerOrAdmin || isAssignedToLead;
                  const canEditLeadForLead =
                    isManagerOrAdmin || isAssignedToLead;

                  const leadName = resolveLeadDisplayName(lead);

                  return (
                    <tr key={lead.id} className={rowHover}>
                      {columns.map((col) => {
                        const cellKey = `${col.kind}:${col.key}`;

                        if (col.kind === "score") {
                          const score = lead.score ?? null;
                          const classes = getScoreBadgeClasses(score);

                          return (
                            <td
                              key={cellKey}
                              className={`border-b px-5 py-2.5 align-top ${rowBorder}`}
                            >
                              {score != null ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}
                                >
                                  {score}
                                </span>
                              ) : (
                                <span className={`text-xs ${muted}`}>—</span>
                              )}
                            </td>
                          );
                        }

                        if (col.kind === "stage") {
                          return (
                            <td
                              key={cellKey}
                              className={`border-b px-5 py-2.5 align-top ${rowBorder}`}
                            >
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                  isDark
                                    ? "bg-indigo-500/15 text-indigo-200"
                                    : "bg-indigo-50 text-indigo-700"
                                }`}
                              >
                                {stageDisplayLabel(lead)}
                              </span>
                            </td>
                          );
                        }

                        if (col.kind === "core") {
                          if (col.key === "__lead_name") {
                            return (
                              <td
                                key={cellKey}
                                className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                              >
                                {displayValue(leadName)}
                              </td>
                            );
                          }

                          if (col.key === "primary_contact_value") {
                            const raw = String(
                              lead.primary_contact_value ?? "",
                            ).trim();
                            const href = raw
                              ? contactHref(
                                  lead.primary_contact_type ?? null,
                                  raw,
                                )
                              : null;

                            return (
                              <td
                                key={cellKey}
                                className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                              >
                                {href ? (
                                  <a
                                    href={href}
                                    target={
                                      href.startsWith("mailto:") ||
                                      href.startsWith("tel:")
                                        ? undefined
                                        : "_blank"
                                    }
                                    rel={
                                      href.startsWith("mailto:") ||
                                      href.startsWith("tel:")
                                        ? undefined
                                        : "noopener noreferrer"
                                    }
                                    className={`inline-flex max-w-[240px] items-center gap-1 truncate hover:underline ${
                                      isDark
                                        ? "text-indigo-300 hover:text-indigo-200"
                                        : "text-indigo-600 hover:text-indigo-700"
                                    }`}
                                  >
                                    <span className="truncate">{raw}</span>
                                  </a>
                                ) : (
                                  displayValue(raw || null)
                                )}
                              </td>
                            );
                          }

                          if (col.key === "gender") {
                            const show =
                              lead.lead_type === "individual"
                                ? lead.gender
                                : null;

                            return (
                              <td
                                key={cellKey}
                                className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                              >
                                {show ? (
                                  <GenderPill
                                    gender={show}
                                    label={genderLabel(show)}
                                  />
                                ) : (
                                  <span className={`text-xs ${muted}`}>—</span>
                                )}
                              </td>
                            );
                          }

                          const raw = (lead as any)[col.key];

                          if (CORE_PILL_KEYS.has(col.key)) {
                            const label =
                              col.key === "niche"
                                ? nicheDisplayLabel(lead)
                                : coreDisplayLabel(lead, col.key, raw);

                            return (
                              <td
                                key={cellKey}
                                className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                              >
                                {label === "—" ? (
                                  <span className={`text-xs ${muted}`}>—</span>
                                ) : (
                                  <GrayPill
                                    title={String(label)}
                                    isDark={isDark}
                                  >
                                    {label}
                                  </GrayPill>
                                )}
                              </td>
                            );
                          }

                          return (
                            <td
                              key={cellKey}
                              className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                            >
                              {coreDisplayLabel(lead, col.key, raw)}
                            </td>
                          );
                        }

                        const rawValue =
                          normalizedCustomValues[lead.id]?.[col.key];

                        if (col.kind === "custom" && col.type === "select") {
                          const label = customSelectDisplayLabel(
                            col.key,
                            rawValue,
                          );
                          return (
                            <td
                              key={cellKey}
                              className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                            >
                              {label === "—" ? (
                                <span className={`text-xs ${muted}`}>—</span>
                              ) : (
                                <GrayPill title={String(label)} isDark={isDark}>
                                  {String(label)}
                                </GrayPill>
                              )}
                            </td>
                          );
                        }

                        if (
                          col.kind === "custom" &&
                          col.type === "link" &&
                          typeof rawValue === "string" &&
                          rawValue.trim() !== ""
                        ) {
                          const rawLinkValue = rawValue.trim();
                          const href = /^https?:\/\//i.test(rawLinkValue)
                            ? rawLinkValue
                            : `https://${rawLinkValue}`;

                          return (
                            <td
                              key={cellKey}
                              className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                            >
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex max-w-[240px] items-center gap-1 truncate hover:underline ${
                                  isDark
                                    ? "text-indigo-300 hover:text-indigo-200"
                                    : "text-indigo-600 hover:text-indigo-700"
                                }`}
                              >
                                <span className="truncate">{rawLinkValue}</span>
                              </a>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={cellKey}
                            className={`border-b px-5 py-2.5 align-top ${rowBorder} ${cellText}`}
                          >
                            {rawValue !== null &&
                            rawValue !== undefined &&
                            String(rawValue).trim() !== ""
                              ? customDisplayLabel(
                                  lead.id,
                                  col.key,
                                  col.type,
                                  rawValue,
                                )
                              : "—"}
                          </td>
                        );
                      })}

                      {showLogAlways && (
                        <td
                          className={`${actionTdClass} ${actionDividerTdClass} sticky ${stickyCellBg}`}
                          style={{
                            right: ACTION_COL_W * 3,
                            width: ACTION_COL_W,
                            minWidth: ACTION_COL_W,
                          }}
                        >
                          {canLogMessagesForLead ? (
                            <Link
                              href={`/leads/${lead.id}/messages`}
                              className={`inline-flex p-1 transition-colors ${
                                isDark
                                  ? "!text-emerald-300 hover:!text-emerald-200"
                                  : "!text-emerald-600 hover:!text-emerald-700"
                              }`}
                              title={t("actions.logMessages")}
                            >
                              <PlusCircleIcon className="h-5 w-5" />
                            </Link>
                          ) : (
                            <span className={`text-xs ${mutedDash}`}>—</span>
                          )}
                        </td>
                      )}

                      {showViewAlways && (
                        <td
                          className={`${actionTdClass} sticky ${stickyCellBg}`}
                          style={{
                            right: ACTION_COL_W * 2,
                            width: ACTION_COL_W,
                            minWidth: ACTION_COL_W,
                          }}
                        >
                          <Link
                            href={`/leads/${lead.id}`}
                            className={`inline-flex p-1 transition-colors ${
                              isDark
                                ? "!text-slate-300 hover:!text-slate-100"
                                : "!text-slate-600 hover:!text-slate-900"
                            }`}
                            title={t("actions.viewDetails")}
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                        </td>
                      )}

                      {showEditAlways && (
                        <td
                          className={`${actionTdClass} sticky ${stickyCellBg}`}
                          style={{
                            right: ACTION_COL_W * 1,
                            width: ACTION_COL_W,
                            minWidth: ACTION_COL_W,
                          }}
                        >
                          {canEditLeadForLead ? (
                            <Link
                              href={`/leads/${lead.id}/edit`}
                              className={`inline-flex p-1 transition-colors ${
                                isDark
                                  ? "!text-indigo-300 hover:!text-indigo-200"
                                  : "!text-indigo-600 hover:!text-indigo-700"
                              }`}
                              title={t("actions.editLead")}
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </Link>
                          ) : (
                            <span className={`text-xs ${mutedDash}`}>—</span>
                          )}
                        </td>
                      )}

                      {showDeleteAlways && (
                        <td
                          className={`${actionTdClass} sticky right-0 ${stickyCellBg}`}
                          style={{
                            width: ACTION_COL_W,
                            minWidth: ACTION_COL_W,
                          }}
                        >
                          {canDeleteLeads ? (
                            <Link
                              href={`/leads/${lead.id}/delete`}
                              className={`inline-flex p-1 transition-colors ${
                                isDark
                                  ? "!text-rose-300 hover:!text-rose-200"
                                  : "!text-rose-500 hover:!text-rose-600"
                              }`}
                              title={t("actions.deleteLead")}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </Link>
                          ) : (
                            <span className={`text-xs ${mutedDash}`}>—</span>
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
