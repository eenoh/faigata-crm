// src/app/leads/[id]/edit/EditLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import { getPipelineStages } from "@/data/pipelineStages";
import type { LeadFieldDefinition } from "@/types/lead";
import type { PipelineStageDef } from "@/data/pipelineStages";

interface LeadData {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
}

export function EditLeadClient() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team");
  const router = useRouter();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [stage, setStage] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!teamId || !id) {
        setLoading(false);
        return;
      }

      try {
        const [defs, stageDefs, leadRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
          fetch(
            `/api/leads?teamId=${encodeURIComponent(
              teamId
            )}&id=${encodeURIComponent(id)}`
          ).then((r) => r.json() as Promise<LeadData>),
        ]);

        if (cancelled) return;

        setFields(defs);
        setStages(stageDefs);
        setStage(leadRes.stage || (stageDefs[0]?.name ?? ""));
        setCustomValues(leadRes.custom_values ?? {});
      } catch (err) {
        console.error("Failed to load lead for edit", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

  function handleCustomChange(key: string, value: any) {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !id) return;

    setSaving(true);
    try {
      await fetch(
        `/api/leads?teamId=${encodeURIComponent(
          teamId
        )}&id=${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage,
            customValues,
          }),
        }
      );

      router.push(`/leads/${id}?team=${encodeURIComponent(teamId)}`);
    } catch (err) {
      console.error("Failed to update lead", err);
    } finally {
      setSaving(false);
    }
  }

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        Missing <code>?team=TEAM_ID</code> in URL.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading lead…</p>;
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Edit Lead</h1>
          <p className="text-sm text-slate-500">
            Update the stage and fields for this lead.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* Stage */}
        <div>
          <label className="block mb-1 text-sm font-medium text-slate-700">
            Pipeline Stage
          </label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            required
          >
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
              Lead Fields
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {fields.map((field) => {
                const value = customValues[field.key] ?? "";

                if (field.type === "text" || field.type === "link") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                        {field.label}
                      </label>
                      <input
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={value}
                        onChange={(e) =>
                          handleCustomChange(field.key, e.target.value)
                        }
                      />
                    </div>
                  );
                }

                if (field.type === "number") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                        {field.label}
                      </label>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={value}
                        onChange={(e) =>
                          handleCustomChange(field.key, Number(e.target.value))
                        }
                      />
                    </div>
                  );
                }

                if (field.type === "boolean") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                        {field.label}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={Boolean(value)}
                          onChange={(e) =>
                            handleCustomChange(field.key, e.target.checked)
                          }
                        />
                        <span>Yes</span>
                      </label>
                    </div>
                  );
                }

                if (field.type === "select") {
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                        {field.label}
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={value}
                        onChange={(e) =>
                          handleCustomChange(field.key, e.target.value)
                        }
                      >
                        <option value="">Select…</option>
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(`/leads/${id}?team=${encodeURIComponent(teamId)}`)
            }
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
    </div>
  );
}
