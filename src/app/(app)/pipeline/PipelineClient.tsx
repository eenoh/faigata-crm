// src/app/(app)/pipeline/PipelineClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { getLeadFieldDefinitions } from "@/data/leadFields";
import { getPipelineStages } from "@/data/pipelineStages";
import type { LeadFieldDefinition } from "@/types/lead";
import type { PipelineStageDef } from "@/data/pipelineStages";

type LeadCard = {
  id: string;
  stage: string;
  customValues: Record<string, any>;
};

type DragState = {
  leadId: string | null;
  fromStage: string | null;
};

type CelebratePos = { x: number; y: number } | null;

export function PipelineClient() {
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team");

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragState, setDragState] = useState<DragState>({
    leadId: null,
    fromStage: null,
  });
  const [celebrate, setCelebrate] = useState(false);
  const [celebratePos, setCelebratePos] = useState<CelebratePos>(null);

  // coordinate space for fireworks
  const boardRef = useRef<HTMLDivElement | null>(null);

  // load stages + leads
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!teamId) {
        console.warn("[Pipeline] Missing teamId in URL");
        setLoading(false);
        return;
      }

      try {
        const [fieldDefs, stageDefs, leadsRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
          fetch(`/api/leads?teamId=${encodeURIComponent(teamId)}`).then((r) =>
            r.json()
          ),
        ]);

        if (cancelled) return;

        setFields(fieldDefs);
        setStages(stageDefs || []);
        setLeads(
          (leadsRes ?? []).map((l: any) => ({
            id: l.id,
            stage: l.stage,
            customValues: l.custom_values ?? {},
          }))
        );
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
  }, [teamId]);

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

  function handleDragStart(leadId: string, fromStage: string) {
    setDragState({ leadId, fromStage });
  }

  function handleDragEnd() {
    setDragState({ leadId: null, fromStage: null });
  }

  // drop handler – targetX / targetY are coords relative to boardRef
  async function handleDrop(
    targetStage: string,
    targetX: number,
    targetY: number
  ) {
    if (!dragState.leadId || !teamId) return;
    const leadId = dragState.leadId;

    // optimistic update
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              stage: targetStage,
            }
          : l
      )
    );
    setDragState({ leadId: null, fromStage: null });

    // firework at precise local coords
    setCelebratePos({ x: targetX, y: targetY });
    setCelebrate(true);
    setTimeout(() => {
      setCelebrate(false);
      setCelebratePos(null);
    }, 1000);

    // persist to DB
    try {
      await fetch(
        `/api/leads?teamId=${encodeURIComponent(
          teamId
        )}&id=${encodeURIComponent(leadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: targetStage }),
        }
      );
    } catch (err) {
      console.error("[Pipeline] Failed to update stage", err);
    }
  }

  if (!teamId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Missing team in URL. Open this page from your workspace.
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

  // helper to read conversion rate (if you added a conversion_rate column)
  function getStageConversion(stage: PipelineStageDef): number | null {
    const raw = (stage as any).conversion_rate;
    if (raw === null || raw === undefined) return null;
    const num = Number(raw);
    if (Number.isNaN(num)) return null;
    return num;
  }

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
            const stageLeads = leadsByStage[stage.name] ?? [];
            const isActiveDrop =
              dragState.leadId !== null &&
              dragState.fromStage !== stage.name;

            const conversion = getStageConversion(stage); // 0–100 or null

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
                {/* Column header with conversion rate */}
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {stage.name}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {stageLeads.length} lead
                      {stageLeads.length === 1 ? "" : "s"}
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
                        onDragStart={() =>
                          handleDragStart(lead.id, stage.name)
                        }
                        onDragEnd={handleDragEnd}
                        className="group flex w-full flex-col rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm transition"
                        whileHover={{
                          y: -2,
                          boxShadow:
                            "0 10px 18px rgba(15, 23, 42, 0.10)",
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="line-clamp-1 text-[13px] font-semibold text-slate-900">
                            {getLeadTitle(lead)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            {stage.name}
                          </span>
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

      {/* precise firework overlay at drop point (relative to boardRef) */}
      <AnimatePresence>
        {celebrate && celebratePos && (
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute"
              style={{
                left: celebratePos.x,
                top: celebratePos.y,
                transform: "translate(-50%, -50%)",
              }}
              initial={{ scale: 0.7, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {Array.from({ length: 18 }).map((_, i) => {
                const angle = (i / 18) * Math.PI * 2;
                const distance = 80 + Math.random() * 20;
                const x = Math.cos(angle) * distance;
                const y = Math.sin(angle) * distance;

                const colors = [
                  "#4f46e5",
                  "#6366f1",
                  "#f97316",
                  "#22c55e",
                  "#ec4899",
                ];
                const color = colors[i % colors.length];

                return (
                  <motion.span
                    key={i}
                    className="absolute h-2 w-2 rounded-full"
                    style={{ left: 0, top: 0, backgroundColor: color }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0.7 }}
                    animate={{
                      x,
                      y,
                      opacity: 0,
                      scale: 1.25,
                      rotate: 180,
                    }}
                    transition={{
                      duration: 0.9,
                      ease: "easeOut",
                    }}
                  />
                );
              })}

              <motion.span
                className="absolute h-6 w-6 rounded-full bg-amber-400/90"
                style={{ left: -12, top: -12 }}
                initial={{ scale: 0, opacity: 0.9 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
