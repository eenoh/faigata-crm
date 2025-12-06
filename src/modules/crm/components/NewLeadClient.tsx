// src/app/leads/new/NewLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import {
  getPipelineStages,
  type PipelineStageDef,
} from "@/modules/crm/data/pipelineStages";
import { supabase } from "@/lib/supabaseClient";

type CsvStatus = "idle" | "parsing" | "valid" | "invalid";

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("CSV file is empty.");
  }

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  const rows = lines
    .slice(1)
    .map((line) => line.split(","))
    .filter((cells) => cells.some((c) => c.trim() !== ""));

  return { headers, rows };
}

export function NewLeadClient() {
  // workspace / team
  const [teamId, setTeamId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null); // NEW
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  // metadata
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [stage, setStage] = useState("");
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
          setCurrentUserId(userId); // NEW
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
          setStage(stageDefs[0].name); // default first stage
        }
      } catch (err) {
        console.error("[NewLead] Failed to load new-lead metadata", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoaded]);

  /* -------------------- 3) Single lead submit -------------------- */

  function handleCustomChange(key: string, value: any) {
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

    const res = await fetch(`/api/crm/leads?teamId=${encodeURIComponent(
      teamId
    )}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        customValues,
        prospectorId: currentUserId, // NEW
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[NewLead] Failed to create lead", res.status, text);
      alert("Failed to create lead. Please try again.");
      return;
    }

    window.location.href = `/leads`;
  }

  /* -------------------- 4) CSV handling & validation -------------------- */

  function validateCsv(headers: string[], rowCount: number): boolean {
    const definedColumns = fields.map((f) => f.label.trim().toLowerCase());
    const headerSet = new Set(headers.map((h) => h.toLowerCase()));
    const definedSet = new Set(definedColumns);

    const missing = definedColumns.filter((h) => !headerSet.has(h));
    const extra = headers
      .map((h) => h.toLowerCase())
      .filter((h) => !definedSet.has(h));

    if (missing.length || extra.length) {
      let msg = "The CSV columns do not match your lead fields.";
      if (missing.length) {
        msg += ` Missing: ${missing.join(", ")}.`;
      }
      if (extra.length) {
        msg += ` Extra in CSV: ${extra.join(", ")}.`;
      }
      setCsvStatus("invalid");
      setCsvError(msg);
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

      csvHeaders.forEach((header, idx) => {
        const field = headerToField[header.toLowerCase()];
        if (!field) return;

        const raw = (row[idx] ?? "").trim();
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
          rowCustom[field.key] = raw;
        }
      });

      try {
        const res = await fetch(
          `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              stage,
              customValues: rowCustom,
              prospectorId: currentUserId, // NEW
            }),
          }
        );

        if (!res.ok) {
          failed += 1;
        } else {
          success += 1;
        }
      } catch {
        failed += 1;
      }
    }

    setImporting(false);
    setImportMessage(
      `Imported ${success} row${success !== 1 ? "s" : ""}${
        failed ? `, ${failed} failed.` : "."
      }`
    );
  }

  /* -------------------- 6) UI -------------------- */

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

            {/* Custom fields */}
            {fields.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">
                  Lead Details
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {fields.map((field) => (
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
                                : Number(e.target.value)
                            )
                          }
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
                          />
                          <span>Yes</span>
                        </label>
                      )}

                      {field.type === "select" && (
                        <select
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          onChange={(e) =>
                            handleCustomChange(field.key, e.target.value || null)
                          }
                        >
                          <option value="">Select…</option>
                          {field.options?.map((opt) => (
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
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
              >
                Create Lead
              </button>
            </div>
          </form>

          {/* RIGHT: CSV upload (design unchanged) */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-1">
              <h2 className="text-sm font-semibold text-slate-900">
                Import from CSV
              </h2>
              <p className="text-xs text-slate-500">
                Upload a CSV whose column headers match your lead field labels.
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
                      Columns match your configured lead fields.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportCsv}
                    disabled={importing}
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
                  Expected columns:{" "}
                  {fields.length > 0
                    ? fields.map((f) => f.label).join(", ")
                    : "configure lead fields first in Settings → Lead fields."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
