// src/app/(app)/leads/LeadsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { getPipelineStages } from "@/modules/crm/data/pipelineStages";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import type { PipelineStageDef } from "@/modules/crm/data/pipelineStages";
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";

interface LeadRow {
  id: string;
  stage: string;
  customValues: Record<string, any>;
}

export function LeadsClient() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  // 1) Load teamId from Supabase
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[Leads] No authenticated user", userError);
          if (!cancelled) {
            setTeamId(null);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[Leads] Failed to load profile", profileError);
        }

        let tId: string | null = profile?.team_id ?? null;

        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) {
            tId = metaTeam;
          }
        }

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[Leads] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Load leads/fields for that team
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workspaceLoaded) return;

      if (!teamId) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        setLoading(true);

      const [fieldDefs, stageDefs, leadsRes] = await Promise.all([
        getLeadFieldDefinitions(teamId),
        getPipelineStages(teamId),
        (async () => {

          // ✅ new – use GET with teamId query param
          const res = await fetch(
            `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`
          );

          if (!res.ok) {
            const text = await res.text();
            console.error(
              "[Leads] Failed to load leads",
              res.status,
              text.slice(0, 200)
            );
            throw new Error("Failed to load leads");
          }

          return (await res.json()) as any[];
        })(),
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
        console.error("[Leads] Failed to load leads", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoaded]);

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

  if (workspaceLoaded && !teamId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
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
          href="/leads/new"
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
        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[800px] overflow-y-auto overflow-x-auto rounded-xl">
            <table className="w-full border-collapse text-sm">
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

                    <td className="border-b border-slate-100 px-3 py-2 align-top">
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/leads/${lead.id}/messages`}
                          className="p-1 !text-emerald-600 hover:!text-emerald-700 cursor-pointer transition-colors"
                          title="Log outbound / inbound messages"
                        >
                          <PlusCircleIcon className="h-5 w-5" />
                        </Link>

                        <Link
                          href={`/leads/${lead.id}`}
                          className="p-1 !text-slate-600 hover:!text-slate-900 cursor-pointer transition-colors"
                          title="View details"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>

                        <Link
                          href={`/leads/${lead.id}/edit`}
                          className="p-1 !text-indigo-600 hover:!text-indigo-700 cursor-pointer transition-colors"
                          title="Edit lead"
                        >
                          <PencilSquareIcon className="h-5 w-5" />
                        </Link>

                        <Link
                          href={`/leads/${lead.id}/delete`}
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
