// src/app/leads/[id]/LeadDetailClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import type { LeadFieldDefinition } from "@/types/lead";

interface LeadData {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
  created_at: string;
}

export function LeadDetailClient() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team");
  const router = useRouter();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);

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
        console.error("Failed to load lead detail", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

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

  const created = new Date(lead.created_at);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Lead details
          </h1>
          <p className="text-sm text-slate-500">
            Created on {created.toLocaleDateString()} at{" "}
            {created.toLocaleTimeString()}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/leads/${id}/edit?team=${encodeURIComponent(teamId)}`
              )
            }
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/leads/${id}/delete?team=${encodeURIComponent(teamId)}`
              )
            }
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">
          Pipeline Stage
        </h2>
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
          {lead.stage || "—"}
        </span>
      </div>

      {/* Custom fields */}
      <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          Lead Fields
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((field) => {
            const value = lead.custom_values?.[field.key];

            if (field.type === "link" && typeof value === "string" && value) {
              const raw = value.trim();
              const href = /^https?:\/\//i.test(raw)
                ? raw
                : `https://${raw}`;

              return (
                <div key={field.key} className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {field.label}
                  </p>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    <span className="truncate">{raw}</span>
                  </a>
                </div>
              );
            }

            return (
              <div key={field.key} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {field.label}
                </p>
                <p className="text-sm text-slate-800">
                  {value !== null && value !== undefined && value !== ""
                    ? String(value)
                    : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
