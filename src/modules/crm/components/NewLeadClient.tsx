// src/app/leads/new/NewLeadClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import {
  getPipelineStages,
  type PipelineStageDef,
} from "@/modules/crm/data/pipelineStages";
import { supabase } from "@/lib/supabaseClient";
import Papa from "papaparse";

type CsvStatus = "idle" | "parsing" | "valid" | "invalid";

/**
 * IMPORTANT:
 * For <select value=...> in React/TS, the value must be string | number | string[] | undefined.
 * So in this file we DO NOT include `null` in UI state unions.
 * We use "" as "unset", and convert to null in the API payload.
 */
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
  | "other";

type LeadSourceCategory =
  | "inbound"
  | "outbound"
  | "referral"
  | "partner"
  | "purchased";

type LeadSourceName =
  | "instagram"
  | "facebook"
  | "reddit"
  | "twitter_x"
  | "other";

/** Prevent writing system keys into custom_values */
const RESERVED_SYSTEM_KEYS = new Set([
  "lead_name",

  "niche",
  "lead_type",
  "gender",
  "country",
  "region",
  "city",
  "postal_code",
  "primary_contact_type",
  "primary_contact_value",
  "source_category",
  "source_name",
]);

/**
 * CSV header → systemFields key mapping
 * (Headers are matched case-insensitively.)
 */
const SYSTEM_CSV_COLUMNS: Record<string, string> = {
  "lead name": "lead_name",
  lead_name: "lead_name",
  name: "lead_name",

  "niche / industry": "niche",
  niche: "niche",
  industry: "niche",

  "lead type": "lead_type",
  lead_type: "lead_type",

  gender: "gender",

  city: "city",
  region: "region",
  country: "country",
  "postal code": "postal_code",
  postal_code: "postal_code",
  zip: "postal_code",
  zip_code: "postal_code",

  "primary contact type": "primary_contact_type",
  primary_contact_type: "primary_contact_type",
  contact_type: "primary_contact_type",

  "primary contact": "primary_contact_value",
  primary_contact_value: "primary_contact_value",
  contact: "primary_contact_value",

  "source category": "source_category",
  source_category: "source_category",

  "source name": "source_name",
  source_name: "source_name",
};

function parseCsv(text: string) {
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: true,
  });

  if (result.errors?.length) {
    throw new Error(result.errors[0].message || "Invalid CSV.");
  }

  const data = result.data as unknown as string[][];
  if (!data.length) throw new Error("CSV file is empty.");

  const headers = (data[0] ?? [])
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);
  const rows = data.slice(1).map((r) => r.map((c) => String(c ?? "")));

  return { headers, rows };
}

function normalizeBlankToNull(v: string) {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

/**
 * DB enforces NOT NULL on leads.primary_contact_type.
 * Keep UI flexible, but always send a safe string when missing.
 */
function coercePrimaryContactType(ct: "" | LeadContactType): LeadContactType {
  return (ct && ct.trim() ? ct : "other") as LeadContactType;
}

function normalizeLeadType(raw: string): "" | "individual" | "business" {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  if (v === "individual" || v === "person") return "individual";
  if (v === "business" || v === "company") return "business";
  return "";
}

function normalizeGender(raw: string): "" | "male" | "female" {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return "";
}

function normalizeContactType(raw: string): "" | LeadContactType {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  const map: Record<string, LeadContactType> = {
    email: "email",
    e_mail: "email",

    phone: "phone",
    mobile: "phone",
    tel: "phone",

    instagram: "instagram",
    ig: "instagram",

    facebook: "facebook",
    fb: "facebook",

    reddit: "reddit",

    twitter: "twitter_x",
    "twitter/x": "twitter_x",
    twitter_x: "twitter_x",
    x: "twitter_x",

    linkedin: "linkedin",
    li: "linkedin",

    tiktok: "tiktok",
    youtube: "youtube",

    whatsapp: "whatsapp",
    wa: "whatsapp",

    telegram: "telegram",
    tg: "telegram",

    discord: "discord",
  };

  return map[v] ?? "other";
}

function normalizeSourceCategory(raw: string): "" | LeadSourceCategory {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  const map: Record<string, LeadSourceCategory> = {
    inbound: "inbound",
    outbound: "outbound",
    referral: "referral",
    partner: "partner",
    purchased: "purchased",
    paid: "purchased",
  };
  return map[v] ?? "";
}

function normalizeSourceName(raw: string): "" | LeadSourceName {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  const map: Record<string, LeadSourceName> = {
    instagram: "instagram",
    ig: "instagram",
    facebook: "facebook",
    fb: "facebook",
    reddit: "reddit",
    twitter: "twitter_x",
    "twitter/x": "twitter_x",
    x: "twitter_x",
    twitter_x: "twitter_x",
    other: "other",
  };
  return map[v] ?? "";
}

/**
 * If contact type is one of the known source_name enum options, suggest that source_name.
 * For all other contact types, keep source_name as-is.
 */
function sourceNameFromContactType(
  ct: "" | LeadContactType,
): "" | LeadSourceName {
  if (ct === "instagram") return "instagram";
  if (ct === "facebook") return "facebook";
  if (ct === "reddit") return "reddit";
  if (ct === "twitter_x") return "twitter_x";
  return "";
}

/* -------------------- Loading state component -------------------- */

function PageLoadingState() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl">
        <div className="mb-4">
          <div className="h-7 w-40 rounded bg-slate-200/80 animate-pulse" />
          <div className="mt-2 h-4 w-96 rounded bg-slate-200/60 animate-pulse" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-44 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-10 w-full rounded bg-slate-200/60 animate-pulse" />
            <div className="h-4 w-36 rounded bg-slate-200/70 animate-pulse" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-full rounded bg-slate-200/60 animate-pulse"
                />
              ))}
            </div>
            <div className="h-10 w-32 rounded bg-slate-200/70 animate-pulse" />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-40 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-3 w-72 rounded bg-slate-200/60 animate-pulse" />
            <div className="h-40 w-full rounded bg-slate-200/60 animate-pulse" />
            <div className="h-3 w-full rounded bg-slate-200/50 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function NewLeadClient() {
  // workspace / team
  const [teamId, setTeamId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  // metadata
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [stage, setStage] = useState("");

  // system/core fields (all string-safe for <select value>)
  const [systemFields, setSystemFields] = useState({
    lead_name: "",

    niche: "",
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

  // custom fields
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  // CSV UI state
  const [csvStatus, setCsvStatus] = useState<CsvStatus>("idle");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRowCount, setCsvRowCount] = useState<number | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // parsed CSV
  const [csvHeaders, setCsvHeaders] = useState<string[] | null>(null);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // page-level busy state
  const [submitting, setSubmitting] = useState(false);

  const isLoadingMeta = useMemo(() => {
    if (!workspaceLoaded) return true;
    if (!teamId) return false;
    return stages.length === 0 && fields.length === 0;
  }, [workspaceLoaded, teamId, stages.length, fields.length]);

  /* -------------------- 1) Load team + current user from Supabase -------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[NewLead] No authenticated user", userError);
          if (!cancelled) {
            setTeamId(null);
            setCurrentUserId(null);
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
          console.error("[NewLead] Failed to load profile", profileError);
        }

        let tId: string | null = profile?.team_id ?? null;

        // fallback to metadata.primary_team_id
        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) {
            tId = metaTeam;
          }
        }

        if (!cancelled) {
          setTeamId(tId);
          setCurrentUserId(userId);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[NewLead] Failed to load workspace context", err);
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

  /* -------------------- 2) Load custom fields + stages -------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!workspaceLoaded || !teamId) return;

      try {
        const [defs, stageDefs] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
        ]);

        if (cancelled) return;

        setFields(defs);
        setStages(stageDefs);

        if (stageDefs.length > 0) {
          setStage((prev) => (prev ? prev : stageDefs[0].name));
        }
      } catch (err) {
        console.error("[NewLead] Failed to load new-lead metadata", err);
      } finally {
        if (!cancelled) setMetaLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoaded]);

  /* -------------------- 2.5) Auto-suggest source_name from contact_type -------------------- */

  useEffect(() => {
    const suggestion = sourceNameFromContactType(
      systemFields.primary_contact_type,
    );
    if (!suggestion) return;

    if (systemFields.source_name === "") {
      setSystemFields((p) => ({ ...p, source_name: suggestion }));
    }
  }, [systemFields.primary_contact_type]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------- 3) Single lead submit -------------------- */

  function handleCustomChange(key: string, value: any) {
    if (RESERVED_SYSTEM_KEYS.has(key)) return;
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!teamId) {
      alert("Missing team. Please open this page from your workspace.");
      return;
    }

    if (!currentUserId) {
      alert("Missing current user. Please re-login and try again.");
      return;
    }

    if (!stage) {
      alert("Please select a stage.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage,
            systemFields: {
              lead_name: normalizeBlankToNull(systemFields.lead_name),

              niche: normalizeBlankToNull(systemFields.niche),
              lead_type: systemFields.lead_type || null,
              gender: systemFields.gender || null,

              city: normalizeBlankToNull(systemFields.city),
              region: normalizeBlankToNull(systemFields.region),
              country: normalizeBlankToNull(systemFields.country),
              postal_code: normalizeBlankToNull(systemFields.postal_code),

              // ✅ always send non-null contact type to satisfy DB constraint
              primary_contact_type: coercePrimaryContactType(
                systemFields.primary_contact_type,
              ),
              primary_contact_value: normalizeBlankToNull(
                systemFields.primary_contact_value,
              ),

              source_category: systemFields.source_category || null,
              source_name: systemFields.source_name || null,
            },
            customValues,
            prospectorId: currentUserId,
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[NewLead] Failed to create lead", res.status, text);
        alert("Failed to create lead. Please try again.");
        return;
      }

      window.location.href = `/leads`;
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
      setCsvError(`Unknown columns: ${unknown.join(", ")}.`);
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
      setCsvError("Please upload a .csv file.");
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
          setCsvError("CSV file contains no data rows.");
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
        setCsvError(err?.message || "Failed to parse CSV file.");
        setCsvRowCount(null);
      }
    };
    reader.onerror = () => {
      setCsvStatus("invalid");
      setCsvError("Could not read the CSV file.");
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

  /* -------------------- 5) CSV → DB import -------------------- */

  async function handleImportCsv() {
    if (!teamId) {
      alert("Missing team. Please open this page from your workspace.");
      return;
    }
    if (!currentUserId) {
      alert("Missing current user. Please re-login and try again.");
      return;
    }
    if (!stage) {
      alert("Please select a pipeline stage first (left side).");
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

    setImporting(true);
    setImportMessage(null);

    const headerToField: Record<string, LeadFieldDefinition> = {};
    for (const f of fields) {
      headerToField[f.label.trim().toLowerCase()] = f;
    }

    let success = 0;
    let failed = 0;

    for (const row of csvRows) {
      const rowCustom: Record<string, any> = {};

      const rowSystem: Record<string, any> = {
        lead_name: null,

        niche: null,
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
            rowSystem[sysKey] = null;
            return;
          }

          if (sysKey === "lead_type")
            rowSystem.lead_type = normalizeLeadType(raw) || null;
          else if (sysKey === "gender")
            rowSystem.gender = normalizeGender(raw) || null;
          else if (sysKey === "primary_contact_type")
            rowSystem.primary_contact_type = normalizeContactType(raw) || null;
          else if (sysKey === "source_category")
            rowSystem.source_category = normalizeSourceCategory(raw) || null;
          else if (sysKey === "source_name")
            rowSystem.source_name = normalizeSourceName(raw) || null;
          else rowSystem[sysKey] = normalizeBlankToNull(raw);

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
        } else {
          if (!RESERVED_SYSTEM_KEYS.has(field.key)) {
            rowCustom[field.key] = raw;
          }
        }
      });

      if (!rowSystem.source_name && rowSystem.primary_contact_type) {
        const suggestion = sourceNameFromContactType(
          rowSystem.primary_contact_type as any,
        );
        if (suggestion) rowSystem.source_name = suggestion;
      }

      rowSystem.primary_contact_type = coercePrimaryContactType(
        rowSystem.primary_contact_type ?? "",
      );

      try {
        const res = await fetch(
          `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage,
              systemFields: rowSystem,
              customValues: rowCustom,
              prospectorId: currentUserId,
            }),
          },
        );

        if (!res.ok) failed += 1;
        else success += 1;
      } catch {
        failed += 1;
      }
    }

    setImporting(false);
    setImportMessage(
      `Imported ${success} row${success !== 1 ? "s" : ""}${
        failed ? `, ${failed} failed.` : "."
      }`,
    );
  }

  /* -------------------- Render guards -------------------- */

  if (!workspaceLoaded) {
    return <PageLoadingState />;
  }

  if (workspaceLoaded && !teamId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
      </div>
    );
  }

  if (isLoadingMeta) {
    return <PageLoadingState />;
  }

  const canSubmit = !submitting && !importing;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">Add Leads</h1>
          <p className="text-sm text-slate-500">
            Add a single lead manually or import multiple leads from a CSV file.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* LEFT: Single lead form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            {/* Stage selector */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Pipeline Stage
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                required
                disabled={!canSubmit}
              >
                {stages.length === 0 && (
                  <option value="">No stages defined</option>
                )}
                {stages.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Core Details */}
            <div className="border-t border-slate-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                Core Details
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* ✅ Lead Name */}
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Lead Name
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={systemFields.lead_name}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        lead_name: e.target.value,
                      }))
                    }
                    disabled={!canSubmit}
                    placeholder="e.g. John Smith / Acme Inc."
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Niche / Industry
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={systemFields.niche}
                    onChange={(e) =>
                      setSystemFields((p) => ({ ...p, niche: e.target.value }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Lead Type
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    value={systemFields.lead_type}
                    onChange={(e) => {
                      const next = e.target.value as
                        | ""
                        | "individual"
                        | "business";
                      setSystemFields((p) => ({
                        ...p,
                        lead_type: next,
                        // if switching away from individual, clear gender
                        gender: next === "individual" ? p.gender : "",
                      }));
                    }}
                    disabled={!canSubmit}
                  >
                    <option value="">Select…</option>
                    <option value="individual">Individual</option>
                    <option value="business">Business</option>
                  </select>
                </div>

                {/* ✅ FIXED: styled gender select + cursor-pointer when enabled */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Gender
                  </label>
                  <select
                    className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      !canSubmit || systemFields.lead_type !== "individual"
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer"
                    }`}
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
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                {/* ✅ FIXED: City input was accidentally changing lead_type before */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    City
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={systemFields.city}
                    onChange={(e) =>
                      setSystemFields((p) => ({ ...p, city: e.target.value }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Region
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={systemFields.region}
                    onChange={(e) =>
                      setSystemFields((p) => ({ ...p, region: e.target.value }))
                    }
                    disabled={!canSubmit}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Country
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Postal Code
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Primary Contact Type
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
                    <option value="">Select…</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="reddit">Reddit</option>
                    <option value="twitter_x">Twitter/X</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telegram">Telegram</option>
                    <option value="discord">Discord</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Primary Contact
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Source Category
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    value={systemFields.source_category}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        source_category: e.target.value as any,
                      }))
                    }
                    disabled={!canSubmit}
                  >
                    <option value="">Select…</option>
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                    <option value="referral">Referral</option>
                    <option value="partner">Partner</option>
                    <option value="purchased">Purchased</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                    Source Name
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    value={systemFields.source_name}
                    onChange={(e) =>
                      setSystemFields((p) => ({
                        ...p,
                        source_name: e.target.value as any,
                      }))
                    }
                    disabled={!canSubmit}
                  >
                    <option value="">Select…</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="reddit">Reddit</option>
                    <option value="twitter_x">Twitter/X</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Custom fields */}
            {fields.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">
                  Additional Details
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {fields
                    .filter((f) => !RESERVED_SYSTEM_KEYS.has(f.key))
                    .map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                          {field.label}
                        </label>

                        {field.type === "text" && (
                          <input
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onChange={(e) =>
                              handleCustomChange(field.key, e.target.value)
                            }
                            disabled={!canSubmit}
                          />
                        )}

                        {field.type === "number" && (
                          <input
                            type="number"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              onChange={(e) =>
                                handleCustomChange(field.key, e.target.checked)
                              }
                              disabled={!canSubmit}
                            />
                            <span>Yes</span>
                          </label>
                        )}

                        {field.type === "select" && (
                          <select
                            className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              canSubmit
                                ? "cursor-pointer"
                                : "cursor-not-allowed"
                            }`}
                            onChange={(e) =>
                              handleCustomChange(
                                field.key,
                                e.target.value || null,
                              )
                            }
                            disabled={!canSubmit}
                          >
                            <option value="">Select…</option>
                            {(field.options ?? []).map((opt: string) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {field.type === "link" && (
                          <input
                            type="url"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="https://example.com"
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
                disabled={!canSubmit || !stage}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? "Creating…" : "Create Lead"}
              </button>
            </div>
          </form>

          {/* RIGHT: CSV upload */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-1">
              <h2 className="text-sm font-semibold text-slate-900">
                Import from CSV
              </h2>
              <p className="text-xs text-slate-500">
                Upload a CSV whose headers match either your custom field labels
                or the supported core columns.
              </p>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                isDragging
                  ? "border-indigo-400 bg-indigo-50/70"
                  : "border-slate-300 bg-slate-50"
              }`}
            >
              <p className="text-sm font-medium text-slate-700">
                Drag &amp; drop your CSV here
              </p>
              <p className="mt-1 text-xs text-slate-500">
                or click to choose a file
              </p>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInputChange}
                className="mt-4 cursor-pointer text-xs"
                disabled={importing}
              />

              {csvFileName && (
                <p className="mt-3 text-xs text-slate-500">
                  Selected file:{" "}
                  <span className="font-semibold text-slate-700">
                    {csvFileName}
                  </span>
                </p>
              )}
            </div>

            {/* CSV status / feedback */}
            <div className="mt-2 space-y-2 text-xs">
              {csvStatus === "parsing" && (
                <p className="text-slate-500">Checking CSV structure…</p>
              )}

              {csvStatus === "valid" && csvRowCount !== null && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700">
                    <p className="font-medium">
                      CSV looks good! {csvRowCount} row
                      {csvRowCount !== 1 ? "s" : ""} ready to be imported.
                    </p>
                    <p className="mt-1 text-[11px]">
                      Supports both configured custom fields and core columns.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportCsv}
                    disabled={importing || !stage}
                    className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {importing
                      ? "Importing…"
                      : `Import ${csvRowCount} row${
                          csvRowCount !== 1 ? "s" : ""
                        }`}
                  </button>

                  {importMessage && (
                    <p className="text-[11px] text-slate-500">
                      {importMessage}
                    </p>
                  )}
                </div>
              )}

              {csvStatus === "invalid" && csvError && (
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
                  <p className="font-medium">CSV columns don’t match.</p>
                  <p className="mt-1 text-[11px]">{csvError}</p>
                </div>
              )}

              {csvStatus === "idle" && (
                <p className="text-[11px] text-slate-400">
                  Custom columns allowed:{" "}
                  {fields.length > 0
                    ? fields.map((f) => f.label).join(", ")
                    : "—"}
                  <br />
                  Core columns allowed: Lead Name, Niche / Industry, Lead Type,
                  Gender, City, Region, Country, Postal Code, Primary Contact
                  Type, Primary Contact, Source Category, Source Name.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
