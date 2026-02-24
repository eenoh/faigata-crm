// src/modules/crm/components/DashboardClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

/* -------------------- types -------------------- */

type Bucket = "day" | "week" | "month";
type Scope = "team" | "me";

type FunnelStage = {
  id: string;
  name: string;
  position: number | null;
  leadCount: number;
};

type FunnelEdge = {
  fromStageId: string;
  toStageId: string;
  fromStageName: string;
  toStageName: string;

  position: number | null;
  label: string;

  targetRate: number | null;
  actualConversionRate: number | null;
  dropOffCount: number;
  dropOffRate: number | null;
};

type ActivityPoint = {
  bucket_start: string;
  leads_created: number;
  messages_sent: number;
};

type OverviewPayload = {
  ok: boolean;
  teamId: string;
  roles: string[];
  isManagerOrAdmin: boolean;
  scope: Scope;

  kpis: {
    leads_total: number;
    leads_new_7d: number;
    leads_new_30d: number;
    messages_sent_7d: number;
    messages_sent_30d: number;
    bookings_7d: number;
    bookings_30d: number;
    show_rate_30d: number | null;
    close_rate_30d: number | null;
  };

  funnel: {
    leadTotal: number;
    stages: FunnelStage[];
    edges: FunnelEdge[];
  };

  activity: {
    ok: boolean;
    bucket: Bucket;
    from: string;
    to: string;
    series: ActivityPoint[];
  };

  panels: {
    upcoming_bookings: Array<{
      id: string;
      start_at: string;
      end_at: string | null;
      lead_id: string | null;
      invitee_first_name: string | null;
      invitee_email: string | null;
      booking_link_id: string | null;
    }>;
    recent_leads: Array<{
      id: string;
      name: string | null;
      stage: string | null;
      created_at: string;
      score: number | null;
    }>;
    needs_attention: Array<{
      id: string;
      name: string | null;
      stage: string | null;
      score: number | null;
      last_activity_at: string | null;
    }>;
    feed: Array<{
      type: "lead_created" | "message" | "booking";
      at: string;
      lead_id: string | null;
      label: string;
    }>;
  };
};

type TooltipItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
};

type ActivityTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipItem[];
  bucket: Bucket;
};

/* -------------------- small utils -------------------- */

function fmtPct(v: number | null) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v}%`;
}

/**
 * - Normalizes percent-like values:
 * - If API accidentally returns 0.5 meaning 50%, convert it.
 * - Keep normal values like 50 as-is.
 */
function normalizePercent(v: number | null) {
  if (v == null || Number.isNaN(v)) return null;
  if (v > 0 && v < 1) return Math.round(v * 100);
  return v;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactNumber(n: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(n);
  }
}

function fmtBucketLabel(iso: string, bucket: Bucket) {
  const d = new Date(iso);
  if (bucket === "month")
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  if (bucket === "week")
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function formatYAxisTick(v: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  } catch {
    return String(v);
  }
}

function ActivityTooltip({
  active,
  payload,
  label,
  bucket,
}: ActivityTooltipProps) {
  if (!active || !payload?.length || label == null) return null;

  const leadsRaw = payload.find(
    (p) => String(p.dataKey) === "leads_created",
  )?.value;
  const msgsRaw = payload.find(
    (p) => String(p.dataKey) === "messages_sent",
  )?.value;

  const leads = Number(leadsRaw ?? 0);
  const messages = Number(msgsRaw ?? 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="text-[11px] font-semibold text-slate-900">
        {fmtBucketLabel(String(label), bucket)}
      </div>

      <div className="mt-1 grid gap-1 text-[11px] text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "#4f46e5" }}
            />
            <span>Leads added</span>
          </div>
          <span className="font-semibold text-slate-900">{leads}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "rgba(79,70,229,0.45)" }}
            />
            <span>Messages sent</span>
          </div>
          <span className="font-semibold text-slate-900">{messages}</span>
        </div>
      </div>
    </div>
  );
}

/* ✅ Loading overlay styled like LoginPageClient */
function MiniLoadingOverlay({ label = "Loading" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      {/* blurred backdrop */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-md" />

      {/* loader card */}
      <div className="relative z-10 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl px-10 py-8 shadow-xl">
        <div className="flex items-end justify-center gap-2">
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.1s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce" />
        </div>

        <p className="mt-4 text-center text-sm font-semibold text-slate-700">
          {label}
        </p>
      </div>
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <SkeletonBlock className="h-6 w-40" />
            <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-9 w-40 rounded-lg" />
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-9 w-28 rounded-lg" />
              <SkeletonBlock className="h-9 w-28 rounded-lg" />
              <SkeletonBlock className="h-9 w-28 rounded-lg" />
              <SkeletonBlock className="h-9 w-24 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-2 h-7 w-24" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-3 lg:col-span-2">
          {/* Funnel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="mt-2 h-3 w-64" />
              </div>
              <SkeletonBlock className="h-9 w-40 rounded-lg" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <SkeletonBlock className="h-6 w-48" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-2 h-3 w-80 max-w-full" />

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SkeletonBlock className="h-7 w-28 rounded-full" />
                <SkeletonBlock className="h-7 w-32 rounded-full" />
              </div>

              <div className="h-[280px] rounded-lg border border-slate-200 bg-slate-50">
                <div className="p-4">
                  <SkeletonBlock className="h-4 w-56" />
                  <SkeletonBlock className="mt-3 h-4 w-72" />
                  <SkeletonBlock className="mt-3 h-4 w-64" />
                </div>
              </div>

              <SkeletonBlock className="mt-3 h-3 w-72 max-w-full" />
            </div>
          </div>
        </div>

        {/* Right panels */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, panelIdx) => (
            <div
              key={panelIdx}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <SkeletonBlock className="h-4 w-36" />
                  <SkeletonBlock className="mt-2 h-3 w-52" />
                </div>
                <SkeletonBlock className="h-4 w-20" />
              </div>

              <div className="space-y-2">
                {Array.from({ length: 4 }).map((__, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <SkeletonBlock className="h-4 w-44" />
                    <SkeletonBlock className="mt-2 h-3 w-64" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------- funnel helpers (from old) -------------------- */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** Indigo ramp (on-brand) that varies intensity by lead density. */
function indigoFill(t: number) {
  const tt = easeOutCubic(clamp(t, 0, 1));
  const hue = 231;
  const sat = 78;
  const light = 93 - tt * 38; // 93 -> 55
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function indigoShadowBand(t: number) {
  const tt = easeOutCubic(clamp(t, 0, 1));
  const hue = 231;
  const sat = 82;
  const light = 88 - tt * 44; // 88 -> 44
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function textColorFor(t: number) {
  return t >= 0.62 ? "rgba(255,255,255,0.98)" : "rgba(15,23,42,0.92)";
}

function subTextColorFor(t: number) {
  return t >= 0.62 ? "rgba(255,255,255,0.86)" : "rgba(15,23,42,0.72)";
}

/* -------------------- FunnelSvg -------------------- */

function FunnelSvg({
  stages,
  edges,
  selectedStageId,
  onSelectStageId,
  showTable,
  onToggleTable,
  detailsRef,
  tableRef,
}: {
  stages: FunnelStage[];
  edges: FunnelEdge[];
  selectedStageId: string | null;
  onSelectStageId: (id: string | null) => void;
  showTable: boolean;
  onToggleTable: () => void;
  detailsRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLDivElement | null>;
}) {
  const n = stages.length;

  const viewW = 760;
  const topW = 600;
  const bottomW = 280;

  const segH = 72;
  const gap = 6;
  const height = n * segH + Math.max(0, n - 1) * gap;

  const cx = viewW / 2;
  const maxCount = Math.max(1, ...stages.map((s) => s.leadCount));

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function widthAt(i: number) {
    if (n <= 1) return topW;
    const t = i / (n - 1);
    const tt = easeOutCubic(t);
    return lerp(topW, bottomW, tt);
  }

  function trapezoidPoints(
    wTop: number,
    wBot: number,
    yTop: number,
    yBot: number,
  ) {
    const x1 = cx - wTop / 2;
    const x2 = cx + wTop / 2;
    const x3 = cx + wBot / 2;
    const x4 = cx - wBot / 2;
    return {
      points: `${x1},${yTop} ${x2},${yTop} ${x3},${yBot} ${x4},${yBot}`,
    };
  }

  const segs = stages.map((stage, i) => {
    const yTop = i * (segH + gap);
    const yBot = yTop + segH;

    const wTop = widthAt(i);
    const wBot = widthAt(i + 1);

    const density = clamp(stage.leadCount / maxCount, 0, 1);
    const base = indigoFill(density);
    const band = indigoShadowBand(density);

    const edge = edges[i] ?? null;

    return {
      i,
      stage,
      yTop,
      yBot,
      wTop,
      wBot,
      density,
      base,
      band,
      edge,
      ...trapezoidPoints(wTop, wBot, yTop, yBot),
    };
  });

  return (
    <div className="w-full overflow-x-auto">
      <div className="mx-auto w-full max-w-[920px]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-indigo-500/70" />
            <span className="font-semibold text-slate-800">Tip:</span>
            <span>Click a stage for details.</span>
          </div>

          <button
            type="button"
            onClick={onToggleTable}
            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
            aria-pressed={showTable}
          >
            {showTable ? "Hide table" : "Show table"}
          </button>
        </div>

        <svg
          viewBox={`0 0 ${viewW} ${Math.max(1, height)}`}
          className="h-auto w-full"
          role="img"
          aria-label="Pipeline funnel"
        >
          <defs>
            <filter id="segShadow" x="-25%" y="-25%" width="150%" height="170%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="2.0"
                floodOpacity="0.08"
              />
              <feDropShadow
                dx="0"
                dy="8"
                stdDeviation="10"
                floodOpacity="0.08"
              />
            </filter>

            <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.40)" />
              <stop offset="35%" stopColor="rgba(255,255,255,0.12)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
            </linearGradient>

            {segs.map((s) => (
              <linearGradient
                key={`g-${s.stage.id}`}
                id={`segGrad-${s.i}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor={s.base} />
                <stop offset="55%" stopColor={s.base} />
                <stop offset="100%" stopColor={s.band} />
              </linearGradient>
            ))}

            {segs.map((s) => (
              <linearGradient
                key={`b-${s.stage.id}`}
                id={`segBand-${s.i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.08)" />
              </linearGradient>
            ))}
          </defs>

          {segs.map((s) => {
            const titleColor = textColorFor(s.density);
            const subColor = subTextColorFor(s.density);

            const yMid = (s.yTop + s.yBot) / 2;
            const isNarrow = Math.min(s.wTop, s.wBot) < 320;

            const lipH = 12;
            const lipYTop = s.yTop + 6;
            const lipYBot = lipYTop + lipH;
            const lipWTop = s.wTop - 16;
            const lipWBot = s.wTop - 40;
            const lip = trapezoidPoints(lipWTop, lipWBot, lipYTop, lipYBot);

            const edge = s.edge;
            const hasEdge = !!edge;

            const convText = hasEdge ? fmtPct(edge!.actualConversionRate) : "—";

            // ✅ normalize target everywhere
            const normalizedTarget = hasEdge
              ? normalizePercent(edge!.targetRate)
              : null;
            const tgtText =
              normalizedTarget != null ? `${normalizedTarget}%` : null;

            const dropText = hasEdge
              ? `${edge!.dropOffCount} (${fmtPct(edge!.dropOffRate)})`
              : "—";

            const isSelected = selectedStageId === s.stage.id;
            const stroke = isSelected
              ? "rgba(79,70,229,0.55)"
              : "rgba(15,23,42,0.10)";
            const strokeW = isSelected ? 3 : 2;

            return (
              <g
                key={s.stage.id}
                filter="url(#segShadow)"
                style={{ cursor: "pointer" }}
                onClick={() => onSelectStageId(isSelected ? null : s.stage.id)}
              >
                <polygon
                  points={s.points}
                  fill={`url(#segGrad-${s.i})`}
                  stroke={stroke}
                  strokeWidth={strokeW}
                  strokeLinejoin="round"
                />
                <polygon
                  points={lip.points}
                  fill={`url(#segBand-${s.i})`}
                  opacity={0.85}
                  pointerEvents="none"
                />
                <polygon
                  points={s.points}
                  fill="url(#gloss)"
                  opacity={0.28}
                  pointerEvents="none"
                />

                <text
                  x={cx}
                  y={yMid - 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={titleColor}
                  pointerEvents="none"
                  style={{ fontWeight: 900, fontSize: isNarrow ? 12 : 13 }}
                >
                  {s.stage.name}
                </text>

                <text
                  x={cx}
                  y={yMid + 6}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={subColor}
                  pointerEvents="none"
                  style={{ fontWeight: 800, fontSize: 10 }}
                >
                  {compactNumber(s.stage.leadCount)} lead
                  {s.stage.leadCount === 1 ? "" : "s"}
                </text>

                {hasEdge && (
                  <text
                    x={cx}
                    y={yMid + 22}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={subColor}
                    pointerEvents="none"
                    style={{ fontWeight: 750, fontSize: 9 }}
                  >
                    Conv {convText}
                    {tgtText ? ` (tgt ${tgtText})` : ""} • Drop {dropText}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {selectedStageId && (
          <div
            ref={detailsRef}
            className="mt-3 scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            {(() => {
              const i = stages.findIndex((s) => s.id === selectedStageId);
              const s = i >= 0 ? stages[i] : null;
              const e = i >= 0 ? (edges[i] ?? null) : null;
              if (!s) return null;

              const normalizedTarget = normalizePercent(e?.targetRate ?? null);

              return (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-extrabold text-slate-900">
                        {s.name}
                      </div>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        Stage {i + 1}/{stages.length}
                      </span>
                    </div>

                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {s.leadCount} lead{s.leadCount === 1 ? "" : "s"} in this
                      stage.
                    </div>

                    {e && (
                      <div className="mt-1.5 text-[11px] text-slate-600">
                        Next:{" "}
                        <span className="font-semibold text-slate-900">
                          {e.fromStageName} → {e.toStageName}
                        </span>{" "}
                        <span className="text-slate-400">•</span>{" "}
                        <span className="font-semibold">{e.label}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <div className="text-[10px] text-slate-500">
                        Conversion
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">
                        {fmtPct(e?.actualConversionRate ?? null)}
                      </div>
                      {normalizedTarget != null && (
                        <div className="text-[10px] text-slate-500">
                          Target {normalizedTarget}%
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <div className="text-[10px] text-slate-500">Drop-off</div>
                      <div className="text-sm font-extrabold text-slate-900">
                        {e ? e.dropOffCount : "—"}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {fmtPct(e?.dropOffRate ?? null)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectStageId(null)}
                      className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {showTable && (
          <div
            ref={tableRef}
            className="mt-4 scroll-mt-24 overflow-hidden rounded-xl border border-slate-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2.5">
              <div className="text-sm font-semibold text-slate-900">
                Stage-to-Stage Performance
              </div>
            </div>

            <div className="bg-slate-50/60">
              <div className="grid grid-cols-12 gap-2 border-t border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">
                <div className="col-span-4">Transition</div>
                <div className="col-span-3">Label</div>
                <div className="col-span-2 text-right">Conversion</div>
                <div className="col-span-3 text-right">Drop-off</div>
              </div>

              {edges.length === 0 ? (
                <div className="border-t border-slate-200 px-3 py-3 text-[11px] text-slate-600">
                  Add at least 2 pipeline stages to see conversion metrics.
                </div>
              ) : (
                [...edges]
                  .sort(
                    (a, b) =>
                      (a.position ?? Number.POSITIVE_INFINITY) -
                      (b.position ?? Number.POSITIVE_INFINITY),
                  )
                  .map((e) => {
                    const fromId = e.fromStageId ?? null;
                    const toId = e.toStageId ?? null;

                    const isRowActive =
                      (selectedStageId && selectedStageId === fromId) ||
                      (selectedStageId && selectedStageId === toId);

                    const safeLabel =
                      typeof e.label === "string" && e.label.trim().length > 0
                        ? e.label.trim()
                        : "—";

                    const normalizedTarget = normalizePercent(e.targetRate);

                    return (
                      <button
                        type="button"
                        key={`${e.fromStageId}-${e.toStageId}-${e.position ?? "na"}`}
                        onClick={() => onSelectStageId(fromId)}
                        className={`grid w-full grid-cols-12 gap-2 border-t border-slate-200 px-3 py-2.5 text-left text-[12px] transition ${
                          isRowActive
                            ? "bg-indigo-50/60"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="col-span-4 min-w-0">
                          <div
                            className="truncate font-semibold text-slate-900"
                            title={`${e.fromStageName} → ${e.toStageName}`}
                          >
                            {e.fromStageName} → {e.toStageName}
                          </div>
                        </div>

                        <div className="col-span-3 min-w-0">
                          <div
                            className="truncate text-slate-700"
                            title={safeLabel}
                          >
                            {safeLabel}
                          </div>
                        </div>

                        <div className="col-span-2 text-right">
                          <div className="font-semibold text-slate-900">
                            {fmtPct(e.actualConversionRate)}
                          </div>
                          {normalizedTarget != null && (
                            <div className="text-[10px] text-slate-500">
                              Target {normalizedTarget}%
                            </div>
                          )}
                        </div>

                        <div className="col-span-3 text-right">
                          <div className="font-semibold text-slate-900">
                            {e.dropOffCount}{" "}
                            <span className="font-medium text-slate-500">
                              ({fmtPct(e.dropOffRate)})
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- small UI primitives -------------------- */

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  const ring =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-xl border ${ring} p-3 shadow-sm`}>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-600">{sub}</div>}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[11px] text-slate-500">{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

/* -------------------- main component -------------------- */

export default function DashboardClient() {
  const BRAND = "#4f46e5";

  const [bucket, setBucket] = useState<Bucket>("week");
  const [days, setDays] = useState<number>(120);
  const [scope, setScope] = useState<Scope>("team");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<OverviewPayload | null>(null);

  const [showTable, setShowTable] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const detailsRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function authedGet(url: string) {
    const { data: sessionRes, error: sessionErr } =
      await supabase.auth.getSession();
    const accessToken = sessionRes.session?.access_token ?? null;
    if (sessionErr || !accessToken)
      throw new Error("Unauthorized: missing session token");
    return fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  }

  const fetchOverview = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;

    try {
      if (silent) setRefreshing(true);
      else setLoading(true);

      setError(null);

      const res = await authedGet(
        `/api/crm/dashboard/overview?bucket=${bucket}&days=${days}&scope=${scope}`,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }

      const json = (await res.json()) as OverviewPayload;

      if (mountedRef.current) {
        setData(json);
        setSelectedStageId((prev) =>
          prev && json.funnel?.stages?.some((s) => s.id === prev) ? prev : null,
        );
      }
    } catch (e: any) {
      if (mountedRef.current)
        setError(String(e?.message ?? "Failed to load dashboard"));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchOverview({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, days, scope]);

  useEffect(() => {
    const teamId = data?.teamId;
    if (!teamId) return;

    let t: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        if (mountedRef.current) fetchOverview({ silent: true });
      }, 250);
    };

    const channel = supabase
      .channel(`dashboard-live-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leads",
          filter: `team_id=eq.${teamId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_messages",
          filter: `team_id=eq.${teamId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `team_id=eq.${teamId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_outcomes",
          filter: `team_id=eq.${teamId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pipeline_stages",
          filter: `team_id=eq.${teamId}`,
        },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversion_metrics",
          filter: `team_id=eq.${teamId}`,
        },
        scheduleRefetch,
      )
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.teamId]);

  useEffect(() => {
    if (!selectedStageId) return;
    setShowTable(true);
    requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [selectedStageId]);

  const visibilityLabel = useMemo(() => {
    if (!data) return "";
    return scope === "team" ? "Scope: Team" : "Scope: Me";
  }, [data, scope]);

  const activitySeries = useMemo(() => {
    const raw = data?.activity?.series ?? [];
    return raw.map((p) => ({
      bucket_start: p.bucket_start,
      leads_created: Number(p.leads_created ?? 0),
      messages_sent: Number(p.messages_sent ?? 0),
    }));
  }, [data]);

  const totals = useMemo(() => {
    let leads = 0;
    let msgs = 0;
    for (const p of activitySeries) {
      leads += p.leads_created;
      msgs += p.messages_sent;
    }
    return { leads, msgs };
  }, [activitySeries]);

  const insights = useMemo(() => {
    const stages = data?.funnel?.stages ?? [];
    const edges = data?.funnel?.edges ?? [];

    const first = stages[0]?.leadCount ?? 0;
    const last = stages.length ? stages[stages.length - 1].leadCount : 0;
    const overallDenom = first + last;
    const overallConv =
      overallDenom > 0 ? Math.round((last / overallDenom) * 1000) / 10 : null;

    let worstEdge: FunnelEdge | null = null;
    for (const e of edges)
      if (!worstEdge || e.dropOffCount > worstEdge.dropOffCount) worstEdge = e;

    return { overallConv, worstEdge };
  }, [data]);

  const stageCount = data?.funnel?.stages?.length ?? 0;

  return (
    <div className="relative space-y-4">
      {/* Page Header */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              Your pipeline health, activity, bookings, and what needs
              attention.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm">
              <span
                className={`h-2 w-2 rounded-full ${refreshing ? "bg-amber-500" : "bg-emerald-500"}`}
              />
              <span className="font-semibold text-slate-800">
                {refreshing ? "Updating…" : "Live"}
              </span>
              {data && (
                <>
                  <span className="mx-2 text-slate-300">•</span>
                  <span className="font-semibold text-slate-800">
                    {visibilityLabel}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 shadow-sm outline-none"
              >
                <option value="team">Team</option>
                <option value="me">Me</option>
              </select>

              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 shadow-sm outline-none"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={120}>120 days</option>
              </select>

              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as Bucket)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 shadow-sm outline-none"
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>

              <button
                type="button"
                onClick={() => fetchOverview({ silent: false })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </div>

      {loading && <DashboardSkeleton />}

      {/* KPI Grid */}
      {data && !error && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard
            label="Leads"
            value={compactNumber(data.kpis.leads_total)}
          />
          <StatCard
            label="New leads (7d)"
            value={compactNumber(data.kpis.leads_new_7d)}
            sub={`30d: ${compactNumber(data.kpis.leads_new_30d)}`}
          />
          <StatCard
            label="Messages sent (7d)"
            value={compactNumber(data.kpis.messages_sent_7d)}
            sub={`30d: ${compactNumber(data.kpis.messages_sent_30d)}`}
          />
          <StatCard
            label="Bookings (7d)"
            value={compactNumber(data.kpis.bookings_7d)}
            sub={`30d: ${compactNumber(data.kpis.bookings_30d)}`}
          />
          <StatCard
            label="Show rate (30d)"
            value={fmtPct(data.kpis.show_rate_30d)}
            sub="Based on outcomes"
            tone={
              data.kpis.show_rate_30d != null && data.kpis.show_rate_30d >= 70
                ? "good"
                : "default"
            }
          />
          <StatCard
            label="Close rate (30d)"
            value={fmtPct(data.kpis.close_rate_30d)}
            sub="Based on outcomes"
            tone={
              data.kpis.close_rate_30d != null && data.kpis.close_rate_30d >= 20
                ? "good"
                : "default"
            }
          />
        </div>
      )}

      {/* Main grid */}
      {data && !error && (
        <div className="grid gap-3 lg:grid-cols-3">
          {/* Left: Funnel + Activity */}
          <div className="space-y-3 lg:col-span-2">
            {/* Funnel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader
                title="Pipeline Funnel"
                subtitle={
                  stageCount < 2
                    ? "Add at least 2 stages to see conversion metrics."
                    : "Click a stage to inspect conversion + drop-off."
                }
                right={
                  stageCount < 2 ? (
                    <Link
                      href="/settings/pipeline-stages"
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-indigo-700"
                    >
                      Configure stages →
                    </Link>
                  ) : null
                }
              />

              {stageCount === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No pipeline stages found yet.
                </div>
              ) : stageCount === 1 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-700">
                  You only have <span className="font-semibold">1</span> stage.
                  Add another stage to unlock conversions.
                </div>
              ) : (
                <FunnelSvg
                  stages={data.funnel.stages}
                  edges={data.funnel.edges}
                  selectedStageId={selectedStageId}
                  onSelectStageId={setSelectedStageId}
                  showTable={showTable}
                  onToggleTable={() => setShowTable((p) => !p)}
                  detailsRef={detailsRef}
                  tableRef={tableRef}
                />
              )}

              {stageCount >= 2 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
                  <span className="font-semibold">Overall conversion:</span>{" "}
                  <span className="font-extrabold">
                    {fmtPct(insights.overallConv)}
                  </span>
                  {insights.worstEdge && (
                    <>
                      <span className="mx-2 text-slate-300">•</span>
                      <span className="font-semibold">Biggest drop:</span>{" "}
                      <span className="font-extrabold">
                        {insights.worstEdge.fromStageName} →{" "}
                        {insights.worstEdge.toStageName}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Activity */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader
                title="Activity"
                subtitle={`Leads added vs outbound messages (excludes pipeline). Total in range: ${totals.leads} leads, ${totals.msgs} messages.`}
              />

              {!activitySeries.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
                  No activity data yet for this time range.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: BRAND }}
                      />
                      Leads added
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: "rgba(79,70,229,0.45)" }}
                      />
                      Messages sent
                    </div>
                  </div>

                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={activitySeries}
                        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(15,23,42,0.10)"
                        />
                        <XAxis
                          dataKey="bucket_start"
                          tickFormatter={(v: string) =>
                            fmtBucketLabel(String(v), bucket)
                          }
                          minTickGap={18}
                          tick={{ fontSize: 11, fill: "rgba(15,23,42,0.60)" }}
                          axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
                          tickLine={{ stroke: "rgba(15,23,42,0.12)" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickFormatter={(v: number) => formatYAxisTick(v)}
                          tick={{ fontSize: 11, fill: "rgba(15,23,42,0.60)" }}
                          axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
                          tickLine={{ stroke: "rgba(15,23,42,0.12)" }}
                        />
                        <Tooltip
                          content={(props) => (
                            <ActivityTooltip {...props} bucket={bucket} />
                          )}
                        />
                        <Legend wrapperStyle={{ display: "none" }} />
                        <Line
                          type="monotone"
                          dataKey="leads_created"
                          name="Leads added"
                          stroke={BRAND}
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="messages_sent"
                          name="Messages sent"
                          stroke={BRAND}
                          strokeOpacity={0.45}
                          strokeWidth={3}
                          strokeDasharray="6 4"
                          dot={false}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-3 text-[10px] text-slate-500">
                    Tip: hover the chart to compare leads added vs messages sent
                    for the same period.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Action panels */}
          <div className="space-y-3">
            {/* Needs attention */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader
                title="Needs attention"
                subtitle="High priority leads with stale activity."
                right={
                  <Link
                    href="/pipeline"
                    className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    Open pipeline →
                  </Link>
                }
              />

              {data.panels.needs_attention.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No leads need attention right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.panels.needs_attention.map((l) => (
                    <div
                      key={l.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-900">
                            {l.name || "Unnamed lead"}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            Stage:{" "}
                            <span className="font-semibold text-slate-700">
                              {l.stage || "—"}
                            </span>
                            {l.last_activity_at && (
                              <>
                                <span className="mx-2 text-slate-300">•</span>
                                Last activity: {fmtDateTime(l.last_activity_at)}
                              </>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-extrabold text-indigo-700">
                          {l.score == null ? "—" : `Score ${l.score}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming bookings */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader
                title="Upcoming bookings"
                subtitle="Next 14 days"
              />

              {data.panels.upcoming_bookings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No upcoming bookings.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.panels.upcoming_bookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-900">
                            {b.invitee_first_name
                              ? `${b.invitee_first_name}`
                              : "Booking"}
                            {b.invitee_email ? ` · ${b.invitee_email}` : ""}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {fmtDateTime(b.start_at)}
                          </div>
                        </div>

                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          Scheduled
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Feed */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionHeader title="Recent feed" subtitle="Latest events" />

              {data.panels.feed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                  No recent events.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.panels.feed.map((e, idx) => (
                    <div
                      key={`${e.type}-${idx}`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-900">
                            {e.label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {fmtDateTime(e.at)}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {e.type === "lead_created"
                            ? "Lead"
                            : e.type === "booking"
                              ? "Booking"
                              : "Message"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
