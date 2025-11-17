// src/app/leads/[id]/delete/DeleteLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import type { LeadFieldDefinition } from "@/types/lead";

interface LeadData {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
}

export function DeleteLeadClient() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team");
  const router = useRouter();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!teamId || !id) {
        setLoading(false);
        return;
      }

      try {
        const [defs, leadRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          fetch(
            `/api/leads?teamId=${encodeURIComponent(
              teamId
            )}&id=${encodeURIComponent(id)}`
          ).then((r) => r.json() as Promise<LeadData>),
        ]);

        if (cancelled) return;

        setFields(defs);
        setLead(leadRes);
      } catch (err) {
        console.error("Failed to load lead for deletion", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

  async function handleConfirmDelete() {
    if (!teamId || !id) return;
    setDeleting(true);

    try {
      await fetch(
        `/api/leads?teamId=${encodeURIComponent(
          teamId
        )}&id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      router.push(`/leads?team=${encodeURIComponent(teamId)}`);
    } catch (err) {
      console.error("Failed to delete lead", err);
      setDeleting(false);
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

  if (!lead) {
    return <p className="text-sm text-slate-500">Lead not found.</p>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
        <h1 className="text-lg font-semibold text-rose-800">
          Delete this lead?
        </h1>
        <p className="mt-1 text-sm text-rose-700">
          This action cannot be undone. The lead and its data will be
          permanently removed from this workspace.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Lead preview
        </h2>
        <div className="space-y-1 text-sm text-slate-700">
          <p>
            <span className="font-medium">Stage:</span>{" "}
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              {lead.stage || "—"}
            </span>
          </p>
          {fields.slice(0, 3).map((field) => (
            <p key={field.key}>
              <span className="font-medium">{field.label}:</span>{" "}
              {lead.custom_values?.[field.key]
                ? String(lead.custom_values[field.key])
                : "—"}
            </p>
          ))}
          {fields.length > 3 && (
            <p className="text-xs text-slate-400">
              + {fields.length - 3} more field
              {fields.length - 3 > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={handleConfirmDelete}
          disabled={deleting}
          className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-70"
        >
          {deleting ? "Deleting…" : "Yes, delete lead"}
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
    </div>
  );
}
