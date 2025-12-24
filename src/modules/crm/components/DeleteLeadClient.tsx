// src/app/leads/[id]/delete/DeleteLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";

interface LeadRow {
  id: string;
  team_id: string;
  stage: string;
  custom_values: Record<string, any> | null;
}

export function DeleteLeadClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------- load lead + field definitions --------
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
        const [defs, leadRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          supabase
            .from("leads")
            .select("id, team_id, stage, custom_values")
            .eq("id", id)
            .single<LeadRow>(),
        ]);

        if (cancelled) return;

        if (leadRes.error || !leadRes.data) {
          console.error(
            "[DeleteLead] failed to load lead",
            leadRes.error ?? "no data",
          );
          setError("We couldn’t load this lead. Please try again.");
          setLead(null);
          return;
        }

        if (leadRes.data.team_id !== teamId) {
          console.warn(
            "[DeleteLead] lead team mismatch",
            "lead.team_id=",
            leadRes.data.team_id,
            "workspace.teamId=",
            teamId,
          );
          setError("This lead doesn’t belong to your current workspace.");
          setLead(null);
          return;
        }

        setFields(defs ?? []);
        setLead(leadRes.data);
        setError(null);
      } catch (err) {
        console.error("[DeleteLead] unexpected load error", err);
        if (!cancelled) {
          setError("We couldn’t load this lead. Please try again.");
          setLead(null);
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

  // -------- delete --------
  async function handleConfirmDelete() {
    if (!teamId || !id) return;
    setDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("leads")
        .delete()
        .eq("id", id)
        .eq("team_id", teamId);

      if (deleteError) {
        console.error("[DeleteLead] failed to delete lead", deleteError);
        setError("Failed to delete lead. Please try again.");
        setDeleting(false);
        return;
      }

      router.push("/leads");
    } catch (err) {
      console.error("[DeleteLead] unexpected delete error", err);
      setError("Failed to delete lead. Please try again.");
      setDeleting(false);
    }
  }

  // -------- guards --------
  if (workspaceLoading || loading) {
    return <p className="text-sm text-slate-500">Loading lead…</p>;
  }

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        We couldn&apos;t determine your team from the workspace context. Please
        open this page from your workspace or contact support.
      </p>
    );
  }

  if (!lead) {
    return (
      <p className="text-sm text-slate-500">
        {error ?? "Lead not found."}
      </p>
    );
  }

  const customValues = lead.custom_values ?? {};

  // -------- UI --------
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl space-y-6">
        {/* Danger header */}
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-rose-100">
            {/* simple warning icon */}
            <span className="text-lg font-semibold text-rose-600">!</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-rose-900">
              Delete this lead?
            </h1>
            <p className="mt-1 text-sm text-rose-800">
              This action is permanent and cannot be undone. All data for this
              lead will be removed from the{" "}
              <span className="font-semibold">current workspace</span>.
            </p>
          </div>
        </div>

        {/* Lead summary card */}
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Lead preview
              </h2>
              <p className="text-xs text-slate-400">
                Review the lead details below before deleting.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Stage
              </span>
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {lead.stage || "—"}
              </span>
            </div>
          </div>

          {error && (
            <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>
          )}

          {/* All custom fields in a tidy grid */}
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((field) => {
              const value = customValues[field.key];

              const displayValue =
                value === undefined ||
                value === null ||
                value === ""
                  ? "—"
                  : String(value);

              return (
                <div
                  key={field.key}
                  className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {field.label}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-900 break-words">
                    {displayValue}
                  </p>
                </div>
              );
            })}

            {fields.length === 0 && (
              <p className="text-sm text-slate-500">
                This workspace has no custom fields configured for leads.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-70 cursor-pointer"
            >
              {deleting ? "Deleting…" : "Delete Lead"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/leads/${id}`)}
              className="text-sm font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
