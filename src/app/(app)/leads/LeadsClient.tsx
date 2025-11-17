// src/app/(app)/leads/LeadsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import { getPipelineStages } from "@/data/pipelineStages";
import type { LeadFieldDefinition } from "@/types/lead";
import type { PipelineStageDef } from "@/data/pipelineStages";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface LeadRow {
  id: string;
  stage: string;
  customValues: Record<string, any>;
}

export function LeadsClient() {
  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const teamId = searchParams.get("team"); // UUID from onboarding
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!teamId) {
        console.warn("No teamId in URL, cannot load leads/fields");
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const [fieldDefs, stageDefs, leadsRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
          fetch(`/api/leads?teamId=${encodeURIComponent(teamId)}`).then(
            (r) => r.json() as Promise<any[]>
          ),
        ]);

        if (cancelled) return;

        setFields(fieldDefs);
        setStages(stageDefs);
        setLeads(
          (leadsRes ?? []).map((l) => ({
            id: l.id,
            stage: l.stage,
            customValues: l.custom_values ?? {},
          }))
        );
      } catch (err) {
        console.error("Failed to load leads", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const columns = useMemo(
    () => [
      ...fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        isStage: false,
      })),
      { key: "__stage", label: "Stage", type: null, isStage: true as const },
    ],
    [fields]
  );

  // Filter leads based on ?q= in URL
  const filteredLeads = useMemo(() => {
    if (!query) return leads;

    return leads.filter((lead) => {
      if (lead.stage?.toLowerCase().includes(query)) return true;

      return Object.values(lead.customValues ?? {}).some((v) => {
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(query);
      });
    });
  }, [leads, query]);

  const totalCount = leads.length;
  const visibleCount = filteredLeads.length;

  return (
    // Fill the available height; prevent this section from scrolling
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Sticky page header (title + button) inside this section */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#F1F5F9] pb-2 pt-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">
            {query
              ? `Showing ${visibleCount} of ${totalCount} leads for your current team.`
              : `Showing ${totalCount} leads for your current team.`}
          </p>
        </div>

        <Link
          href={
            teamId
              ? `/leads/new?team=${encodeURIComponent(teamId)}`
              : "/leads/new"
          }
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-indigo-700"
        >
          + Add Leads
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading leads…</p>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          <p>No leads yet.</p>
          <p>
            Click <span className="font-semibold">+ Add lead</span> to create
            your first one.
          </p>
        </div>
      ) : visibleCount === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <p className="font-semibold text-slate-700">
            No leads match “{query}”.
          </p>
          <p className="mt-1">
            Try searching for a different name, field value, or stage.
          </p>
        </div>
      ) : (
        // Scrollable table area: ONLY the rows scroll
        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* max-h ≈ height of ~15 rows; body scrolls inside here */}
          <div className="max-h-[800px] overflow-y-auto overflow-x-auto rounded-xl">
            <table className="w-full border-collapse text-sm">
              {/* Sticky table header inside scroll container */}
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="text-left">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    {columns.map((col) => {
                      if (col.isStage) {
                        return (
                          <td
                            key={col.key}
                            className="border-b border-slate-100 px-3 py-2 align-top"
                          >
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                              {lead.stage || "—"}
                            </span>
                          </td>
                        );
                      }

                      const value = lead.customValues[col.key];

                      if (
                        col.type === "link" &&
                        typeof value === "string" &&
                        value.trim() !== ""
                      ) {
                        const raw = value.trim();
                        const href = /^https?:\/\//i.test(raw)
                          ? raw
                          : `https://${raw}`;

                        return (
                          <td
                            key={col.key}
                            className="border-b border-slate-100 px-3 py-2 align-top text-slate-800"
                          >
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-[200px] items-center gap-1 truncate text-indigo-600 hover:text-indigo-700 hover:underline"
                            >
                              <span className="truncate">{raw}</span>
                            </a>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className="border-b border-slate-100 px-3 py-2 align-top text-slate-800"
                        >
                          {value !== null && value !== undefined
                            ? String(value)
                            : "—"}
                        </td>
                      );
                    })}

                    {/* Actions column */}
                    <td className="border-b border-slate-100 px-3 py-2 align-top">
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/leads/${lead.id}?team=${encodeURIComponent(
                            teamId!
                          )}`}
                          className="p-1 !text-slate-600 hover:!text-slate-900 cursor-pointer transition-colors"
                          title="View details"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>

                        <Link
                          href={`/leads/${lead.id}/edit?team=${encodeURIComponent(
                            teamId!
                          )}`}
                          className="p-1 !text-indigo-600 hover:!text-indigo-700 cursor-pointer transition-colors"
                          title="Edit lead"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </Link>

                        <Link
                          href={`/leads/${lead.id}/delete?team=${encodeURIComponent(
                            teamId!
                          )}`}
                          className="p-1 !text-rose-500 hover:!text-rose-600 cursor-pointer transition-colors"
                          title="Delete lead"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


