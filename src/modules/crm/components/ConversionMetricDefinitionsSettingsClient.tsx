// src/modules/crm/components/ConversionMetricDefinitionsSettingsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  getPipelineStages,
  type PipelineStageDef,
} from "@/modules/crm/data/pipelineStages";
import {
  getConversionMetricDefinitions,
  saveConversionMetricDefinitions,
  type ConversionMetricDefinition,
} from "@/modules/crm/data/conversionMetricDefinitions";

type SaveState = "idle" | "saving" | "saved";

type ConversionMetricDefinitionWithTarget = ConversionMetricDefinition & {
  targetRate: number | null; // 0–100
};

function normalizePercentLike(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === ("" as any)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // If API ever returns 0.5 meaning 50%, normalize.
  if (n > 0 && n < 1) return Math.round(n * 100);
  return Math.round(n);
}

function LoadingState({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const row = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-slate-50";
  const pulse = isDark ? "bg-slate-800/70" : "bg-slate-100";

  return (
    <div className="max-w-3xl space-y-6 animate-pulse">
      {/* Header card skeleton */}
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div className={`h-6 w-56 rounded ${pulse}`} />
        <div className={`mt-2 h-4 w-full max-w-xl rounded ${pulse}`} />
        <div className={`mt-2 h-4 w-96 rounded ${pulse}`} />
      </div>

      {/* List skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`rounded-xl border p-3 space-y-2 ${row}`}>
            <div className="flex flex-col md:flex-row gap-2">
              <div className={`h-10 flex-1 rounded-lg ${pulse}`} />
              <div className={`h-10 w-full md:w-40 rounded-lg ${pulse}`} />
              <div className={`h-10 w-full md:w-40 rounded-lg ${pulse}`} />
              <div className={`h-10 w-full md:w-32 rounded-lg ${pulse}`} />
              <div className={`h-6 w-16 rounded ${pulse} mt-2 md:mt-2`} />
            </div>
          </div>
        ))}
      </div>

      {/* Actions skeleton */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <div className={`h-5 w-44 rounded ${pulse}`} />
        <div className={`h-10 w-32 rounded-lg ${pulse}`} />
      </div>
    </div>
  );
}

export function ConversionMetricDefinitionsSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const row = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-slate-50";

  const input = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-600"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  const select = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";

  const empty = isDark
    ? "border-slate-800 bg-slate-950 text-slate-400"
    : "border-slate-200 bg-slate-50 text-slate-500";

  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [defs, setDefs] = useState<ConversionMetricDefinitionWithTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (workspaceLoading) return;

      if (!teamId) {
        setLoading(false);
        setErrorMessage("No team found. Open this page from a workspace.");
        return;
      }

      try {
        setLoading(true);

        const [stageDefs, existingDefs] = await Promise.all([
          getPipelineStages(teamId),
          getConversionMetricDefinitions(teamId),
        ]);

        if (cancelled) return;

        setStages(
          [...(stageDefs ?? [])].sort((a, b) => a.position - b.position),
        );

        setDefs(
          (existingDefs ?? []).map((d: any, i: number) => ({
            ...(d as ConversionMetricDefinition),
            position: typeof d?.position === "number" ? d.position : i,
            // support either targetRate or target_rate, and normalize 0–1 -> 0–100 if needed
            targetRate:
              normalizePercentLike(d?.targetRate) ??
              normalizePercentLike(d?.target_rate) ??
              null,
          })),
        );

        setErrorMessage(null);
      } catch (err) {
        console.error("[ConversionMetricDefs] Failed to load", err);
        if (!cancelled) {
          setStages([]);
          setDefs([]);
          setErrorMessage("Failed to load conversion metrics.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading]);

  const canAdd = useMemo(() => stages.length >= 2, [stages.length]);

  function addDefinition() {
    if (!canAdd) return;

    const first = stages[0]?.name ?? "";
    const second = stages[1]?.name ?? "";

    setDefs((prev) => [
      ...prev,
      {
        label: "New conversion metric",
        fromStage: first,
        toStage: second,
        position: prev.length,
        targetRate: null,
      },
    ]);

    setSaveState("idle");
    setErrorMessage(null);
  }

  function updateDefinition(
    index: number,
    patch: Partial<ConversionMetricDefinitionWithTarget>,
  ) {
    setDefs((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
    setSaveState("idle");
    setErrorMessage(null);
  }

  function removeDefinition(index: number) {
    setDefs((prev) =>
      prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, position: i })),
    );
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    if (!teamId) {
      setErrorMessage(
        "Missing team. This page must be opened from within your workspace.",
      );
      return;
    }
    if (!defs.length) {
      setErrorMessage("Add at least one conversion metric before saving.");
      return;
    }

    const trimmed = defs.map((d, index) => {
      const label = String(d.label ?? "").trim();
      const targetRate = normalizePercentLike(d.targetRate);
      return { ...d, label, position: index, targetRate };
    });

    const invalid = trimmed.some(
      (d) =>
        !d.label ||
        !d.fromStage ||
        !d.toStage ||
        d.fromStage === "(deleted)" ||
        d.toStage === "(deleted)",
    );
    if (invalid) {
      setErrorMessage("Every metric needs a name and valid from/to stages.");
      return;
    }

    const invalidTarget = trimmed.some(
      (d) => d.targetRate != null && (d.targetRate < 0 || d.targetRate > 100),
    );
    if (invalidTarget) {
      setErrorMessage("Target rate must be between 0 and 100.");
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      await saveConversionMetricDefinitions(teamId, trimmed as any);
      setDefs(trimmed);
      setSaveState("saved");
    } catch (err) {
      console.error("[ConversionMetricDefs] Error while saving", err);
      setSaveState("idle");
      setErrorMessage(
        "Saving your conversion metrics failed. Please try again.",
      );
    }
  }

  if (!teamId && !workspaceLoading) {
    return (
      <div
        className={`max-w-xl rounded-2xl border px-4 py-3 text-sm shadow-sm ${
          isDark
            ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
            : "border-rose-100 bg-rose-50 text-rose-700"
        }`}
      >
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from within
          your workspace or contact support.
        </p>
      </div>
    );
  }

  if (workspaceLoading || loading) {
    return <LoadingState isDark={isDark} />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div
        className={`rounded-2xl border px-5 py-4 shadow-sm flex items-start justify-between gap-4 ${card}`}
      >
        <div>
          <h1
            className={`text-xl md:text-2xl font-semibold ${
              isDark ? "text-slate-100" : "text-slate-900"
            }`}
          >
            Conversion Metrics
          </h1>
          <p
            className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}
          >
            Define the conversion metrics you want to track. Each metric
            compares how many leads move from one stage of the pipeline to
            another.
          </p>
          {!canAdd && (
            <p
              className={`mt-2 text-xs ${isDark ? "text-amber-300/90" : "text-amber-700"}`}
            >
              Add at least 2 pipeline stages to create conversion metrics.
            </p>
          )}
        </div>
      </div>

      {(errorMessage || saveState === "saved") && (
        <div className="space-y-2">
          {errorMessage && (
            <div
              className={`rounded-xl border px-4 py-2 text-xs ${
                isDark
                  ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
                  : "border-rose-100 bg-rose-50 text-rose-700"
              }`}
            >
              {errorMessage}
            </div>
          )}
          {saveState === "saved" && !errorMessage && (
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                isDark
                  ? "border-emerald-900/40 bg-emerald-950/30 text-emerald-200"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700"
              }`}
            >
              ✅ Conversion metrics saved
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {defs.length === 0 && (
          <div
            className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${empty}`}
          >
            <p
              className={`font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              No conversion metrics yet.
            </p>
            <p className="mt-1">
              Add metrics like{" "}
              <span
                className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}
              >
                Reply rate, Booking rate, Show-up rate
              </span>{" "}
              to match your process.
            </p>
          </div>
        )}

        {defs.map((metric, index) => (
          <div
            key={`${metric.position}-${metric.label}-${index}`}
            className={`rounded-xl border p-3 space-y-2 ${row}`}
          >
            <div className="flex flex-col md:flex-row gap-2">
              <input
                className={`flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${input}`}
                value={metric.label}
                onChange={(e) =>
                  updateDefinition(index, { label: e.target.value })
                }
                placeholder="Metric name (e.g. Reply rate, Booking rate)"
              />

              <select
                className={`w-full md:w-40 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${select}`}
                value={metric.fromStage}
                onChange={(e) =>
                  updateDefinition(index, { fromStage: e.target.value })
                }
              >
                {stages.map((s) => (
                  <option key={s.name} value={s.name}>
                    From: {s.name}
                  </option>
                ))}
              </select>

              <select
                className={`w-full md:w-40 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${select}`}
                value={metric.toStage}
                onChange={(e) =>
                  updateDefinition(index, { toStage: e.target.value })
                }
              >
                {stages.map((s) => (
                  <option key={s.name} value={s.name}>
                    To: {s.name}
                  </option>
                ))}
              </select>

              <div className="w-full md:w-32">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className={`w-full rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${input}`}
                  value={metric.targetRate ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateDefinition(index, {
                      targetRate: v === "" ? null : normalizePercentLike(v),
                    });
                  }}
                  placeholder="Target %"
                  aria-label="Target rate"
                  title="Target rate (0–100)"
                />
                <p
                  className={`mt-1 text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
                >
                  Target %
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeDefinition(index)}
                className={`text-xs self-start cursor-pointer ${
                  isDark
                    ? "text-slate-400 hover:text-rose-300"
                    : "text-slate-500 hover:text-red-500"
                }`}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={addDefinition}
          disabled={!canAdd}
          className={`text-sm font-medium mt-1 hover:underline disabled:opacity-50 disabled:cursor-not-allowed ${
            isDark ? "text-indigo-300" : "text-indigo-600"
          }`}
        >
          + Add Conversion Metric
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {saveState === "saving" ? "Saving…" : "Save Metrics"}
        </button>

        {saveState === "idle" && defs.length > 0 && (
          <span
            className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
          >
            Don’t forget to save your changes.
          </span>
        )}
      </div>
    </div>
  );
}
