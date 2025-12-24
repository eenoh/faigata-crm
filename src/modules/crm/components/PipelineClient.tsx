"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import {
  getPipelineStages,
  type PipelineStageDef,
} from "@/modules/crm/data/pipelineStages";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

type LeadCard = {
  id: string;
  stage: string;
  customValues: Record<string, any>;
  score?: number | null;

  // ✅ RBAC fields (must come from /api/crm/leads)
  setter_id?: string | null;
  closer_id?: string | null;
};

type DragState = {
  leadId: string | null;
  fromStage: string | null;
};

type CelebratePos = { x: number; y: number } | null;

export function PipelineClient() {
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ who is the user + what can they see
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);

  const [dragState, setDragState] = useState<DragState>({
    leadId: null,
    fromStage: null,
  });
  const [celebrate, setCelebrate] = useState(false);
  const [celebratePos, setCelebratePos] = useState<CelebratePos>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);

  /* ---------- 1) Load workspace (teamId) + role from Supabase ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[Pipeline] No authenticated user", userError);
          if (!cancelled) {
            setTeamId(null);
            setCurrentUserId(null);
            setIsManagerOrAdmin(false);
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
          console.error("[Pipeline] Failed to load profile", profileError);
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
        const managerOrAdmin =
          normRoles.includes("manager") || normRoles.includes("admin");

        if (!cancelled) {
          setTeamId(tId);
          setIsManagerOrAdmin(managerOrAdmin);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[Pipeline] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setCurrentUserId(null);
          setIsManagerOrAdmin(false);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 2) Load stages + leads once we know teamId ---------- */

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
            const res = await fetch(
              `/api/crm/leads?teamId=${encodeURIComponent(teamId)}`
            );

            if (!res.ok) {
              const text = await res.text();
              console.error(
                "[Pipeline] Failed to load leads",
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
        setStages(stageDefs || []);

        // ✅ map leads including setter_id / closer_id
        const mapped: LeadCard[] = (leadsRes ?? []).map((l: any) => ({
          id: l.id,
          stage: l.stage,
          customValues: l.custom_values ?? {},
          score: l.score ?? null,
          setter_id: l.setter_id ?? null,
          closer_id: l.closer_id ?? null,
        }));

        // ✅ VISIBILITY RULE:
        // - manager/admin => see all
        // - everyone else => only leads where currentUserId === setter_id OR closer_id
        const visible =
          isManagerOrAdmin || !currentUserId
            ? mapped
            : mapped.filter(
                (l) =>
                  l.setter_id === currentUserId || l.closer_id === currentUserId
              );

        setLeads(visible);
      } catch (err) {
        console.error("[Pipeline] Failed to load data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoaded, currentUserId, isManagerOrAdmin]);

  /* ---------- memoised helpers & render logic ---------- */

  const primaryField = useMemo(() => fields[0] ?? null, [fields]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, LeadCard[]> = {};
    stages.forEach((s) => {
      map[s.name] = [];
    });

    leads.forEach((lead) => {
      const stageName =
        lead.stage && map[lead.stage] ? lead.stage : stages[0]?.name ?? "new";
      if (!map[stageName]) map[stageName] = [];
      map[stageName].push(lead);
    });

    return map;
  }, [leads, stages]);

  function getLeadTitle(lead: LeadCard) {
    if (primaryField) {
      const v = lead.customValues[primaryField.key];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        return String(v);
      }
    }

    const nameLike = Object.entries(lead.customValues).find(([key]) =>
      key.toLowerCase().includes("name")
    );
    if (nameLike && nameLike[1]) return String(nameLike[1]);

    return `Lead ${lead.id.slice(0, 6)}…`;
  }

  function getLeadSubtitle(lead: LeadCard) {
    if (fields.length < 2) return "";
    const secondaryField = fields[1];
    const v = lead.customValues[secondaryField.key];
    return v ? String(v) : "";
  }

  function matchesSearch(lead: LeadCard, q: string): boolean {
    if (!q) return true;

    const needle = q.toLowerCase();

    const title = getLeadTitle(lead).toLowerCase();
    if (title.includes(needle)) return true;

    const subtitle = getLeadSubtitle(lead).toLowerCase();
    if (subtitle.includes(needle)) return true;

    for (const value of Object.values(lead.customValues)) {
      if (
        value !== null &&
        value !== undefined &&
        String(value).toLowerCase().includes(needle)
      ) {
        return true;
      }
    }

    return false;
  }

  function handleDragStart(leadId: string, fromStage: string) {
    setDragState({ leadId, fromStage });
  }

  function handleDragEnd() {
    setDragState({ leadId: null, fromStage: null });
  }

  async function logStageChange(
    leadId: string,
    fromStage: string,
    toStage: string
  ): Promise<boolean> {
    if (!teamId) return false;

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const senderId = userRes.user?.id ?? null;

      const res = await fetch(
        `/api/crm/lead-messages?teamId=${encodeURIComponent(
          teamId
        )}&leadId=${encodeURIComponent(leadId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction: "outbound",
            channel: "pipeline",
            body: `Stage changed from "${fromStage}" to "${toStage}"`,
            sender_profile_id: senderId,
          }),
        }
      );

      const ct = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(
          "[Pipeline] Failed to log stage change",
          res.status,
          ct,
          text.slice(0, 400)
        );
        return false;
      }

      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        console.error(
          "[Pipeline] stage-change API returned non-JSON",
          res.status,
          ct,
          text.slice(0, 400)
        );
        return false;
      }

      return true;
    } catch (err) {
      console.error("[Pipeline] Failed to log stage change", err);
      return false;
    }
  }

  async function handleDrop(targetStage: string, targetX: number, targetY: number) {
    if (!dragState.leadId || !teamId) return;
    const leadId = dragState.leadId;
    const fromStage = dragState.fromStage;

    setDragState({ leadId: null, fromStage: null });

    if (!fromStage || fromStage === targetStage) return;

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: targetStage } : l))
    );

    setCelebratePos({ x: targetX, y: targetY });
    setCelebrate(true);
    setTimeout(() => {
      setCelebrate(false);
      setCelebratePos(null);
    }, 1000);

    try {
      const res = await fetch("/api/crm/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          id: leadId,
          updates: { stage: targetStage },
        }),
      });

      if (!res.ok) {
        console.error(
          "[Pipeline] Failed to update stage",
          await res.text().catch(() => "")
        );
        return;
      }

      const logged = await logStageChange(leadId, fromStage, targetStage);

      if (logged && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lead-message-logged", {
            detail: { teamId, leadId },
          })
        );
      }
    } catch (err) {
      console.error("[Pipeline] Failed to update stage", err);
    }
  }

  if (workspaceLoaded && !teamId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don&apos;t seem to be in any team yet. Open this page from a workspace,
        or complete onboarding first.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  function getStageConversion(stage: PipelineStageDef): number | null {
    const raw = (stage as any).conversion_rate;
    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    if (Number.isNaN(num)) return null;
    return num;
  }

  const filteredByStage = (stageName: string) => {
    const allStageLeads = leadsByStage[stageName] ?? [];
    return searchQuery
      ? allStageLeads.filter((lead) => matchesSearch(lead, searchQuery))
      : allStageLeads;
  };

  return (
    <div
      ref={boardRef}
      className="relative flex h-[calc(100vh-6rem)] flex-col gap-4 overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">
            Drag leads between columns to update their stage.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <motion.div
          className="flex min-w-[960px] gap-4 pr-4"
          layout
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          {stages.map((stage, stageIndex) => {
            const stageLeads = filteredByStage(stage.name);

            const isActiveDrop =
              dragState.leadId !== null && dragState.fromStage !== stage.name;

            const conversion = getStageConversion(stage);

            return (
              <motion.div
                key={stage.name}
                className={`flex w-64 flex-shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm backdrop-blur transition ${
                  isActiveDrop
                    ? "ring-2 ring-indigo-300 ring-offset-2 ring-offset-slate-100"
                    : ""
                }`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: stageIndex * 0.05 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const rect = boardRef.current?.getBoundingClientRect();
                  const localX = rect ? e.clientX - rect.left : e.clientX;
                  const localY = rect ? e.clientY - rect.top : e.clientY;
                  handleDrop(stage.name, localX, localY);
                }}
              >
                {/* Header */}
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {stage.name}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {stageLeads.length} lead{stageLeads.length === 1 ? "" : "s"}
                    </p>
                    {conversion !== null && (
                      <p className="mt-0.5 text-[11px] font-medium text-emerald-600">
                        {conversion.toFixed(0)}% conversion
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  <AnimatePresence>
                    {stageLeads.length === 0 && (
                      <motion.div
                        key="placeholder"
                        className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-[11px] text-slate-400"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        Drag a lead here
                      </motion.div>
                    )}

                    {stageLeads.map((lead) => (
                      <motion.button
                        key={lead.id}
                        layout
                        draggable
                        onDragStart={() => handleDragStart(lead.id, stage.name)}
                        onDragEnd={handleDragEnd}
                        className="group flex w-full flex-col rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm transition"
                        whileHover={{
                          y: -2,
                          boxShadow: "0 10px 18px rgba(15, 23, 42, 0.10)",
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="line-clamp-1 text-[13px] font-semibold text-slate-900">
                            {getLeadTitle(lead)}
                          </span>
                          <div className="flex items-center gap-1">
                            {lead.score != null && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                {lead.score}
                              </span>
                            )}
                            <span
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide 
                                        text-slate-500 transition-colors 
                                        group-hover:text-indigo-600
                                        font-semibold"
                            >
                              {stage.name}
                            </span>
                          </div>
                        </div>
                        {getLeadSubtitle(lead) && (
                          <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                            {getLeadSubtitle(lead)}
                          </p>
                        )}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* fireworks overlay unchanged */}
      <AnimatePresence>
        {celebrate && celebratePos && (
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* firework spans go here */}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
