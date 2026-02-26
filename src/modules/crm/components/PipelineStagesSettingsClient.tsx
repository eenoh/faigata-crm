"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  getPipelineStages,
  savePipelineStages,
  type PipelineStageDef,
} from "@/modules/crm/data/pipelineStages";
import { useTheme } from "next-themes";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadingStage = "workspace" | "stages" | "idle";

function LoadingCard({
  stage,
  isDark,
}: {
  stage: LoadingStage;
  isDark: boolean;
}) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const pulse = isDark ? "bg-slate-800/70" : "bg-slate-100";

  const title =
    stage === "workspace"
      ? "Loading workspace…"
      : stage === "stages"
        ? "Loading pipeline stages…"
        : "Loading…";

  const subtitle =
    stage === "workspace"
      ? "Checking your team and permissions."
      : stage === "stages"
        ? "Fetching your saved pipeline configuration."
        : "Please wait.";

  return (
    <div className="max-w-3xl space-y-4">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <p
          className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}
        >
          {title}
        </p>
        <p
          className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
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
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const soft = isDark
    ? "border-slate-800 bg-slate-900/40"
    : "border-slate-100 bg-slate-50";

  const inputTheme = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-600"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          setErrorMessage("No team found. Open this page from a workspace.");
        }
        return;
      }

      try {
        if (!cancelled) {
          setLoading(true);
          setLoadingStage("stages");
          setErrorMessage(null);
        }

        const defs = await getPipelineStages(teamId);

        if (!cancelled) setStages(defs ?? []);
      } catch (err) {
        console.error("[PipelineStages] Failed to load", err);
        if (!cancelled) {
          setStages([]);
          setErrorMessage("Failed to load pipeline stages.");
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
  }, [teamId, workspaceLoading]);

  function addStage() {
    setStages((prev) => [
      ...prev,
      { name: `New Stage ${prev.length + 1}`, position: prev.length },
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
      setErrorMessage(
        "Missing team. This page must be opened from within your workspace.",
      );
      return;
    }

    if (stages.length === 0) {
      setErrorMessage("Add at least one stage before saving.");
      return;
    }

    const trimmed = stages.map((s, index) => ({
      ...s,
      name: (s.name ?? "").trim(),
      position: index,
    }));

    if (trimmed.some((s) => !s.name)) {
      setErrorMessage("Every stage needs a name.");
      return;
    }

    const nameSet = new Set<string>();
    for (const s of trimmed) {
      const lower = s.name.toLowerCase();
      if (nameSet.has(lower)) {
        setErrorMessage("Stage names must be unique.");
        return;
      }
      nameSet.add(lower);
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      await savePipelineStages(trimmed, teamId);
      setStages(trimmed);
      setSaveState("saved");
    } catch (err) {
      console.error("[PipelineStages] Error while saving stages", err);
      setSaveState("error");
      setErrorMessage("Saving your pipeline stages failed. Please try again.");
    }
  }

  if (workspaceLoading || loading) {
    return <LoadingCard stage={loadingStage} isDark={isDark} />;
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
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from your
          workspace or contact support.
        </p>
      </div>
    );
  }

  const canEdit = saveState !== "saving";

  return (
    <div className="max-w-3xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <h1
          className={`text-xl md:text-2xl font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}
        >
          Pipeline Stages
        </h1>
        <p
          className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}
        >
          Define the stages of your sales pipeline and their order.
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

      <div className="space-y-3">
        {stages.length === 0 && (
          <div
            className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${
              isDark
                ? "border-slate-800 bg-slate-950 text-slate-400"
                : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            No pipeline stages yet.
          </div>
        )}

        {stages.map((stage, index) => (
          <div
            key={index}
            className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm ${card}`}
          >
            <input
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 ${inputTheme}`}
              value={stage.name}
              onChange={(e) => updateStage(index, { name: e.target.value })}
              disabled={!canEdit}
            />

            <div className="flex flex-col items-end gap-1 text-[11px]">
              <div className="inline-flex gap-1">
                <button
                  onClick={() => moveStage(index, "up")}
                  disabled={!canEdit || index === 0}
                  className="rounded-full border px-2 py-1 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveStage(index, "down")}
                  disabled={!canEdit || index === stages.length - 1}
                  className="rounded-full border px-2 py-1 disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
              <button
                onClick={() => removeStage(index)}
                disabled={!canEdit}
                className="text-[11px] text-slate-400 hover:text-rose-600"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={addStage}
          disabled={!canEdit}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          + Add Stage
        </button>

        <button
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        >
          {saveState === "saving" ? "Saving…" : "Save Stages"}
        </button>
      </div>
    </div>
  );
}
