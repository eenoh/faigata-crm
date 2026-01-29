// src/modules/crm/components/PipelineClient.tsx
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
  useCallback,
} from "react";
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

  lead_name?: string | null;
  primary_contact_value?: string | null;
  niche?: string | null;

  customValues: Record<string, any>;
  score?: number | null;

  setter_id?: string | null;
  closer_id?: string | null;
};


type DragState = {
  leadId: string | null;
  fromStage: string | null;
};

type ScoreThresholds = {
  low: number;
  high: number;
};

type Burst = {
  id: string;
  x: number;
  y: number;
  createdAt: number;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** ---------- Fireworks / confetti burst (pure DOM + framer-motion) ---------- */
function FireworksOverlay({ bursts }: { bursts: Burst[] }) {
  const PARTICLES = 26;

  return (
    <AnimatePresence>
      {bursts.map((b) => (
        <motion.div
          key={b.id}
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute"
            style={{
              left: b.x,
              top: b.y,
              transform: "translate(-50%, -50%)",
            }}
          >
            {Array.from({ length: PARTICLES }).map((_, i) => {
              const angle = (Math.PI * 2 * i) / PARTICLES;
              const distance = 62 + (i % 6) * 9;
              const dx = Math.cos(angle) * distance;
              const dy = Math.sin(angle) * distance;

              const isStreak = i % 3 === 0;

              return (
                <motion.span
                  key={i}
                  className={[
                    "absolute block",
                    isStreak
                      ? "h-[3px] w-[14px] rounded-full"
                      : "h-[6px] w-[6px] rounded-full",
                    isStreak
                      ? "bg-gradient-to-r from-indigo-400 via-emerald-400 to-amber-400"
                      : "bg-gradient-to-r from-rose-400 via-indigo-400 to-emerald-400",
                    "shadow-sm",
                  ].join(" ")}
                  initial={{
                    x: 0,
                    y: 0,
                    opacity: 0,
                    scale: 0.85,
                    rotate: isStreak ? (angle * 180) / Math.PI : 0,
                  }}
                  animate={{
                    x: dx,
                    y: dy,
                    opacity: [0, 1, 1, 0],
                    scale: [0.85, 1, 0.95],
                    filter: ["blur(0px)", "blur(0px)", "blur(0.6px)"],
                  }}
                  transition={{
                    duration: 0.8,
                    ease: "easeOut",
                    times: [0, 0.18, 0.72, 1],
                  }}
                />
              );
            })}

            {/* soft “boom” ring */}
            <motion.span
              className="absolute block h-6 w-6 rounded-full ring-2 ring-indigo-200"
              style={{ left: 0, top: 0, transform: "translate(-50%, -50%)" }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

export function PipelineClient() {
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  // ✅ smoother filtering while typing
  const deferredQuery = useDeferredValue(searchQuery);

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [scoreThresholds, setScoreThresholds] = useState<ScoreThresholds>({
    low: 40,
    high: 70,
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isManagerOrAdmin, setIsManagerOrAdmin] = useState(false);

  const [dragState, setDragState] = useState<DragState>({
    leadId: null,
    fromStage: null,
  });

  const boardRef = useRef<HTMLDivElement | null>(null);

  // fireworks bursts
  const [bursts, setBursts] = useState<Burst[]>([]);

  const addBurst = useCallback((x: number, y: number) => {
    const b: Burst = { id: uid(), x, y, createdAt: Date.now() };
    setBursts((prev) => [...prev, b]);

    window.setTimeout(() => {
      setBursts((prev) => prev.filter((p) => p.id !== b.id));
    }, 850);
  }, []);

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
          if (typeof metaTeam === "string" && metaTeam.length > 0) tId = metaTeam;
        }

        const roles = (profile?.role ?? []) as string[];
        const normRoles = roles.map((r) => String(r).trim().toLowerCase());
        const managerOrAdmin = normRoles.includes("manager") || normRoles.includes("admin");

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

  /* ---------- 2) Load stages + leads + scoring thresholds once we know teamId ---------- */
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

        const [fieldDefs, stageDefs, leadsRes, scoringRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
          (async () => {
            const res = await fetch(`/api/crm/leads?teamId=${encodeURIComponent(teamId)}`);
            if (!res.ok) {
              const text = await res.text();
              console.error("[Pipeline] Failed to load leads", res.status, text.slice(0, 200));
              throw new Error("Failed to load leads");
            }
            return (await res.json()) as any[];
          })(),
          (async () => {
            const res = await fetch("/api/crm/lead-scoring-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamId, action: "get" }),
            });

            if (!res.ok) return null;
            const ct = res.headers.get("content-type") ?? "";
            if (!ct.includes("application/json")) return null;

            const json = (await res.json()) as { thresholds?: Partial<ScoreThresholds> };
            const low = Number(json.thresholds?.low);
            const high = Number(json.thresholds?.high);

            if (!Number.isNaN(low) && !Number.isNaN(high)) return { low, high } satisfies ScoreThresholds;
            return null;
          })(),
        ]);

        if (cancelled) return;

        setFields(fieldDefs);
        setStages(stageDefs || []);
        setScoreThresholds(scoringRes ?? { low: 40, high: 70 });

        const mapped: LeadCard[] = (leadsRes ?? []).map((l: any) => ({
          id: l.id,
          stage: l.stage,

          // ✅ include these
          lead_name: l.lead_name ?? null,
          primary_contact_value: l.primary_contact_value ?? null,
          niche: l.niche ?? null,

          customValues: l.custom_values ?? {},
          score: l.score ?? null,
          setter_id: l.setter_id ?? null,
          closer_id: l.closer_id ?? null,
        }));

        const visible =
          isManagerOrAdmin || !currentUserId
            ? mapped
            : mapped.filter((l) => l.setter_id === currentUserId || l.closer_id === currentUserId);

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
    stages.forEach((s) => (map[s.name] = []));

    leads.forEach((lead) => {
      const stageName = lead.stage && map[lead.stage] ? lead.stage : stages[0]?.name ?? "new";
      if (!map[stageName]) map[stageName] = [];
      map[stageName].push(lead);
    });

    return map;
  }, [leads, stages]);

  function isMeaningfulValue(v: any): boolean {
  if (v === null || v === undefined) return false;

  // strings
  if (typeof v === "string") return v.trim() !== "" && v.trim() !== "0";

  // numbers
  if (typeof v === "number") return !Number.isNaN(v) && v !== 0;

  // booleans (false is usually not a good title)
  if (typeof v === "boolean") return v === true;

  // everything else
  const s = String(v).trim();
  return s !== "" && s !== "0";
}

function asDisplay(v: any): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v.trim() : String(v);
}

function findNameLikeCustomValue(custom: Record<string, any>) {
  const preferredKeys = ["lead_name", "name", "full_name", "company", "business", "brand", "client", "account"];

  // 1) direct preferred keys
  for (const k of preferredKeys) {
    if (k in custom && isMeaningfulValue(custom[k])) return asDisplay(custom[k]);
  }

  // 2) any key containing "name"
  for (const [k, v] of Object.entries(custom)) {
    if (k.toLowerCase().includes("name") && isMeaningfulValue(v)) return asDisplay(v);
  }

  return "";
}


  function getLeadTitle(lead: LeadCard) {
    // ✅ best: real DB column
    if (isMeaningfulValue(lead.lead_name)) return asDisplay(lead.lead_name);

    // ✅ next: name-like custom fields
    const nameLike = findNameLikeCustomValue(lead.customValues);
    if (nameLike) return nameLike;

    // ✅ then: primary configured field (but only if meaningful, so "0" won't be shown)
    if (primaryField) {
      const v = lead.customValues[primaryField.key];
      if (isMeaningfulValue(v)) return asDisplay(v);
    }

    // ✅ then: contact value (often useful)
    if (isMeaningfulValue(lead.primary_contact_value)) return asDisplay(lead.primary_contact_value);

    // ✅ fallback
    return `Lead ${lead.id.slice(0, 6)}…`;
  }

  function getLeadSubtitle(lead: LeadCard) {
    // Prefer 2nd configured field if meaningful
    if (fields.length >= 2) {
      const secondaryField = fields[1];
      const v = lead.customValues[secondaryField.key];
      if (isMeaningfulValue(v)) return asDisplay(v);
    }

    // Otherwise try niche or another “useful” system field
    if (isMeaningfulValue(lead.niche)) return asDisplay(lead.niche);

    // Or any other meaningful custom value that isn't the title
    for (const [k, v] of Object.entries(lead.customValues)) {
      if (k.toLowerCase().includes("name")) continue;
      if (isMeaningfulValue(v)) return asDisplay(v);
    }

    return "";
  }

  function matchesSearch(lead: LeadCard, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();

    const title = getLeadTitle(lead).toLowerCase();
    if (title.includes(needle)) return true;

    const subtitle = getLeadSubtitle(lead).toLowerCase();
    if (subtitle.includes(needle)) return true;

    for (const value of Object.values(lead.customValues)) {
      if (value !== null && value !== undefined && String(value).toLowerCase().includes(needle)) return true;
    }

    return false;
  }

  function handleDragStart(leadId: string, fromStage: string) {
    setDragState({ leadId, fromStage });
  }

  function handleDragEnd() {
    setDragState({ leadId: null, fromStage: null });
  }

  function getScoreBadgeClasses(score: number | null | undefined) {
    if (score === null || score === undefined) return null;

    const low = Number(scoreThresholds.low);
    const high = Number(scoreThresholds.high);

    const safeLow = Number.isNaN(low) ? 40 : low;
    const safeHigh = Number.isNaN(high) ? 70 : high;

    const lo = Math.min(safeLow, safeHigh);
    const hi = Math.max(safeLow, safeHigh);

    if (score < lo) return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    if (score >= hi) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }

  async function logStageChange(leadId: string, fromStage: string, toStage: string): Promise<boolean> {
    if (!teamId) return false;

    try {
      const { data: userRes } = await supabase.auth.getUser();
      const senderId = userRes.user?.id ?? null;

      const res = await fetch(
        `/api/crm/lead-messages?teamId=${encodeURIComponent(teamId)}&leadId=${encodeURIComponent(leadId)}`,
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
        console.error("[Pipeline] Failed to log stage change", res.status, ct, text.slice(0, 400));
        return false;
      }

      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        console.error("[Pipeline] stage-change API returned non-JSON", res.status, ct, text.slice(0, 400));
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

    // optimistic UI
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: targetStage } : l)));

    // ✅ Fireworks on EVERY stage change
    addBurst(targetX, targetY);

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
        console.error("[Pipeline] Failed to update stage", await res.text().catch(() => ""));
        return;
      }

      const logged = await logStageChange(leadId, fromStage, targetStage);

      if (logged && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lead-message-logged", { detail: { teamId, leadId } }));
      }
    } catch (err) {
      console.error("[Pipeline] Failed to update stage", err);
    }
  }

  if (workspaceLoaded && !teamId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        You don&apos;t seem to be in any team yet. Open this page from a workspace, or complete onboarding first.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 rounded-lg bg-slate-200 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse" />
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
    return deferredQuery ? allStageLeads.filter((lead) => matchesSearch(lead, deferredQuery)) : allStageLeads;
  };

  return (
    <div ref={boardRef} className="relative flex h-[calc(100vh-6rem)] flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">Drag leads between columns to update their stage.</p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <motion.div className="flex min-w-[960px] gap-4 pr-4" layout transition={{ duration: 0.18 }}>
          {stages.map((stage, stageIndex) => {
            const stageLeads = filteredByStage(stage.name);

            const isActiveDrop = dragState.leadId !== null && dragState.fromStage !== stage.name;
            const conversion = getStageConversion(stage);

            return (
              <motion.div
                key={stage.name}
                className={[
                  "flex w-64 flex-shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm backdrop-blur transition",
                  isActiveDrop ? "ring-2 ring-indigo-300 ring-offset-2 ring-offset-slate-100" : "",
                ].join(" ")}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: stageIndex * 0.04, duration: 0.18 }}
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
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{stage.name}</h2>
                    <p className="text-[11px] text-slate-400">
                      {stageLeads.length} lead{stageLeads.length === 1 ? "" : "s"}
                    </p>
                    {conversion !== null && (
                      <p className="mt-0.5 text-[11px] font-medium text-emerald-600">{conversion.toFixed(0)}% conversion</p>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  <AnimatePresence initial={false} mode="popLayout">
                    {stageLeads.length === 0 && (
                      <motion.div
                        key={`placeholder:${stage.name}`}
                        className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-[11px] text-slate-400"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.14 }}
                        layout="position"
                      >
                        Drag a lead here
                      </motion.div>
                    )}

                    {stageLeads.map((lead) => {
                      const score = lead.score === null || lead.score === undefined ? null : Number(lead.score);
                      const scoreBadge = score === null || Number.isNaN(score) ? null : getScoreBadgeClasses(score);

                      return (
                        <motion.button
                          key={lead.id}
                          layout="position"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.14 }}
                          draggable
                          onDragStart={() => handleDragStart(lead.id, stage.name)}
                          onDragEnd={handleDragEnd}
                          className="group cursor-pointer cursor-grab active:cursor-grabbing flex w-full flex-col rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm transition will-change-transform"
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
                              {scoreBadge && score !== null && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${scoreBadge}`}
                                  title={`Low < ${scoreThresholds.low} | High ≥ ${scoreThresholds.high}`}
                                >
                                  {score}
                                </span>
                              )}

                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold transition-colors",
                                  "bg-slate-100 text-slate-500 group-hover:text-indigo-600",
                                ].join(" ")}
                              >
                                {stage.name}
                              </span>
                            </div>
                          </div>

                          {getLeadSubtitle(lead) && (
                            <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{getLeadSubtitle(lead)}</p>
                          )}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <FireworksOverlay bursts={bursts} />
    </div>
  );
}
