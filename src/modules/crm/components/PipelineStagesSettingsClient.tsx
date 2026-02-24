"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  getPipelineStages,
  savePipelineStages,
  type PipelineStageDef,
} from "@/modules/crm/data/pipelineStages";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadingStage = "workspace" | "stages" | "idle";

function LoadingCard({ stage }: { stage: LoadingStage }) {
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
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
        </div>

        <div className="mt-4 flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export function PipelineStagesSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) workspace phase
      if (workspaceLoading) {
        if (!cancelled) {
          setLoading(true);
          setLoadingStage("workspace");
        }
        return;
      }

      // Workspace resolved, now we can decide what to do
      if (!teamId) {
        if (!cancelled) {
          setStages([]);
          setLoading(false);
          setLoadingStage("idle");
          setErrorMessage("No team found. Open this page from a workspace.");
        }
        return;
      }

      // 2) stages phase
      try {
        if (!cancelled) {
          setLoading(true);
          setLoadingStage("stages");
          setErrorMessage(null);
        }

        const defs = await getPipelineStages(teamId);

        if (!cancelled) {
          setStages(defs ?? []);
          setErrorMessage(null);
        }
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

      const tmp = copy[index];
      copy[index] = copy[newIndex];
      copy[newIndex] = tmp;

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

    const trimmed: PipelineStageDef[] = stages.map((s, index) => ({
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

  // ✅ NEW: multi-step loading UI (workspace vs stages)
  if (workspaceLoading || loading) {
    return <LoadingCard stage={loadingStage} />;
  }

  if (!teamId) {
    return (
      <div className="max-w-xl rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
            Pipeline Stages
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Define the stages of your sales pipeline and their order. These
            stages are used in the lead pipeline and scoring automations.
          </p>
        </div>
      </div>

      {(errorMessage || saveState === "saved") && (
        <div className="space-y-2">
          {errorMessage && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
              {errorMessage}
            </div>
          )}
          {saveState === "saved" && !errorMessage && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              ✅ Pipeline stages saved
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {stages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            <p className="font-medium text-slate-700">
              No pipeline stages yet.
            </p>
            <p className="mt-1">
              Add stages like{" "}
              <span className="font-semibold">
                New, Contacted, Qualified, Proposal, Won
              </span>{" "}
              to match your process.
            </p>
          </div>
        )}

        {stages.map((stage, index) => (
          <div
            key={`${stage.position}-${stage.name}-${index}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Stage name
              </label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={stage.name}
                onChange={(e) => updateStage(index, { name: e.target.value })}
                placeholder="e.g. Qualified"
                disabled={!canEdit}
              />
            </div>

            <div className="flex flex-col items-end gap-1 text-[11px]">
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => moveStage(index, "up")}
                  disabled={!canEdit || index === 0}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStage(index, "down")}
                  disabled={!canEdit || index === stages.length - 1}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeStage(index)}
                disabled={!canEdit}
                className="mt-1 cursor-pointer text-[11px] text-slate-400 hover:text-rose-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
          onClick={addStage}
          disabled={!canEdit}
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          + Add Stage
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {saveState === "saving" ? "Saving…" : "Save Stages"}
        </button>

        {saveState === "idle" && stages.length > 0 && (
          <span className="text-xs text-slate-400">
            Don’t forget to save your changes.
          </span>
        )}
      </div>
    </div>
  );
}
