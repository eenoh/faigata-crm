// src/modules/crm/components/LeadScoringSettingsClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import { useTheme } from "next-themes";

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

type SaveResponse = {
  ok?: boolean;
  total?: number;
  recomputed?: number;
  failed?: number;
  warning?: string;
  error?: string;
};

function SkeletonBlock({
  className = "",
  isDark,
}: {
  className?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={[
        "animate-pulse rounded-lg",
        isDark ? "bg-slate-800/70" : "bg-slate-100",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

function LoadingSkeleton({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const soft = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-white";
  const soft2 = isDark
    ? "border-slate-800 bg-slate-900/40"
    : "border-slate-100 bg-slate-50";

  return (
    <div className="max-w-5xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <SkeletonBlock isDark={isDark} className="h-7 w-40" />
        <SkeletonBlock
          isDark={isDark}
          className="mt-2 h-4 w-[34rem] max-w-full"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)]">
        {/* LEFT skeleton */}
        <div
          className={`space-y-3 rounded-2xl border px-4 py-4 shadow-sm ${card}`}
        >
          <SkeletonBlock isDark={isDark} className="h-4 w-48" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`rounded-xl border px-3 py-3 ${soft2}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock
                      isDark={isDark}
                      className="h-4 w-56 max-w-full"
                    />
                    <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-28" />
                  </div>
                  <SkeletonBlock isDark={isDark} className="h-9 w-24" />
                </div>

                <div className="mt-3 space-y-2">
                  <SkeletonBlock isDark={isDark} className="h-3 w-24" />
                  <div className="space-y-2">
                    {[0, 1].map((j) => (
                      <div
                        key={j}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${soft}`}
                      >
                        <SkeletonBlock isDark={isDark} className="h-3 w-28" />
                        <SkeletonBlock isDark={isDark} className="h-8 w-24" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT skeleton */}
        <div
          className={`space-y-3 rounded-2xl border px-4 py-4 shadow-sm ${card}`}
        >
          <SkeletonBlock isDark={isDark} className="h-4 w-40" />
          <SkeletonBlock isDark={isDark} className="h-3 w-[22rem] max-w-full" />

          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <SkeletonBlock isDark={isDark} className="h-3 w-32" />
              <div className="flex items-center gap-2">
                <SkeletonBlock isDark={isDark} className="h-9 w-24" />
                <SkeletonBlock isDark={isDark} className="h-3 w-48" />
              </div>
            </div>

            <div className="space-y-2">
              <SkeletonBlock isDark={isDark} className="h-3 w-36" />
              <div className="flex items-center gap-2">
                <SkeletonBlock isDark={isDark} className="h-9 w-24" />
                <SkeletonBlock isDark={isDark} className="h-3 w-56" />
              </div>
            </div>
          </div>

          <div
            className={`mt-3 rounded-xl px-3 py-3 ${isDark ? "bg-slate-900/40" : "bg-slate-50"}`}
          >
            <SkeletonBlock isDark={isDark} className="h-3 w-10" />
            <SkeletonBlock
              isDark={isDark}
              className="mt-2 h-3 w-[18rem] max-w-full"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <SkeletonBlock isDark={isDark} className="h-10 w-44" />
      </div>
    </div>
  );
}

export function LeadScoringSettingsClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  // theme tokens
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const soft = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-100 bg-slate-50";
  const pageTitle = isDark ? "text-slate-100" : "text-slate-900";
  const pageSub = isDark ? "text-slate-400" : "text-slate-600";
  const label = isDark ? "text-slate-200" : "text-slate-900";
  const muted = isDark ? "text-slate-400" : "text-slate-500";

  const inputBase =
    "rounded-lg border px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500";
  const inputTheme = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100 placeholder:text-slate-600"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400";

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [thresholds, setThresholds] = useState<ScoreThresholds>({
    low: 40,
    high: 70,
  });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // optional: show recompute stats after saving
  const [saveStats, setSaveStats] = useState<{
    total?: number;
    recomputed?: number;
    failed?: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
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

            if (Array.isArray(json.rules)) loadedRules = json.rules;

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
          const text = await res.text().catch(() => "");
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
            for (const opt of f.options as string[]) {
              optionWeights[opt] = existingOptions[opt] ?? 0;
            }
            base.optionWeights = optionWeights;
          }

          return base;
        });

        setFields(defs);
        setRules(normalizedRules);
        setThresholds(loadedThresholds ?? { low: 40, high: 70 });
        setError(null);
        setSaveStats(null);
      } catch (err) {
        console.error("[LeadScoring] Failed to load", err);
        if (!cancelled) setError("Failed to load lead scoring settings.");
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
    setSaveStats(null);
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
        return { ...r, optionWeights: { ...current, [option]: weight } };
      }),
    );
    setSaveState("idle");
    setSaveStats(null);
    setError(null);
  }

  function updateThreshold(key: keyof ScoreThresholds, value: number | null) {
    setThresholds((prev) => ({ ...prev, [key]: value ?? 0 }));
    setSaveState("idle");
    setSaveStats(null);
    setError(null);
  }

  async function handleSave() {
    if (!teamId) {
      setError("No team found in workspace.");
      return;
    }

    setSaveState("saving");
    setSaveStats(null);
    setError(null);

    try {
      // IMPORTANT:
      // Backend MUST recompute all leads after saving config.
      // (We keep recomputeAll: true as an explicit hint.)
      const res = await fetch("/api/crm/lead-scoring-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          action: "save",
          rules,
          thresholds,
          recomputeAll: true,
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

      if (ct.includes("application/json")) {
        const payload = (await res
          .json()
          .catch(() => null)) as SaveResponse | null;

        if (payload?.warning) setError(payload.warning);

        if (
          payload &&
          (payload.total !== undefined ||
            payload.recomputed !== undefined ||
            payload.failed !== undefined)
        ) {
          setSaveStats({
            total: payload.total,
            recomputed: payload.recomputed,
            failed: payload.failed,
          });
        }
      } else {
        // not fatal — old endpoint might return non-json
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

  // returns AFTER hooks ✅
  if (!teamId && !workspaceLoading) {
    return (
      <div
        className={[
          "max-w-3xl rounded-2xl border px-4 py-3 text-sm shadow-sm",
          isDark
            ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
            : "border-rose-100 bg-rose-50 text-rose-700",
        ].join(" ")}
      >
        <p className="font-medium">No team available</p>
        <p className="mt-1">
          We couldn’t determine your team. Please open this page from your
          workspace or contact support.
        </p>
      </div>
    );
  }

  if (loading || workspaceLoading) {
    return <LoadingSkeleton isDark={isDark} />;
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold md:text-2xl ${pageTitle}`}>
          Lead Scoring
        </h1>
        <p className={`mt-1 text-sm ${pageSub}`}>
          Assign weights to your lead fields so Lumo can calculate a score
          (0–100) for every lead. Saving will also recalculate scores for all
          existing leads.
        </p>
      </div>

      {(error || saveState === "saved" || saveState === "error") && (
        <div className="space-y-2">
          {error && (
            <div
              className={[
                "rounded-xl border px-4 py-2 text-xs shadow-sm",
                isDark
                  ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
                  : "border-rose-100 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              {error}
            </div>
          )}

          {saveState === "saved" && (
            <div className="space-y-2">
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
                  isDark
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                    : "border-emerald-100 bg-emerald-50 text-emerald-700",
                ].join(" ")}
              >
                ✅ Scoring rules saved
                {saveStats?.recomputed != null
                  ? ` — updated ${saveStats.recomputed} lead${
                      saveStats.recomputed === 1 ? "" : "s"
                    }`
                  : ""}
              </div>

              {saveStats?.failed ? (
                <div
                  className={[
                    "rounded-xl border px-4 py-2 text-xs shadow-sm",
                    isDark
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
                      : "border-amber-100 bg-amber-50 text-amber-700",
                  ].join(" ")}
                >
                  Heads up: {saveStats.failed} lead
                  {saveStats.failed === 1 ? "" : "s"} failed to recompute. Those
                  leads will update again on the next activity or stage change.
                </div>
              ) : null}
            </div>
          )}

          {saveState === "error" && !error && (
            <div
              className={[
                "rounded-xl border px-4 py-2 text-xs shadow-sm",
                isDark
                  ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
                  : "border-rose-100 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              Saving failed. Please try again.
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)]">
        {/* LEFT */}
        <div
          className={`space-y-3 rounded-2xl border px-4 py-4 shadow-sm ${card}`}
        >
          {fields.length === 0 ? (
            <p className={`text-sm ${muted}`}>
              You don&apos;t have any lead fields yet. Create them first in{" "}
              <span
                className={
                  isDark
                    ? "font-semibold text-slate-200"
                    : "font-semibold text-slate-700"
                }
              >
                Settings → Lead Fields
              </span>
              .
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
                    className={`rounded-xl border px-3 py-2 ${soft}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p
                          className={`text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}
                        >
                          {field.label}
                        </p>
                        <p className={`text-[11px] ${muted}`}>
                          Type: {field.type}
                        </p>
                      </div>

                      {!isSelect && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={-100}
                            max={100}
                            className={`w-20 text-right text-sm ${inputBase} ${inputTheme}`}
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
                          <span className={`text-xs ${muted}`}>pts</span>
                        </div>
                      )}
                    </div>

                    {isSelect && (
                      <div className="mt-2 space-y-2">
                        <p
                          className={`text-[11px] font-medium uppercase tracking-wide ${muted}`}
                        >
                          Option weights
                        </p>

                        <div className="space-y-1">
                          {(field.options as string[]).map((opt: string) => {
                            const current = rule.optionWeights?.[opt] ?? 0;

                            return (
                              <div
                                key={opt}
                                className={[
                                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5",
                                  isDark
                                    ? "border-slate-800 bg-slate-950"
                                    : "border-slate-100 bg-white",
                                ].join(" ")}
                              >
                                <span
                                  className={
                                    isDark
                                      ? "text-xs text-slate-200"
                                      : "text-xs text-slate-700"
                                  }
                                >
                                  {opt}
                                </span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={-100}
                                    max={100}
                                    className={`w-20 text-right text-xs ${inputBase} ${inputTheme}`}
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
                                  <span className={`text-[11px] ${muted}`}>
                                    pts
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <p
                          className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
                        >
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

        {/* RIGHT */}
        <div
          className={`space-y-3 rounded-2xl border px-4 py-4 shadow-sm ${card}`}
        >
          <h2 className={`text-sm font-semibold ${label}`}>Score thresholds</h2>

          <p className={`mt-1 text-xs ${pageSub}`}>
            Control when scores are treated as{" "}
            <span className="font-semibold text-rose-600">low</span>,{" "}
            <span className="font-semibold text-amber-600">medium</span>, or{" "}
            <span className="font-semibold text-emerald-600">high</span>.
          </p>

          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <label
                className={`text-xs font-medium uppercase tracking-wide ${muted}`}
              >
                Low / red cutoff
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={`w-24 text-right text-sm ${inputBase} ${inputTheme}`}
                  value={thresholds.low}
                  onChange={(e) =>
                    updateThreshold(
                      "low",
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                />
                <span className={`text-xs ${pageSub}`}>
                  Scores below this are considered{" "}
                  <span className="font-semibold text-rose-600">low</span>.
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label
                className={`text-xs font-medium uppercase tracking-wide ${muted}`}
              >
                High / green cutoff
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={`w-24 text-right text-sm ${inputBase} ${inputTheme}`}
                  value={thresholds.high}
                  onChange={(e) =>
                    updateThreshold(
                      "high",
                      e.target.value === "" ? 0 : Number(e.target.value),
                    )
                  }
                />
                <span className={`text-xs ${pageSub}`}>
                  Scores at or above this are{" "}
                  <span className="font-semibold text-emerald-600">high</span>.
                  Everything in between is{" "}
                  <span className="font-semibold text-amber-600">medium</span>.
                </span>
              </div>
            </div>
          </div>

          <div
            className={`mt-3 rounded-xl px-3 py-2 ${isDark ? "bg-slate-900/40" : "bg-slate-50"}`}
          >
            <p
              className={
                isDark
                  ? "text-[11px] font-medium text-slate-200"
                  : "text-[11px] font-medium text-slate-700"
              }
            >
              Tip
            </p>
            <p className={`mt-1 text-[11px] ${pageSub}`}>
              Leave a small buffer below 100 – automations (reply detection,
              sales cycle, etc.) can add extra points on top of your manual
              scoring.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === "saving"}
          className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saveState === "saving"
            ? "Saving & recalculating…"
            : "Save Scoring Rules"}
        </button>
      </div>
    </div>
  );
}
