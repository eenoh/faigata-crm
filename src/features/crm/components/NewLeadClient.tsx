"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLeadFieldDefinitions } from "@/features/crm/data/leadFields";
import type {
  LeadFieldDefinition,
  LeadInputContactType as LeadContactType,
  LeadInputSourceCategory as LeadSourceCategory,
  LeadInputSourceName as LeadSourceName,
} from "@/features/crm/types/lead";
import {
  getPipelineStages,
  type PipelineStageDef,
} from "@/features/crm/data/pipelineStages";
import { getLeadFormNicheOptions } from "@/features/crm/data/niches";
import {
  resolveLeadNicheOption,
  type LeadNicheOption,
} from "@/features/crm/server/niches.shared";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAppLocale } from "@/context/LocaleContext";
import { cn } from "@/lib/utils/cn";
import { supabase } from "@/lib/supabaseClient";
import Papa from "papaparse";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  SYSTEM_CSV_COLUMNS,
  coercePrimaryContactType,
  getLeadFieldSelectOptions,
  getLeadFieldSelectValue,
  isReservedLeadCustomValueKey,
  normalizeBlankToNull,
  normalizeContactType,
  normalizeGender,
  normalizeLeadType,
  normalizeLeadCustomSelectValues,
  normalizeSourceCategory,
  normalizeSourceName,
  sourceNameFromContactType,
} from "@/features/crm/utils/lead";
import {
  getLeadContactTypeLabel,
  getLeadGenderLabel,
  getLeadSourceCategoryLabel,
  getLeadSourceNameLabel,
  getLeadTypeLabel,
} from "@/i18n/domain-values";

type CsvStatus = "idle" | "parsing" | "valid" | "invalid";

type TFn = (key: string, values?: Record<string, string | number>) => string;

/* -------------------- CSV parser -------------------- */

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });

  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0]?.message || "Failed to parse CSV.");
  }

  const data = Array.isArray(parsed.data) ? parsed.data : [];
  if (data.length === 0) {
    return { headers: [], rows: [] };
  }

  const [rawHeaders, ...rawRows] = data;
  const headers = (rawHeaders ?? []).map((h) => String(h ?? "").trim());
  const rows = rawRows
    .map((row) => headers.map((_, idx) => String(row?.[idx] ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));

  return { headers, rows };
}

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

function withAuthHeaders(
  accessToken?: string | null,
  headers?: HeadersInit,
): HeadersInit {
  return {
    ...headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function mapLeadApiError(raw: unknown, tNewLead: TFn, tEditLead: TFn) {
  const message = String(raw ?? "").trim();
  const lowered = message.toLowerCase();

  if (!message) return tEditLead("errors.generic");

  if (
    lowered.includes("missing_session") ||
    lowered.includes("missing_auth_token") ||
    lowered.includes("unauthorized") ||
    lowered.includes("jwt") ||
    lowered.includes("session expired")
  ) {
    return tNewLead("errors.sessionExpired");
  }

  if (lowered.includes("forbidden")) {
    return tEditLead("errors.forbidden");
  }

  if (
    lowered.includes("invalid or disabled niche") ||
    lowered.includes("invalid niche")
  ) {
    return tEditLead("errors.invalidNiche");
  }

  if (lowered.includes("missing primary_contact_type")) {
    return tEditLead("validation.primaryContactTypeRequired");
  }

  if (lowered.includes("stage")) {
    return tEditLead("errors.invalidStage");
  }

  return message;
}

/* -------------------- Lead payload helpers -------------------- */

type CanonicalLeadSystemFields = {
  lead_name: string | null;
  niche_id: string | null;
  lead_type: "" | "individual" | "business" | null;
  gender: "" | "male" | "female" | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  primary_contact_type: "" | LeadContactType | null;
  primary_contact_value: string | null;
  source_category: "" | LeadSourceCategory | null;
  source_name: "" | LeadSourceName | null;
};

function buildCanonicalSystemFields(
  systemFields: CanonicalLeadSystemFields,
): Record<string, unknown> {
  const inferredSourceName =
    systemFields.source_name ||
    sourceNameFromContactType(systemFields.primary_contact_type ?? "");

  return {
    lead_name: normalizeBlankToNull(systemFields.lead_name ?? ""),
    niche_id: normalizeBlankToNull(systemFields.niche_id ?? ""),
    lead_type: systemFields.lead_type || null,
    gender: systemFields.gender || null,
    city: normalizeBlankToNull(systemFields.city ?? ""),
    region: normalizeBlankToNull(systemFields.region ?? ""),
    country: normalizeBlankToNull(systemFields.country ?? ""),
    postal_code: normalizeBlankToNull(systemFields.postal_code ?? ""),
    primary_contact_type: coercePrimaryContactType(
      systemFields.primary_contact_type ?? "",
    ),
    primary_contact_value: normalizeBlankToNull(
      systemFields.primary_contact_value ?? "",
    ),
    source_category: systemFields.source_category || null,
    source_name: inferredSourceName || null,
  };
}

function buildCreateLeadRequestBody(args: {
  selectedStage: PipelineStageDef | null;
  systemFields: CanonicalLeadSystemFields;
  customValues: Record<string, unknown>;
  fields: LeadFieldDefinition[];
  currentUserId: string;
}) {
  const { selectedStage, systemFields, customValues, fields, currentUserId } =
    args;

  return {
    ...(selectedStage?.id
      ? { stageId: selectedStage.id }
      : selectedStage?.name
        ? { stage: selectedStage.name }
        : {}),
    systemFields: buildCanonicalSystemFields(systemFields),
    customValues: normalizeLeadCustomSelectValues(customValues, fields),
    prospectorId: currentUserId,
  };
}

/* -------------------- Loading state component -------------------- */

function PageLoadingState({ isDark }: { isDark: boolean }) {
  const skel = isDark ? "bg-slate-800/70" : "bg-slate-200/80";
  const skel2 = isDark ? "bg-slate-800/50" : "bg-slate-200/60";
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl">
        <div className="mb-4">
          <div className={cn("h-7 w-40 animate-pulse rounded", skel)} />
          <div className={cn("mt-2 h-4 w-96 animate-pulse rounded", skel2)} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div
            className={cn("space-y-4 rounded-2xl border p-6 shadow-sm", card)}
          >
            <div className={cn("h-4 w-44 animate-pulse rounded", skel2)} />
            <div className={cn("h-10 w-full animate-pulse rounded", skel2)} />
            <div className={cn("h-4 w-36 animate-pulse rounded", skel2)} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={cn("h-10 w-full animate-pulse rounded", skel2)}
                />
              ))}
            </div>
            <div className={cn("h-10 w-32 animate-pulse rounded", skel2)} />
          </div>

          <div
            className={cn("space-y-3 rounded-2xl border p-6 shadow-sm", card)}
          >
            <div className={cn("h-4 w-40 animate-pulse rounded", skel2)} />
            <div className={cn("h-3 w-72 animate-pulse rounded", skel2)} />
            <div className={cn("h-40 w-full animate-pulse rounded", skel2)} />
            <div className={cn("h-3 w-full animate-pulse rounded", skel)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineError({
  message,
  title,
  closeLabel,
  dismissAriaLabel,
  isDark,
  onClose,
}: {
  message: string;
  title: string;
  closeLabel: string;
  dismissAriaLabel: string;
  isDark: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        isDark
          ? "border-rose-900/50 bg-rose-500/10 text-rose-200"
          : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-relaxed">{message}</p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-xs font-semibold",
              isDark
                ? "text-rose-200 hover:bg-rose-500/10"
                : "text-rose-700 hover:bg-rose-100",
            )}
            aria-label={dismissAriaLabel}
          >
            {closeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getStageOptionValue(
  stage: Pick<PipelineStageDef, "id" | "name"> | null | undefined,
) {
  const id = typeof stage?.id === "string" ? stage.id.trim() : "";
  if (id) return id;
  return String(stage?.name ?? "").trim();
}

export function NewLeadClient() {
  const router = useRouter();
  const tNewLead = useTranslations("NewLeadPage");
  const tEditLead = useTranslations("EditLeadPage");
  const tLeads = useTranslations("LeadsPage");
  const tDomain = useTranslations("DomainValues");
  const { locale } = useAppLocale();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const {
    teamId,
    userId: currentUserId,
    loading: workspaceLoading,
  } = useWorkspace();
  const workspaceLoaded = !workspaceLoading;

  const [metaLoaded, setMetaLoaded] = useState(false);
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [stageId, setStageId] = useState("");

  const [systemFields, setSystemFields] = useState({
    lead_name: "",

    niche_id: "",
    lead_type: "" as "" | "individual" | "business",
    gender: "" as "" | "male" | "female",

    city: "",
    region: "",
    country: "",
    postal_code: "",

    primary_contact_type: "" as "" | LeadContactType,
    primary_contact_value: "",

    source_category: "" as "" | LeadSourceCategory,
    source_name: "" as "" | LeadSourceName,
  });

  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  const [csvStatus, setCsvStatus] = useState<CsvStatus>("idle");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRowCount, setCsvRowCount] = useState<number | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [nicheOptions, setNicheOptions] = useState<LeadNicheOption[]>([]);
  const [nicheError, setNicheError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLoadingMeta = useMemo(() => {
    if (!workspaceLoaded) return true;
    if (!teamId) return false;
    return (
      !metaLoaded &&
      stages.length === 0 &&
      fields.length === 0 &&
      nicheOptions.length === 0
    );
  }, [
    workspaceLoaded,
    teamId,
    metaLoaded,
    stages.length,
    fields.length,
    nicheOptions.length,
  ]);

  const fieldDefinitionByKey = useMemo(() => {
    const map = new Map<string, LeadFieldDefinition>();
    for (const field of fields) {
      map.set(field.key, field);
    }
    return map;
  }, [fields]);

  const selectedStage = useMemo(
    () =>
      stages.find((stage) => getStageOptionValue(stage) === stageId) ?? null,
    [stageId, stages],
  );

  /* -------------------- Theme classes -------------------- */

  const pageTitle = isDark ? "text-slate-100" : "text-slate-900";
  const pageSub = isDark ? "text-slate-400" : "text-slate-500";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const softBorder = isDark ? "border-slate-800" : "border-slate-100";
  const fieldLabel = isDark ? "text-slate-400" : "text-slate-600";
  const sectionTitle = isDark ? "text-slate-200" : "text-slate-800";

  const inputBase = cn(
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  const selectBase = cn(
    inputBase,
    "cursor-pointer",
    isDark ? "focus:ring-indigo-400" : "focus:ring-indigo-500",
  );

  /* -------------------- 1) Load custom fields + stages + team niches -------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded || !teamId) return;

      try {
        if (!cancelled) {
          setMetaLoaded(false);
          setFields([]);
          setStages([]);
          setNicheOptions([]);
          setNicheError(null);
        }

        const [defs, stageDefs, nicheData] = await Promise.all([
          getLeadFieldDefinitions(teamId, locale),
          getPipelineStages(teamId, locale),
          getLeadFormNicheOptions(undefined, locale),
        ]);

        if (cancelled) return;

        setFields(defs);
        setStages(stageDefs);
        setNicheOptions(nicheData.options ?? []);
        setNicheError(null);

        setStageId((prev) => {
          if (prev) {
            const stillExists = stageDefs.some(
              (stage) => getStageOptionValue(stage) === prev,
            );
            if (stillExists) return prev;
          }
          return stageDefs.length > 0 ? getStageOptionValue(stageDefs[0]) : "";
        });
      } catch (err) {
        console.error("[NewLead] Failed to load new-lead metadata", err);
        if (!cancelled) {
          setNicheError(
            err instanceof Error
              ? err.message
              : tEditLead("errors.invalidNiche"),
          );
          setFields([]);
          setStages([]);
          setNicheOptions([]);
        }
      } finally {
        if (!cancelled) setMetaLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoaded, tEditLead, locale]);

  /* -------------------- 2.5) Auto-suggest source_name from contact_type -------------------- */

  useEffect(() => {
    const suggestion = sourceNameFromContactType(
      systemFields.primary_contact_type,
    );
    if (!suggestion) return;

    if (systemFields.source_name === "") {
      setSystemFields((p) => ({ ...p, source_name: suggestion }));
    }
  }, [systemFields.primary_contact_type, systemFields.source_name]);

  /* -------------------- 3) Single lead submit -------------------- */

  function handleCustomChange(key: string, value: any) {
    if (isReservedLeadCustomValueKey(key)) return;

    const field = fieldDefinitionByKey.get(key);
    const nextValue =
      field?.type === "select" ? getLeadFieldSelectValue(field, value) : value;

    setCustomValues((prev) => ({ ...prev, [key]: nextValue }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!teamId) {
      setError(tNewLead("errors.missingTeam"));
      return;
    }

    if (!currentUserId) {
      setError(tNewLead("errors.missingUser"));
      return;
    }

    if (!stageId) {
      setError(tNewLead("errors.missingStage"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError(tNewLead("errors.sessionExpired"));
        return;
      }

      const body = buildCreateLeadRequestBody({
        selectedStage,
        systemFields,
        customValues,
        fields,
        currentUserId,
      });

      const res = await fetch(
        `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`,
        {
          method: "POST",
          headers: withAuthHeaders(accessToken, {
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(body),
        },
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("[NewLead] Failed to create lead", res.status, payload);
        setError(
          mapLeadApiError(
            payload?.error ||
              payload?.message ||
              tNewLead("errors.createFailed"),
            tNewLead,
            tEditLead,
          ),
        );
        return;
      }

      router.push("/leads");
    } catch (err) {
      console.error("[NewLead] unexpected create error", err);
      setError(tNewLead("errors.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------- 4) CSV handling & validation -------------------- */

  function validateCsv(headers: string[], rowCount: number): boolean {
    const customLabels = fields.map((f) => f.label.trim().toLowerCase());
    const systemLabels = Object.keys(SYSTEM_CSV_COLUMNS);

    const allowed = new Set([...customLabels, ...systemLabels]);
    const normalized = headers.map((h) => h.trim().toLowerCase());

    const unknown = normalized.filter((h) => !allowed.has(h));
    if (unknown.length) {
      setCsvStatus("invalid");
      setCsvError(
        tNewLead("csv.unknownColumns", { columns: unknown.join(", ") }),
      );
      setCsvRowCount(null);
      setCsvHeaders(null);
      setCsvRows([]);
      return false;
    }

    setCsvStatus("valid");
    setCsvError(null);
    setCsvRowCount(rowCount);
    return true;
  }

  function handleCsvFile(file: File) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvStatus("invalid");
      setCsvError(tNewLead("csv.fileType"));
      setCsvFileName(file.name);
      setCsvRowCount(null);
      setCsvHeaders(null);
      setCsvRows([]);
      return;
    }

    setCsvStatus("parsing");
    setCsvError(null);
    setCsvFileName(file.name);
    setCsvRowCount(null);
    setCsvHeaders(null);
    setCsvRows([]);
    setImportMessage(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const { headers, rows } = parseCsv(text);

        if (rows.length === 0) {
          setCsvStatus("invalid");
          setCsvError(tNewLead("csv.emptyRows"));
          setCsvRowCount(null);
          return;
        }

        const ok = validateCsv(headers, rows.length);
        if (ok) {
          setCsvHeaders(headers);
          setCsvRows(rows);
        }
      } catch (err: any) {
        console.error("[NewLead] Failed to parse CSV", err);
        setCsvStatus("invalid");
        setCsvError(err?.message || tNewLead("csv.parseFailed"));
        setCsvRowCount(null);
      }
    };
    reader.onerror = () => {
      setCsvStatus("invalid");
      setCsvError(tNewLead("csv.readFailed"));
      setCsvRowCount(null);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) handleCsvFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleCsvFile(file);
  }

  /* -------------------- 5) CSV -> DB import -------------------- */

  async function handleImportCsv() {
    if (!teamId) {
      setError(tNewLead("errors.missingTeam"));
      return;
    }
    if (!currentUserId) {
      setError(tNewLead("errors.missingUser"));
      return;
    }
    if (!stageId) {
      setError(tNewLead("errors.missingStageForImport"));
      return;
    }
    if (
      csvStatus !== "valid" ||
      !csvHeaders ||
      !csvRows ||
      csvRows.length === 0
    ) {
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError(tNewLead("errors.sessionExpired"));
      return;
    }

    setImporting(true);
    setImportMessage(null);
    setError(null);

    const headerToField: Record<string, LeadFieldDefinition> = {};
    for (const f of fields) {
      headerToField[f.label.trim().toLowerCase()] = f;
    }

    let success = 0;
    let failed = 0;
    let firstFailureMessage: string | null = null;

    for (const row of csvRows) {
      const rowCustom: Record<string, any> = {};
      let rowValidationError: string | null = null;

      const rowSystem: CanonicalLeadSystemFields = {
        lead_name: null,

        niche_id: null,
        lead_type: null,
        gender: null,
        city: null,
        region: null,
        country: null,
        postal_code: null,
        primary_contact_type: null,
        primary_contact_value: null,
        source_category: null,
        source_name: null,
      };

      csvHeaders.forEach((header, idx) => {
        const h = header.trim().toLowerCase();
        const raw = (row[idx] ?? "").trim();

        const sysKey = SYSTEM_CSV_COLUMNS[h];
        if (sysKey) {
          if (raw === "") {
            (rowSystem as Record<string, unknown>)[sysKey] = null;
            return;
          }

          if (sysKey === "niche") {
            const matchedNiche = resolveLeadNicheOption(nicheOptions, raw);
            if (!matchedNiche) {
              rowValidationError = tEditLead("errors.invalidNiche");
              return;
            }

            rowSystem.niche_id = matchedNiche.id;
          } else if (sysKey === "lead_type") {
            rowSystem.lead_type = normalizeLeadType(raw) || null;
          } else if (sysKey === "gender") {
            rowSystem.gender = normalizeGender(raw) || null;
          } else if (sysKey === "primary_contact_type") {
            rowSystem.primary_contact_type = normalizeContactType(raw) || null;
          } else if (sysKey === "source_category") {
            rowSystem.source_category = normalizeSourceCategory(raw) || null;
          } else if (sysKey === "source_name") {
            rowSystem.source_name = normalizeSourceName(raw) || null;
          } else {
            (rowSystem as Record<string, unknown>)[sysKey] =
              normalizeBlankToNull(raw);
          }

          return;
        }

        const field = headerToField[h];
        if (!field) return;

        if (raw === "") {
          rowCustom[field.key] = null;
          return;
        }

        if (field.type === "number") {
          const num = Number(raw.replace(",", "."));
          rowCustom[field.key] = Number.isNaN(num) ? null : num;
        } else if (field.type === "boolean") {
          const v = raw.toLowerCase();
          rowCustom[field.key] = ["true", "yes", "y", "1"].includes(v);
        } else if (field.type === "select") {
          if (!isReservedLeadCustomValueKey(field.key)) {
            rowCustom[field.key] = getLeadFieldSelectValue(field, raw);
          }
        } else {
          if (!isReservedLeadCustomValueKey(field.key)) {
            rowCustom[field.key] = raw;
          }
        }
      });

      if (rowValidationError) {
        failed += 1;
        if (!firstFailureMessage) {
          firstFailureMessage = rowValidationError;
        }
        continue;
      }

      const body = buildCreateLeadRequestBody({
        selectedStage,
        systemFields: rowSystem,
        customValues: rowCustom,
        fields,
        currentUserId,
      });

      try {
        const res = await fetch(
          `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`,
          {
            method: "POST",
            headers: withAuthHeaders(accessToken, {
              "Content-Type": "application/json",
            }),
            body: JSON.stringify(body),
          },
        );

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          failed += 1;
          if (!firstFailureMessage) {
            firstFailureMessage = mapLeadApiError(
              payload?.error ||
                payload?.message ||
                tNewLead("csv.importRowFailed"),
              tNewLead,
              tEditLead,
            );
          }
        } else {
          success += 1;
        }
      } catch {
        failed += 1;
        if (!firstFailureMessage) {
          firstFailureMessage = tNewLead("csv.importRowFailed");
        }
      }
    }

    setImporting(false);
    setImportMessage(
      tNewLead("csv.importResult", {
        success,
        failed,
      }),
    );

    if (failed && firstFailureMessage) {
      setError(firstFailureMessage);
    }
  }

  /* -------------------- Render guards -------------------- */

  if (!workspaceLoaded) {
    return <PageLoadingState isDark={isDark} />;
  }

  if (workspaceLoaded && !teamId) {
    return (
      <div
        className={cn(
          "rounded-xl border p-6 text-sm shadow-sm",
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-300"
            : "border-slate-200 bg-white text-slate-600",
        )}
      >
        {tLeads("empty.noWorkspace")}
      </div>
    );
  }

  if (isLoadingMeta) {
    return <PageLoadingState isDark={isDark} />;
  }

  const canSubmit = !submitting && !importing;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl">
        <div className="mb-4">
          <h1 className={cn("text-2xl font-semibold", pageTitle)}>
            {tNewLead("page.title")}
          </h1>
          <p className={cn("text-sm", pageSub)}>
            {tNewLead("page.description")}
          </p>
        </div>

        {error ? (
          <div className="mb-4">
            <InlineError
              message={error}
              title={tNewLead("errors.title")}
              closeLabel={tNewLead("errors.dismiss")}
              dismissAriaLabel={tNewLead("errors.dismiss")}
              isDark={isDark}
              onClose={() => setError(null)}
            />
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <form
            onSubmit={handleSubmit}
            className={cn("space-y-6 rounded-2xl border p-6 shadow-sm", card)}
          >
            <div>
              <label
                className={cn("mb-1 block text-sm font-medium", sectionTitle)}
              >
                {tNewLead("sections.pipeline")}
              </label>
              <select
                className={selectBase}
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                required
                disabled={!canSubmit}
              >
                {stages.length === 0 && (
                  <option value="">{tNewLead("states.noStages")}</option>
                )}
                {stages.map((s) => (
                  <option
                    key={getStageOptionValue(s)}
                    value={getStageOptionValue(s)}
                  >
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={cn("border-t pt-4", softBorder)}>
              <h2 className={cn("mb-3 text-sm font-semibold", sectionTitle)}>
                {tNewLead("sections.coreDetails")}
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.leadName")}
                  </label>
                  <input
                    className={inputBase}
                    value={systemFields.lead_name}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        lead_name: e.target.value,
                      }))
                    }
                    disabled={!canSubmit}
                    placeholder={tNewLead("placeholders.leadName")}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.nicheIndustry")}
                  </label>
                  <select
                    className={selectBase}
                    value={systemFields.niche_id}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setSystemFields((p) => ({
                        ...p,
                        niche_id: selectedId,
                      }));
                    }}
                    disabled={!canSubmit || nicheOptions.length === 0}
                  >
                    <option value="">
                      {nicheOptions.length === 0
                        ? tNewLead("states.noNiches")
                        : tEditLead("fields.selectNiche")}
                    </option>
                    {nicheOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.archived
                          ? ` ${tEditLead("niche.archivedSuffix")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {nicheError ? (
                    <p
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-rose-300" : "text-rose-600",
                      )}
                    >
                      {nicheError}
                    </p>
                  ) : nicheOptions.length === 0 ? (
                    <p className={cn("text-[11px]", pageSub)}>
                      {tNewLead("states.enableNiches")}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.leadType")}
                  </label>
                  <select
                    className={selectBase}
                    value={systemFields.lead_type}
                    onChange={(e) => {
                      const next = e.target.value as
                        | ""
                        | "individual"
                        | "business";
                      setSystemFields((p) => ({
                        ...p,
                        lead_type: next,
                        gender: next === "individual" ? p.gender : "",
                      }));
                    }}
                    disabled={!canSubmit}
                  >
                    <option value="">{tNewLead("common.select")}</option>
                    <option value="individual">
                      {getLeadTypeLabel(tDomain, "individual")}
                    </option>
                    <option value="business">
                      {getLeadTypeLabel(tDomain, "business")}
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.gender")}
                  </label>
                  <select
                    className={cn(
                      selectBase,
                      !canSubmit || systemFields.lead_type !== "individual"
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer",
                    )}
                    value={systemFields.gender}
                    disabled={
                      !canSubmit || systemFields.lead_type !== "individual"
                    }
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        gender: e.target.value as any,
                      }))
                    }
                  >
                    <option value="">{tDomain("fallbacks.empty")}</option>
                    <option value="male">
                      {getLeadGenderLabel(tDomain, "male")}
                    </option>
                    <option value="female">
                      {getLeadGenderLabel(tDomain, "female")}
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tNewLead("fields.city")}
                  </label>
                  <input
                    className={inputBase}
                    value={systemFields.city}
                    onChange={(e) =>
                      setSystemFields((p) => ({ ...p, city: e.target.value }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tNewLead("fields.region")}
                  </label>
                  <input
                    className={inputBase}
                    value={systemFields.region}
                    onChange={(e) =>
                      setSystemFields((p) => ({ ...p, region: e.target.value }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tNewLead("fields.country")}
                  </label>
                  <input
                    className={inputBase}
                    value={systemFields.country}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        country: e.target.value,
                      }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tNewLead("fields.postalCode")}
                  </label>
                  <input
                    className={inputBase}
                    value={systemFields.postal_code}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        postal_code: e.target.value,
                      }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.primaryContactType")}
                  </label>
                  <select
                    className={selectBase}
                    value={systemFields.primary_contact_type}
                    onChange={(e) => {
                      const ct = e.target.value as "" | LeadContactType;
                      setSystemFields((p) => ({
                        ...p,
                        primary_contact_type: ct,
                        source_name:
                          p.source_name === ""
                            ? sourceNameFromContactType(ct) || ""
                            : p.source_name,
                      }));
                    }}
                    disabled={!canSubmit}
                  >
                    <option value="">{tNewLead("common.select")}</option>
                    <option value="email">
                      {getLeadContactTypeLabel(tDomain, "email")}
                    </option>
                    <option value="phone">
                      {getLeadContactTypeLabel(tDomain, "phone")}
                    </option>
                    <option value="instagram">
                      {getLeadContactTypeLabel(tDomain, "instagram")}
                    </option>
                    <option value="facebook">
                      {getLeadContactTypeLabel(tDomain, "facebook")}
                    </option>
                    <option value="reddit">
                      {getLeadContactTypeLabel(tDomain, "reddit")}
                    </option>
                    <option value="twitter_x">
                      {getLeadContactTypeLabel(tDomain, "twitter_x")}
                    </option>
                    <option value="linkedin">
                      {getLeadContactTypeLabel(tDomain, "linkedin")}
                    </option>
                    <option value="tiktok">
                      {getLeadContactTypeLabel(tDomain, "tiktok")}
                    </option>
                    <option value="youtube">
                      {getLeadContactTypeLabel(tDomain, "youtube")}
                    </option>
                    <option value="whatsapp">
                      {getLeadContactTypeLabel(tDomain, "whatsapp")}
                    </option>
                    <option value="telegram">
                      {getLeadContactTypeLabel(tDomain, "telegram")}
                    </option>
                    <option value="discord">
                      {getLeadContactTypeLabel(tDomain, "discord")}
                    </option>
                    <option value="other">
                      {getLeadContactTypeLabel(tDomain, "other")}
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tNewLead("fields.primaryContact")}
                  </label>
                  <input
                    className={inputBase}
                    value={systemFields.primary_contact_value}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        primary_contact_value: e.target.value,
                      }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.sourceCategory")}
                  </label>
                  <select
                    className={selectBase}
                    value={systemFields.source_category}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        source_category: e.target.value as any,
                      }))
                    }
                    disabled={!canSubmit}
                  >
                    <option value="">{tNewLead("common.select")}</option>
                    <option value="inbound">
                      {getLeadSourceCategoryLabel(tDomain, "inbound")}
                    </option>
                    <option value="outbound">
                      {getLeadSourceCategoryLabel(tDomain, "outbound")}
                    </option>
                    <option value="referral">
                      {getLeadSourceCategoryLabel(tDomain, "referral")}
                    </option>
                    <option value="partner">
                      {getLeadSourceCategoryLabel(tDomain, "partner")}
                    </option>
                    <option value="purchased">
                      {getLeadSourceCategoryLabel(tDomain, "purchased")}
                    </option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    className={cn(
                      "block text-xs font-medium uppercase tracking-wide",
                      fieldLabel,
                    )}
                  >
                    {tLeads("columns.sourceName")}
                  </label>
                  <select
                    className={selectBase}
                    value={systemFields.source_name}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        source_name: e.target.value as any,
                      }))
                    }
                    disabled={!canSubmit}
                  >
                    <option value="">{tNewLead("common.select")}</option>
                    <option value="instagram">
                      {getLeadSourceNameLabel(tDomain, "instagram")}
                    </option>
                    <option value="facebook">
                      {getLeadSourceNameLabel(tDomain, "facebook")}
                    </option>
                    <option value="reddit">
                      {getLeadSourceNameLabel(tDomain, "reddit")}
                    </option>
                    <option value="twitter_x">
                      {getLeadSourceNameLabel(tDomain, "twitter_x")}
                    </option>
                    <option value="other">
                      {getLeadSourceNameLabel(tDomain, "other")}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {fields.length > 0 && (
              <div className={cn("border-t pt-4", softBorder)}>
                <h2 className={cn("mb-3 text-sm font-semibold", sectionTitle)}>
                  {tNewLead("sections.additionalDetails")}
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {fields
                    .filter((f) => !isReservedLeadCustomValueKey(f.key))
                    .map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label
                          className={cn(
                            "block text-xs font-medium uppercase tracking-wide",
                            fieldLabel,
                          )}
                        >
                          {field.label}
                        </label>

                        {field.type === "text" && (
                          <input
                            className={inputBase}
                            onChange={(e) =>
                              handleCustomChange(field.key, e.target.value)
                            }
                            disabled={!canSubmit}
                          />
                        )}

                        {field.type === "number" && (
                          <input
                            type="number"
                            className={inputBase}
                            onChange={(e) =>
                              handleCustomChange(
                                field.key,
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                            disabled={!canSubmit}
                          />
                        )}

                        {field.type === "boolean" && (
                          <label
                            className={cn(
                              "inline-flex items-center gap-2 text-sm",
                              isDark ? "text-slate-200" : "text-slate-700",
                            )}
                          >
                            <input
                              type="checkbox"
                              className={cn(
                                "rounded border text-indigo-600 focus:ring-indigo-500",
                                isDark
                                  ? "border-slate-700 bg-slate-900"
                                  : "border-slate-300",
                              )}
                              onChange={(e) =>
                                handleCustomChange(field.key, e.target.checked)
                              }
                              disabled={!canSubmit}
                            />
                            <span>{tNewLead("common.yes")}</span>
                          </label>
                        )}

                        {field.type === "select" && (
                          <select
                            className={cn(
                              inputBase,
                              canSubmit
                                ? "cursor-pointer"
                                : "cursor-not-allowed",
                            )}
                            value={String(customValues[field.key] ?? "")}
                            onChange={(e) =>
                              handleCustomChange(
                                field.key,
                                e.target.value || null,
                              )
                            }
                            disabled={!canSubmit}
                          >
                            <option value="">
                              {tNewLead("common.select")}
                            </option>
                            {getLeadFieldSelectOptions(field).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}

                        {field.type === "link" && (
                          <input
                            type="url"
                            className={inputBase}
                            placeholder={tNewLead("placeholders.link")}
                            onChange={(e) =>
                              handleCustomChange(field.key, e.target.value)
                            }
                            disabled={!canSubmit}
                          />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={!canSubmit || !stageId}
                className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting
                  ? tNewLead("actions.creating")
                  : tNewLead("actions.createLead")}
              </button>
            </div>
          </form>

          <div
            className={cn("space-y-3 rounded-2xl border p-6 shadow-sm", card)}
          >
            <div className="mb-1">
              <h2 className={cn("text-sm font-semibold", pageTitle)}>
                {tNewLead("sections.csvImport")}
              </h2>
              <p className={cn("text-xs", pageSub)}>
                {tNewLead("page.description")}
              </p>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
                isDragging
                  ? isDark
                    ? "border-indigo-500/60 bg-indigo-950/30"
                    : "border-indigo-400 bg-indigo-50/70"
                  : isDark
                    ? "border-slate-700 bg-slate-900/40"
                    : "border-slate-300 bg-slate-50",
              )}
            >
              <p
                className={cn(
                  "text-sm font-medium",
                  isDark ? "text-slate-200" : "text-slate-700",
                )}
              >
                {tNewLead("csv.dropTitle")}
              </p>
              <p className={cn("mt-1 text-xs", pageSub)}>
                {tNewLead("csv.dropSubtitle")}
              </p>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInputChange}
                className={cn(
                  "mt-4 text-xs",
                  importing
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer",
                  isDark ? "text-slate-200" : "text-slate-700",
                )}
                disabled={importing}
              />

              {csvFileName && (
                <p className={cn("mt-3 text-xs", pageSub)}>
                  {tNewLead("csv.selectedFile", { name: csvFileName })}
                </p>
              )}
            </div>

            <div className="mt-2 space-y-2 text-xs">
              {csvStatus === "parsing" && (
                <p className={pageSub}>{tNewLead("csv.checking")}</p>
              )}

              {csvStatus === "valid" && csvRowCount !== null && (
                <div className="space-y-2">
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      isDark
                        ? "border-emerald-900/40 bg-emerald-950/30 text-emerald-200"
                        : "border-emerald-100 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    <p className="font-medium">
                      {tNewLead("csv.valid", { count: csvRowCount })}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-[11px]",
                        isDark ? "text-emerald-200/80" : "text-emerald-700/80",
                      )}
                    >
                      {tNewLead("csv.validHelp")}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportCsv}
                    disabled={importing || !stageId}
                    className="inline-flex cursor-pointer items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {importing
                      ? tNewLead("actions.importing")
                      : tNewLead("actions.importRows", { count: csvRowCount })}
                  </button>

                  {importMessage && (
                    <p className={cn("text-[11px]", pageSub)}>
                      {importMessage}
                    </p>
                  )}
                </div>
              )}

              {csvStatus === "invalid" && csvError && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    isDark
                      ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
                      : "border-rose-100 bg-rose-50 text-rose-700",
                  )}
                >
                  <p className="font-medium">{tNewLead("csv.invalidTitle")}</p>
                  <p className="mt-1 text-[11px]">{csvError}</p>
                </div>
              )}

              {csvStatus === "idle" && (
                <p
                  className={cn(
                    "text-[11px]",
                    isDark ? "text-slate-500" : "text-slate-400",
                  )}
                >
                  {tNewLead("csv.idlePrefix")}{" "}
                  {fields.length > 0
                    ? fields.map((f) => f.label).join(", ")
                    : tDomain("fallbacks.empty")}
                  <br />
                  {tNewLead("csv.idleCore")}
                </p>
              )}
            </div>
          </div>
        </div>

        <span className="hidden">{String(metaLoaded)}</span>
      </div>
    </div>
  );
}
