// src/modules/crm/components/LeadScoringSettingsClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

type ScoringRule = {
  fieldKey: string;
  label: string;
  // used for text/number/boolean/link fields
  weight: number;
  // used for select fields – per option weight in points
  optionWeights?: Record<string, number>;
};

type ScoreThresholds = {
  // scores < low => low (red)
  low: number;
  // scores >= high => high (green), in-between is medium (yellow)
  high: number;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-2 h-4 w-[34rem] max-w-full animate-pulse rounded-lg bg-slate-100" />
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)]">
        {/* LEFT skeleton */}
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
          <div className="h-4 w-48 animate-pulse rounded-lg bg-slate-100" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-56 max-w-full animate-pulse rounded-lg bg-slate-200" />
                    <div className="mt-2 h-3 w-28 animate-pulse rounded-lg bg-slate-200" />
                  </div>
                  <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
                </div>

                <div className="mt-3 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded-lg bg-slate-200" />
                  <div className="space-y-2">
                    {[0, 1].map((j) => (
                      <div
                        key={j}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2"
                      >
                        <div className="h-3 w-28 animate-pulse rounded-lg bg-slate-100" />
                        <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT skeleton */}
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
          <div className="h-4 w-40 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-3 w-[22rem] max-w-full animate-pulse rounded-lg bg-slate-100" />

          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded-lg bg-slate-100" />
              <div className="flex items-center gap-2">
                <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-3 w-48 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-3 w-36 animate-pulse rounded-lg bg-slate-100" />
              <div className="flex items-center gap-2">
                <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-3 w-56 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
            <div className="h-3 w-10 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-2 h-3 w-[18rem] max-w-full animate-pulse rounded-lg bg-slate-200" />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <div className="h-10 w-44 animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

export function LeadScoringSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [thresholds, setThresholds] = useState<ScoreThresholds>({
    low: 40,
    high: 70,
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // wait for workspace context to resolve
      if (workspaceLoading) return;

      if (!teamId) {
        setLoading(false);
        setError("No team found. Open this page from a workspace.");
        return;
      }

      try {
        setLoading(true);

        // 1) load field definitions
        const defs = await getLeadFieldDefinitions(teamId);

        // 2) load existing scoring config (if any)
        const res = await fetch("/api/crm/lead-scoring-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, action: "get" }),
        });

        let loadedRules: ScoringRule[] = [];
        let loadedThresholds: ScoreThresholds | null = null;

        if (res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const json = (await res.json()) as {
              rules?: ScoringRule[];
              thresholds?: Partial<ScoreThresholds>;
            };

            if (Array.isArray(json.rules)) {
              loadedRules = json.rules;
            }

            if (json.thresholds) {
              const low = Number(json.thresholds.low);
              const high = Number(json.thresholds.high);
              if (!Number.isNaN(low) && !Number.isNaN(high)) {
                loadedThresholds = { low, high };
              }
            }
          } else {
            console.warn("[LeadScoring] config API returned non-JSON:", ct);
          }
        } else {
          const text = await res.text();
          console.error(
            "[LeadScoring] load config failed",
            res.status,
            text.slice(0, 400),
          );
        }

        if (cancelled) return;

        // 3) normalize rules against current field list
        const normalizedRules: ScoringRule[] = defs.map((f) => {
          const existing = loadedRules.find((r) => r.fieldKey === f.key);

          const base: ScoringRule = {
            fieldKey: f.key,
            label: f.label,
            weight: existing?.weight ?? 0,
          };

          const hasSelectOptions =
            f.type === "select" &&
            Array.isArray(f.options) &&
            f.options.length > 0;

          if (hasSelectOptions) {
            const existingOptions = existing?.optionWeights ?? {};
            const optionWeights: Record<string, number> = {};

            // Cast the options to string[] for strict TS setups where options might be any/unknown.
            for (const opt of f.options as string[]) {
              optionWeights[opt] = existingOptions[opt] ?? 0;
            }

            base.optionWeights = optionWeights;
          }

          return base;
        });

        setFields(defs);
        setRules(normalizedRules);

        // thresholds: use loaded or defaults
        setThresholds(
          loadedThresholds ?? {
            low: 40,
            high: 70,
          },
        );

        setError(null);
      } catch (err) {
        console.error("[LeadScoring] Failed to load", err);
        if (!cancelled) {
          setError("Failed to load lead scoring settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading]);

  function updateFieldWeight(fieldKey: string, weight: number) {
    setRules((prev) =>
      prev.map((r) => (r.fieldKey === fieldKey ? { ...r, weight } : r)),
    );
    setSaveState("idle");
    setError(null);
  }

  function updateOptionWeight(
    fieldKey: string,
    option: string,
    weight: number,
  ) {
    setRules((prev) =>
      prev.map((r) => {
        if (r.fieldKey !== fieldKey) return r;
        const current = r.optionWeights ?? {};
        return {
          ...r,
          optionWeights: {
            ...current,
            [option]: weight,
          },
        };
      }),
    );
    setSaveState("idle");
    setError(null);
  }

  function updateThreshold(key: keyof ScoreThresholds, value: number | null) {
    setThresholds((prev) => ({
      ...prev,
      [key]: value ?? 0,
    }));
    setSaveState("idle");
    setError(null);
  }

  async function handleSave() {
    if (!teamId) {
      setError("No team found in workspace.");
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      const res = await fetch("/api/crm/lead-scoring-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          action: "save",
          rules,
          thresholds,
        }),
      });

      const ct = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(
          "[LeadScoring] Failed to save rules",
          res.status,
          ct,
          text.slice(0, 400),
        );
        setSaveState("error");
        setError("Saving failed. Please try again.");
        return;
      }

      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        console.warn(
          "[LeadScoring] save API returned non-JSON",
          res.status,
          ct,
          text.slice(0, 200),
        );
      }

      setSaveState("saved");
    } catch (err) {
      console.error("[LeadScoring] Failed to save rules", err);
      setSaveState("error");
      setError("Saving failed. Please try again.");
    }
  }

  if (!teamId && !workspaceLoading) {
    return (
      <div className="max-w-3xl rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from your
          workspace or contact support.
        </p>
      </div>
    );
  }

  // NEW: richer, fitting loading state (skeleton) while workspace and config are loading
  if (loading || workspaceLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
          Lead Scoring
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign weights to your lead fields so FaigataCRM can calculate a score
          (0–100) for every lead.
        </p>
      </div>

      {(error || saveState === "saved") && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          {saveState === "saved" && !error && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              ✅ Scoring rules saved
            </div>
          )}
        </div>
      )}

      {/* main grid: left = field weights, right = thresholds */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)]">
        {/* LEFT: field rules */}
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">
              You don&apos;t have any lead fields yet. Create them first in{" "}
              <span className="font-semibold">Settings → Lead Fields</span>.
            </p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const field = fields.find((f) => f.key === rule.fieldKey);
                if (!field) return null;

                const isSelect =
                  field.type === "select" &&
                  Array.isArray(field.options) &&
                  field.options.length > 0;

                return (
                  <div
                    key={rule.fieldKey}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {field.label}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Type: {field.type}
                        </p>
                      </div>

                      {!isSelect && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={-100}
                            max={100}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={rule.weight}
                            onChange={(e) =>
                              updateFieldWeight(
                                rule.fieldKey,
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value),
                              )
                            }
                          />
                          <span className="text-xs text-slate-500">pts</span>
                        </div>
                      )}
                    </div>

                    {isSelect && (
                      <div className="mt-2 space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Option weights
                        </p>
                        <div className="space-y-1">
                          {(field.options as string[]).map((opt: string) => {
                            const current = rule.optionWeights?.[opt] ?? 0;

                            return (
                              <div
                                key={opt}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-1.5"
                              >
                                <span className="text-xs text-slate-700">
                                  {opt}
                                </span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={-100}
                                    max={100}
                                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={current}
                                    onChange={(e) =>
                                      updateOptionWeight(
                                        rule.fieldKey,
                                        opt,
                                        e.target.value === ""
                                          ? 0
                                          : Number(e.target.value),
                                      )
                                    }
                                  />
                                  <span className="text-[11px] text-slate-500">
                                    pts
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Each option contributes its own points when selected.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: thresholds card */}
        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Score thresholds
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Control when scores are treated as{" "}
            <span className="font-semibold text-rose-600">low</span>,{" "}
            <span className="font-semibold text-amber-600">medium</span>, or{" "}
            <span className="font-semibold text-emerald-600">high</span>.
          </p>

          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Low / red cutoff
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={thresholds.low}
                  onChange={(e) =>
                    updateThreshold(
                      "low",
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                />
                <span className="text-xs text-slate-500">
                  Scores below this are considered{" "}
                  <span className="font-semibold text-rose-600">low</span>.
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                High / green cutoff
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={thresholds.high}
                  onChange={(e) =>
                    updateThreshold(
                      "high",
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                />
                <span className="text-xs text-slate-500">
                  Scores at or above this are{" "}
                  <span className="font-semibold text-emerald-600">high</span>.
                  Everything in between is{" "}
                  <span className="font-semibold text-amber-600">medium</span>.
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <p className="font-medium text-slate-700">Tip</p>
            <p className="mt-1">
              Leave a small buffer below 100 – our own automations (reply
              detection, sales cycle, etc.) can add extra points on top of your
              manual scoring.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
        >
          {saveState === "saving" ? "Saving…" : "Save Scoring Rules"}
        </button>
      </div>
    </div>
  );
}
