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

type ScoreThresholds = {
  low: number;
  high: number;
};

interface LeadRow {
  id: string;
  stage: string;
  customValues: Record<string, any>;
  score?: number | null;

  // ✅ per-lead RBAC fields
  prospector_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
}

/* -------------------- loading state -------------------- */

function LeadsLoadingState({ colCount = 7 }: { colCount?: number }) {
  const rows = Array.from({ length: 10 });

  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="max-h-[800px] overflow-hidden rounded-xl">
        <div className="border-b border-slate-200 bg-slate-100 px-3 py-2">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: Math.max(0, colCount - 1) }).map((_, i) => (
              <div
                key={i}
                className="h-4 w-24 rounded bg-slate-200/80 animate-pulse"
              />
            ))}
            <div className="ml-auto h-4 w-16 rounded bg-slate-200/80 animate-pulse" />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((_, rIdx) => (
            <div key={rIdx} className="px-3 py-3">
              <div
                className="grid items-center gap-3"
                style={{
                  gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                }}
              >
                <div>
                  <div className="h-5 w-10 rounded-full bg-slate-200/80 animate-pulse" />
                </div>

                {Array.from({ length: Math.max(0, colCount - 3) }).map(
                  (_, cIdx) => (
                    <div
                      key={cIdx}
                      className="h-4 w-full max-w-[220px] rounded bg-slate-200/70 animate-pulse"
                    />
                  )
                )}

                <div className="justify-self-start">
                  <div className="h-6 w-20 rounded-full bg-slate-200/80 animate-pulse" />
                </div>

                <div className="justify-self-end">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-6 w-6 rounded bg-slate-200/80 animate-pulse"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 bg-white px-3 py-2">
          <div className="h-3 w-40 rounded bg-slate-200/60 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/* -------------------- component -------------------- */

export function LeadsClient() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [thresholds, setThresholds] = useState<ScoreThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ current user id for per-lead RBAC checks
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [canAddLeads, setCanAddLeads] = useState(false);
  const [canDeleteLeads, setCanDeleteLeads] = useState(false);

  // ✅ needed for lead visibility rule
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);

  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  const ROW_HEIGHT_PX = 44;
  const HEADER_HEIGHT_PX = 40;
  const VISIBLE_ROWS = 16;
  const TABLE_BODY_MAX_HEIGHT = HEADER_HEIGHT_PX + ROW_HEIGHT_PX * VISIBLE_ROWS;

  /* ---------- 1) Load teamId + userId + role from Supabase ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[Leads] No authenticated user", userError);
          if (!cancelled) {
            setTeamId(null);
            setCurrentUserId(null);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        if (!cancelled) setCurrentUserId(userId);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id, role")
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

        const roles = (profile?.role ?? []) as string[];
        const normRoles = roles.map((r) => String(r).trim().toLowerCase());

        const isProspector = normRoles.includes("prospector");
        const managerOrAdmin =
          normRoles.includes("manager") || normRoles.includes("admin");

        if (!cancelled) {
          setTeamId(tId);
          setCanAddLeads(isProspector);
          setCanDeleteLeads(managerOrAdmin);
          setIsManagerOrAdmin(managerOrAdmin);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[Leads] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setCurrentUserId(null);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 2) Load leads / fields / thresholds once teamId is known ---------- */

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

        const [fieldDefs, stageDefs, leadsRes, scoringConfig] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
          (async () => {
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
          (async (): Promise<ScoreThresholds | null> => {
            const res = await fetch("/api/crm/lead-scoring-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamId, action: "get" }),
            });

            const ct = res.headers.get("content-type") ?? "";
            if (!res.ok || !ct.includes("application/json")) return null;

            const json = await res.json();
            const low = Number(json.thresholds?.low);
            const high = Number(json.thresholds?.high);
            if (Number.isNaN(low) || Number.isNaN(high)) return null;
            return { low, high };
          })(),
        ]);

        if (cancelled) return;

        setFields(fieldDefs);
        setStages(stageDefs);

        // ✅ IMPORTANT: /api/crm/leads must return prospector_id + setter_id + closer_id
        setLeads(
          (leadsRes ?? []).map((l) => ({
            id: l.id,
            stage: l.stage,
            customValues: l.custom_values ?? {},
            score: l.score ?? null,
            prospector_id: l.prospector_id ?? null,
            setter_id: l.setter_id ?? null,
            closer_id: l.closer_id ?? null,
          }))
        );

        setThresholds(scoringConfig);
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

  /* ---------- table helpers ---------- */

  const columns = useMemo(
    () => [
      { key: "__score", label: "Score", type: null, isScore: true as const },
      ...fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        isStage: false,
        isScore: false,
      })),
      {
        key: "__stage",
        label: "Stage",
        type: null,
        isStage: true as const,
        isScore: false,
      },
    ],
    [fields]
  );

  // ✅ NEW: which leads this user is allowed to see
  const visibleLeads = useMemo(() => {
    // managers/admins see everything
    if (isManagerOrAdmin) return leads;

    // everyone else sees only leads where they are involved (prospector/setter/closer)
    if (!currentUserId) return [];
    return leads.filter(
      (l) =>
        l.prospector_id === currentUserId ||
        l.setter_id === currentUserId ||
        l.closer_id === currentUserId
    );
  }, [leads, currentUserId, isManagerOrAdmin]);

  // ✅ your existing search now runs only on the visible leads
  const filteredLeads = useMemo(() => {
    if (!query) return visibleLeads;

    return visibleLeads.filter((lead) => {
      if (lead.stage?.toLowerCase().includes(query)) return true;

      return Object.values(lead.customValues ?? {}).some((v) => {
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(query);
      });
    });
  }, [visibleLeads, query]);

  const totalCount = visibleLeads.length;
  const visibleCount = filteredLeads.length;

  // ✅ ACTION COLUMN VISIBILITY:
  // Show Log + Edit columns if the user is Setter OR Closer in ANY (visible+filtered) lead
  // View is always shown
  // Delete shown if manager/admin
  const actionColumnVisibility = useMemo(() => {
    const involvedAsSetterOrCloserInAnyLead =
      !!currentUserId &&
      filteredLeads.some(
        (l) => l.setter_id === currentUserId || l.closer_id === currentUserId
      );

    return {
      showLog: involvedAsSetterOrCloserInAnyLead,
      showView: true,
      showEdit: involvedAsSetterOrCloserInAnyLead,
      showDelete: canDeleteLeads,
    };
  }, [currentUserId, filteredLeads, canDeleteLeads]);

  const actionColCount =
    (actionColumnVisibility.showLog ? 1 : 0) +
    (actionColumnVisibility.showView ? 1 : 0) +
    (actionColumnVisibility.showEdit ? 1 : 0) +
    (actionColumnVisibility.showDelete ? 1 : 0);

  if (workspaceLoaded && !teamId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
      </div>
    );
  }

  function getScoreBadgeClasses(score: number | null): string {
    if (score == null) return "bg-slate-100 text-slate-400";
    if (!thresholds) return "bg-amber-50 text-amber-700";

    const { low, high } = thresholds;
    if (score < low) return "bg-rose-50 text-rose-700";
    if (score >= high) return "bg-emerald-50 text-emerald-700";
    return "bg-amber-50 text-amber-700";
  }

  // ✅ Action headers were getting cut off because they were too narrow.
  // Give action columns enough width for "Delete", and keep them compact.
  const actionThClass =
    "border-b border-slate-200 px-2 py-2 font-semibold text-slate-700 text-center w-16 whitespace-nowrap";
  const actionTdClass =
    "border-b border-slate-100 px-2 py-2 align-top text-center w-16";

  /* ---------- render ---------- */

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#F1F5F9] pb-2 pt-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">
            {loading
              ? "Loading your leads…"
              : query
              ? `Showing ${visibleCount} of ${totalCount} leads you have access to.`
              : `Showing ${totalCount} leads you have access to.`}
          </p>
        </div>

        {canAddLeads && (
          <Link
            href="/leads/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-indigo-700"
          >
            + Add Leads
          </Link>
        )}
      </div>

      {loading ? (
        <LeadsLoadingState colCount={Math.max(6, columns.length + actionColCount)} />
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          <p>No leads yet (or none you can access).</p>
          {canAddLeads && (
            <p className="mt-1">
              Click <span className="font-semibold">+ Add Lead</span> to create
              your first one.
            </p>
          )}
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
          {/* ✅ Right padding so headers don't sit underneath the scrollbar */}
          <div
            className="overflow-y-auto overflow-x-auto rounded-xl pr-4"
            style={{ maxHeight: TABLE_BODY_MAX_HEIGHT }}
          >
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

                  {actionColumnVisibility.showLog && (
                    <th className={actionThClass}>Log</th>
                  )}
                  {actionColumnVisibility.showView && (
                    <th className={actionThClass}>View</th>
                  )}
                  {actionColumnVisibility.showEdit && (
                    <th className={actionThClass}>Edit</th>
                  )}
                  {actionColumnVisibility.showDelete && (
                    <th className={actionThClass}>Delete</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredLeads.map((lead) => {
                  // ✅ NEW RULE:
                  // If user is Setter OR Closer for THIS lead, they can see BOTH Log + Edit buttons
                  const isSetterOrCloserForLead =
                    !!currentUserId &&
                    (lead.setter_id === currentUserId ||
                      lead.closer_id === currentUserId);

                  const canLogMessagesForLead = isSetterOrCloserForLead;
                  const canEditLeadForLead = isSetterOrCloserForLead;

                  return (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      {columns.map((col) => {
                        if ((col as any).isScore) {
                          const score = lead.score ?? null;
                          const classes = getScoreBadgeClasses(score);

                          return (
                            <td
                              key={col.key}
                              className="border-b border-slate-100 px-3 py-2 align-top"
                            >
                              {score != null ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${classes}`}
                                >
                                  {score}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          );
                        }

                        if ((col as any).isStage) {
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

                      {actionColumnVisibility.showLog && (
                        <td className={actionTdClass}>
                          {canLogMessagesForLead ? (
                            <Link
                              href={`/leads/${lead.id}/messages`}
                              className="inline-flex p-1 !text-emerald-600 hover:!text-emerald-700 transition-colors"
                              title="Log outbound / inbound messages"
                            >
                              <PlusCircleIcon className="h-5 w-5" />
                            </Link>
                          ) : null}
                        </td>
                      )}

                      {actionColumnVisibility.showView && (
                        <td className={actionTdClass}>
                          <Link
                            href={`/leads/${lead.id}`}
                            className="inline-flex p-1 !text-slate-600 hover:!text-slate-900 transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                        </td>
                      )}

                      {actionColumnVisibility.showEdit && (
                        <td className={actionTdClass}>
                          {canEditLeadForLead ? (
                            <Link
                              href={`/leads/${lead.id}/edit`}
                              className="inline-flex p-1 !text-indigo-600 hover:!text-indigo-700 transition-colors"
                              title="Edit Lead"
                            >
                              <PencilSquareIcon className="h-5 w-5" />
                            </Link>
                          ) : null}
                        </td>
                      )}

                      {actionColumnVisibility.showDelete && (
                        <td className={actionTdClass}>
                          {canDeleteLeads ? (
                            <Link
                              href={`/leads/${lead.id}/delete`}
                              className="inline-flex p-1 !text-rose-500 hover:!text-rose-600 transition-colors"
                              title="Delete Lead"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </Link>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
