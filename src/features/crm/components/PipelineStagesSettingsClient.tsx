"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useAppLocale } from "@/context/LocaleContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  getPipelineStages,
  savePipelineStages,
  type PipelineStageDef,
} from "@/features/crm/data/pipelineStages";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadingStage = "workspace" | "stages" | "idle";

function LoadingCard({
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
    : "border-slate-200 bg-white";

  const pulse = isDark ? "bg-slate-800/70" : "bg-slate-200/70";

  return (
    <div className="max-w-3xl space-y-4">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <p
          className={`text-sm font-medium ${
            isDark ? "text-slate-200" : "text-slate-700"
          }`}
        >
          {title}
        </p>
        <p
          className={`mt-1 text-xs ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {subtitle}
        </p>

        <div className="mt-4 space-y-3">
          <div className={`h-10 w-full animate-pulse rounded-xl ${pulse}`} />
          <div className={`h-10 w-full animate-pulse rounded-xl ${pulse}`} />
          <div className={`h-10 w-full animate-pulse rounded-xl ${pulse}`} />
        </div>

        <div className="mt-4 flex gap-2">
          <div className={`h-9 w-28 animate-pulse rounded-lg ${pulse}`} />
          <div className={`h-9 w-28 animate-pulse rounded-lg ${pulse}`} />
        </div>
      </div>
    </div>
  );
}

export function PipelineStagesSettingsClient() {
  const t = useTranslations("PipelineStagesSettingsPage");
  const tLeadFields = useTranslations("LeadFieldsSettingsPage");
  const tSettings = useTranslations("SettingsPage");
  const common = useTranslations("Common");
  const { locale } = useAppLocale();
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const softCard = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-200 bg-slate-50";

  const inputTheme = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:ring-indigo-400"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500";

  const buttonOutline = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/30"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const iconButton = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40 disabled:text-slate-600"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-300";

  const dangerButton = isDark
    ? "text-slate-400 hover:text-rose-300"
    : "text-slate-500 hover:text-rose-600";

  const normalizedStages = useMemo(
    () =>
      stages.map((stage, index) => ({
        ...stage,
        name: (stage.name ?? "").trim(),
        position: index,
      })),
    [stages],
  );

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
          setLoading(false);
          setLoadingStage("idle");
          setErrorMessage(null);
        }
        return;
      }

      try {
        if (!cancelled) {
          setLoading(true);
          setLoadingStage("stages");
          setErrorMessage(null);
        }

        const defs = await getPipelineStages(teamId, locale);

        if (!cancelled) {
          const sorted = [...(defs ?? [])].sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
          );
          setStages(sorted);
        }
      } catch (err) {
        console.error("[PipelineStages] Failed to load", err);
        if (!cancelled) {
          setStages([]);
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
  }, [teamId, workspaceLoading, locale, t]);

  function addStage() {
    setStages((prev) => [
      ...prev,
      {
        name: t("defaults.newStage", { number: prev.length + 1 }),
        position: prev.length,
      } as PipelineStageDef,
    ]);
    setSaveState("idle");
    setErrorMessage(null);
  }

  function updateStage(index: number, patch: Partial<PipelineStageDef>) {
    setStages((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
    setSaveState("idle");
    setErrorMessage(null);
  }

  function removeStage(index: number) {
    setStages((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((s, i) => ({ ...s, position: i }));
    });
    setSaveState("idle");
    setErrorMessage(null);
  }

  function moveStage(index: number, direction: "up" | "down") {
    setStages((prev) => {
      const copy = [...prev];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= copy.length) return prev;

      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy.map((s, i) => ({ ...s, position: i }));
    });
    setSaveState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    if (!teamId) {
      setErrorMessage(t("errors.missingTeam"));
      setSaveState("error");
      return;
    }

    if (normalizedStages.length === 0) {
      setErrorMessage(t("errors.atLeastOneStage"));
      setSaveState("error");
      return;
    }

    if (normalizedStages.some((s) => !s.name)) {
      setErrorMessage(t("errors.stageNameRequired"));
      setSaveState("error");
      return;
    }

    const nameSet = new Set<string>();
    for (const stage of normalizedStages) {
      const key = stage.name.toLocaleLowerCase(locale);
      if (nameSet.has(key)) {
        setErrorMessage(t("errors.stageNamesUnique"));
        setSaveState("error");
        return;
      }
      nameSet.add(key);
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      await savePipelineStages(normalizedStages, teamId, locale);
      setStages(normalizedStages);
      setSaveState("saved");
    } catch (err) {
      console.error("[PipelineStages] Error while saving stages", err);
      setSaveState("error");
      setErrorMessage(t("errors.saveFailed"));
    }
  }

  if (workspaceLoading || loading) {
    const title =
      loadingStage === "workspace"
        ? t("loading.workspace.title")
        : loadingStage === "stages"
          ? t("loading.stages.title")
          : t("loading.idle.title");

    const subtitle =
      loadingStage === "workspace"
        ? t("loading.workspace.subtitle")
        : loadingStage === "stages"
          ? t("loading.stages.subtitle")
          : tSettings("loading.idle.subtitle");

    return <LoadingCard title={title} subtitle={subtitle} isDark={isDark} />;
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

  const canEdit = saveState !== "saving";

  return (
    <div className="max-w-3xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <h1
          className={`text-xl font-semibold md:text-2xl ${
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
      </div>

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
              ? "border-emerald-900/40 bg-emerald-500/10 text-emerald-200"
              : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}
        >
          {t("states.saved")}
        </div>
      )}

      <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
        <div className={`rounded-xl border px-4 py-3 ${softCard}`}>
          <p
            className={`text-sm font-medium ${
              isDark ? "text-slate-200" : "text-slate-800"
            }`}
          >
            {t("tips.title")}
          </p>
          <p
            className={`mt-1 text-xs ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {t("tips.description")}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {stages.length === 0 && (
            <div
              className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${
                isDark
                  ? "border-slate-800 bg-slate-950 text-slate-400"
                  : "border-slate-300 bg-slate-50 text-slate-500"
              }`}
            >
              {t("empty.noStages")}
            </div>
          )}

          {stages.map((stage, index) => {
            const key = String((stage as { id?: string }).id ?? `idx-${index}`);

            return (
              <div
                key={key}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm ${card}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                      isDark
                        ? "bg-slate-900 text-slate-300"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <input
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${inputTheme}`}
                    value={stage.name ?? ""}
                    onChange={(e) =>
                      updateStage(index, { name: e.target.value })
                    }
                    disabled={!canEdit}
                    placeholder={t("placeholders.stageName")}
                  />
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveStage(index, "up")}
                      disabled={!canEdit || index === 0}
                      className={`rounded-full border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${iconButton}`}
                      title={t("actions.moveUp")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStage(index, "down")}
                      disabled={!canEdit || index === stages.length - 1}
                      className={`rounded-full border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${iconButton}`}
                      title={t("actions.moveDown")}
                    >
                      ↓
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeStage(index)}
                    disabled={!canEdit}
                    className={`text-[11px] transition disabled:cursor-not-allowed disabled:opacity-40 ${dangerButton}`}
                  >
                    {t("actions.remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={addStage}
            disabled={!canEdit}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonOutline}`}
          >
            {t("actions.addStage")}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saveState === "saving"
              ? common("actions.saving")
              : t("actions.saveStages")}
          </button>
        </div>
      </div>
    </div>
  );
}
