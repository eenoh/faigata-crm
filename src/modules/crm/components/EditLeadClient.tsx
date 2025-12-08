// src/app/leads/[id]/edit/EditLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { getPipelineStages } from "@/modules/crm/data/pipelineStages";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import type { PipelineStageDef } from "@/modules/crm/data/pipelineStages";
import { useWorkspace } from "@/context/WorkspaceContext";

interface LeadRow {
  id: string;
  team_id: string;
  stage: string;
  custom_values: Record<string, any> | null;
  notes: string | null; 
}

export function EditLeadClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [stage, setStage] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------- load lead + config --------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) return;

      if (!teamId || !id) {
        setLoading(false);
        setError("We couldn’t determine your team or lead id.");
        return;
      }

      try {
        // 1) Lead field definitions + pipeline stages for this team
        const [defs, stageDefs] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
        ]);

        // 2) The lead itself (by id)
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id, team_id, stage, custom_values, notes")
          .eq("id", id)
          .single<LeadRow>();

        if (cancelled) return;

        if (leadError || !lead) {
          console.error("[EditLead] failed to load lead", leadError);
          setError("We couldn’t load this lead. Please try again.");
          return;
        }

        // Optional safety: ensure the lead belongs to this workspace/team
        if (lead.team_id !== teamId) {
          console.warn(
            "[EditLead] lead team mismatch",
            "lead.team_id=",
            lead.team_id,
            "workspace.teamId=",
            teamId
          );
          setError(
            "This lead doesn’t belong to your current workspace/team.",
          );
          return;
        }

        setFields(defs ?? []);
        setStages(stageDefs ?? []);
        setStage(lead.stage || (stageDefs[0]?.name ?? ""));
        setCustomValues(lead.custom_values ?? {});
        setNotes(lead.notes ?? "");
        setError(null);
      } catch (err) {
        console.error("[EditLead] unexpected load error", err);
        if (!cancelled) {
          setError("We couldn’t load this lead. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, teamId, workspaceLoading]);

  function handleCustomChange(key: string, value: any) {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  }

  // -------- save --------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !id) return;

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          stage,
          custom_values: customValues,
          notes: notes.trim() === "" ? null : notes.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("team_id", teamId);

      if (updateError) {
        console.error("[EditLead] failed to update lead", updateError);
        setError("Saving changes failed. Please try again.");
        return;
      }

      router.push(`/leads/${id}`);
    } catch (err) {
      console.error("[EditLead] unexpected save error", err);
      setError("Saving changes failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // -------- guards --------
  if (workspaceLoading || loading) {
    return <p className="text-sm text-slate-500">Loading lead…</p>;
  }

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        We couldn&apos;t determine your team from the workspace context.
        Please open this page from your workspace or contact support.
      </p>
    );
  }

  // -------- UI --------
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
          {error && (
            <p className="text-xs font-medium text-rose-600">{error}</p>
          )}

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

          {/* Custom fields for this team */}
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
                            handleCustomChange(
                              field.key,
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                            )
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

          {/* Notes */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Notes
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              Internal notes about this lead. Only visible to your team.
            </p>
            <textarea
              className="min-h-[120px] w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add context, objections, personal details, or anything else that helps your team close this deal."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 cursor-pointer"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/leads/${id}`)}
              className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
