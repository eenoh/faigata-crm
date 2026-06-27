"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  getPipelineStages,
  type PipelineStageDef,
} from "@/features/crm/data/pipelineStages";
import {
  getConversionMetricDefinitions,
  saveConversionMetricDefinitions,
} from "@/features/crm/data/conversionMetricDefinitions";
import {
  findStageNameById,
  type ConversionMetricDefinition,
} from "@/features/crm/utils/conversionMetrics";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadingStage = "workspace" | "definitions" | "idle";

type ConversionMetricDefinitionWithTarget = ConversionMetricDefinition & {
  targetRate: number | null;
};

type StageOption = {
  id: string;
  name: string;
  position: number;
};

function normalizePercentLike(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 0 && n < 1) return Math.round(n * 100);
  return Math.round(n);
}

function LoadingState({
  title,
  subtitle,
  isDark,
}: {
  title: string;
  subtitle: string;
  isDark: boolean;
}) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const row = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-slate-50";
  const pulse = isDark ? "bg-slate-800/70" : "bg-slate-100";

  return (
    <div className="max-w-3xl space-y-6 animate-pulse">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div className={`h-6 w-56 rounded ${pulse}`} />
        <div className={`mt-2 h-4 w-full max-w-xl rounded ${pulse}`} />
        <div className={`mt-2 h-4 w-96 rounded ${pulse}`} />
        <div className="sr-only">
          <p>{title}</p>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`rounded-xl border p-3 space-y-2 ${row}`}>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className={`h-10 flex-1 rounded-lg ${pulse}`} />
              <div className={`h-10 w-full rounded-lg md:w-40 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg md:w-40 ${pulse}`} />
              <div className={`h-10 w-full rounded-lg md:w-32 ${pulse}`} />
              <div className={`mt-2 h-6 w-16 rounded md:mt-2 ${pulse}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <div className={`h-5 w-44 rounded ${pulse}`} />
        <div className={`h-10 w-32 rounded-lg ${pulse}`} />
      </div>
    </div>
  );
}

export function ConversionMetricDefinitionsSettingsClient() {
  const t = useTranslations("ConversionMetricDefinitionsSettingsPage");
  const tLeadFields = useTranslations("LeadFieldsSettingsPage");
  const tSettings = useTranslations("SettingsPage");
  const common = useTranslations("Common");
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

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
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stageOptions = useMemo<StageOption[]>(() => {
    return (stages ?? [])
      .filter(
        (s): s is PipelineStageDef & { id: string; name: string } =>
          typeof s?.id === "string" &&
          s.id.trim().length > 0 &&
          typeof s?.name === "string" &&
          s.name.trim().length > 0,
      )
      .map((s, index) => ({
        id: s.id.trim(),
        name: s.name.trim(),
        position:
          typeof s.position === "number" && Number.isFinite(s.position)
            ? s.position
            : index,
      }))
      .sort((a, b) => a.position - b.position);
  }, [stages]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (workspaceLoading) {
        if (!cancelled) {
          setLoading(true);
          setLoadingStage("workspace");
        }
        return;
      }

      if (!teamId) {
        if (!cancelled) {
          setStages([]);
          setDefs([]);
          setLoading(false);
          setLoadingStage("idle");
          setErrorMessage(null);
        }
        return;
      }

      try {
        if (!cancelled) {
          setLoading(true);
          setLoadingStage("definitions");
          setErrorMessage(null);
        }

        const [stageDefs, existingDefs] = await Promise.all([
          getPipelineStages(teamId),
          getConversionMetricDefinitions(teamId),
        ]);

        if (cancelled) return;

        setStages(
          [...(stageDefs ?? [])].sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
          ),
        );

        setDefs(
          (existingDefs ?? []).map((d: any, i: number) => ({
            ...(d as ConversionMetricDefinition),
            position: typeof d?.position === "number" ? d.position : i,
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
          setErrorMessage(t("errors.loadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingStage("idle");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading, t]);

  const canAdd = useMemo(() => stageOptions.length >= 2, [stageOptions.length]);

  function addDefinition() {
    if (!canAdd) return;

    const first = stageOptions[0];
    const second = stageOptions[1];
    if (!first || !second) return;

    setDefs((prev) => [
      ...prev,
      {
        label: t("defaults.newMetric"),
        fromStageId: first.id,
        toStageId: second.id,
        fromStageName: first.name,
        toStageName: second.name,
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
      setErrorMessage(t("errors.missingTeam"));
      setSaveState("error");
      return;
    }

    if (!defs.length) {
      setErrorMessage(t("errors.atLeastOneMetric"));
      setSaveState("error");
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
        !d.fromStageId ||
        !d.toStageId ||
        d.fromStageName === "(deleted)" ||
        d.toStageName === "(deleted)",
    );
    if (invalid) {
      setErrorMessage(t("errors.metricFieldsRequired"));
      setSaveState("error");
      return;
    }

    const invalidTarget = trimmed.some(
      (d) => d.targetRate != null && (d.targetRate < 0 || d.targetRate > 100),
    );
    if (invalidTarget) {
      setErrorMessage(t("errors.targetRateRange"));
      setSaveState("error");
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
      setSaveState("error");
      setErrorMessage(t("errors.saveFailed"));
    }
  }

  if (workspaceLoading || loading) {
    const title =
      loadingStage === "workspace"
        ? t("loading.workspace.title")
        : loadingStage === "definitions"
          ? t("loading.definitions.title")
          : t("loading.idle.title");

    const subtitle =
      loadingStage === "workspace"
        ? t("loading.workspace.subtitle")
        : loadingStage === "definitions"
          ? t("loading.definitions.subtitle")
          : tSettings("loading.idle.subtitle");

    return <LoadingState title={title} subtitle={subtitle} isDark={isDark} />;
  }

  if (!teamId) {
    return (
      <div
        className={`max-w-xl rounded-2xl border px-4 py-3 text-sm shadow-sm ${
          isDark
            ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
            : "border-rose-100 bg-rose-50 text-rose-700"
        }`}
      >
        <p className="font-medium">{tLeadFields("empty.noTeam.title")}</p>
        <p className="mt-1">{t("empty.noTeam.description")}</p>
      </div>
    );
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
            {t("page.title")}
          </h1>
          <p
            className={`mt-1 text-sm ${
              isDark ? "text-slate-400" : "text-slate-600"
            }`}
          >
            {t("page.description")}
          </p>
          {!canAdd && (
            <p
              className={`mt-2 text-xs ${
                isDark ? "text-amber-300/90" : "text-amber-700"
              }`}
            >
              {t("tips.needStages")}
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
              {t("states.saved")}
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
              className={`font-medium ${
                isDark ? "text-slate-200" : "text-slate-700"
              }`}
            >
              {t("empty.noMetrics.title")}
            </p>
            <p className="mt-1">{t("empty.noMetrics.description")}</p>
          </div>
        )}

        {defs.map((metric, index) => (
          <div
            key={`${metric.position}-${metric.label}-${index}`}
            className={`rounded-xl border p-3 space-y-2 ${row}`}
          >
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                className={`flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${input}`}
                value={metric.label}
                onChange={(e) =>
                  updateDefinition(index, { label: e.target.value })
                }
                placeholder={t("placeholders.metricName")}
                disabled={saveState === "saving"}
              />

              <select
                className={`w-full md:w-40 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${select}`}
                value={metric.fromStageId}
                onChange={(e) =>
                  updateDefinition(index, {
                    fromStageId: e.target.value,
                    fromStageName: findStageNameById(
                      stageOptions,
                      e.target.value,
                    ),
                  })
                }
                disabled={saveState === "saving"}
              >
                {stageOptions.map((s) => (
                  <option key={`from-${s.id}`} value={s.id}>
                    {t("fields.fromStageOption", { stage: s.name })}
                  </option>
                ))}
              </select>

              <select
                className={`w-full md:w-40 rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${select}`}
                value={metric.toStageId}
                onChange={(e) =>
                  updateDefinition(index, {
                    toStageId: e.target.value,
                    toStageName: findStageNameById(
                      stageOptions,
                      e.target.value,
                    ),
                  })
                }
                disabled={saveState === "saving"}
              >
                {stageOptions.map((s) => (
                  <option key={`to-${s.id}`} value={s.id}>
                    {t("fields.toStageOption", { stage: s.name })}
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
                  placeholder={t("placeholders.targetRate")}
                  aria-label={t("fields.targetRate")}
                  title={t("fields.targetRateTitle")}
                  disabled={saveState === "saving"}
                />
                <p
                  className={`mt-1 text-[10px] ${
                    isDark ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {t("fields.targetRate")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeDefinition(index)}
                disabled={saveState === "saving"}
                className={`text-xs self-start cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDark
                    ? "text-slate-400 hover:text-rose-300"
                    : "text-slate-500 hover:text-red-500"
                }`}
              >
                {t("actions.remove")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={addDefinition}
          disabled={!canAdd || saveState === "saving"}
          className={`text-sm font-medium mt-1 hover:underline disabled:opacity-50 disabled:cursor-not-allowed ${
            isDark ? "text-indigo-300" : "text-indigo-600"
          }`}
        >
          {t("actions.addMetric")}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {saveState === "saving"
            ? common("actions.saving")
            : t("actions.saveMetrics")}
        </button>

        {saveState === "idle" && defs.length > 0 && (
          <span
            className={`text-xs ${
              isDark ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {t("states.rememberToSave")}
          </span>
        )}
      </div>
    </div>
  );
}
