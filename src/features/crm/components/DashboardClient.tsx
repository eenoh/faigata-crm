// src/features/crm/components/DashboardClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
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
import {
  clamp,
  compactNumber,
  easeOutCubic,
  fmtBucketLabel,
  fmtDateTime,
  fmtPct,
  formatYAxisTick,
  indigoFill,
  indigoShadowBand,
  normalizePercent,
  subTextColorFor,
  textColorFor,
} from "@/features/crm/components/dashboard/helpers";
import {
  ActivityTooltip,
  DashboardSkeleton,
  MiniLoadingOverlay,
  SectionHeader,
  StatCard,
} from "@/features/crm/components/dashboard/ui";
import type {
  Bucket,
  FunnelEdge,
  FunnelStage,
  OverviewPayload,
  Scope,
} from "@/features/crm/components/dashboard/types";
import type { RefObject } from "react";

/* -------------------- shared fetch -------------------- */

async function crmLocaleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocaleHeader(init?.headers),
  });
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
  isDark,
}: {
  stages: FunnelStage[];
  edges: FunnelEdge[];
  selectedStageId: string | null;
  onSelectStageId: (id: string | null) => void;
  showTable: boolean;
  onToggleTable: () => void;
  detailsRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLDivElement | null>;
  isDark: boolean;
}) {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const n = stages.length;

  const viewW = 760;
  const topW = 600;
  const bottomW = 280;

  const segH = 72;
  const gap = 6;
  const height = n * segH + Math.max(0, n - 1) * gap;

  const cx = viewW / 2;
  const maxCount = Math.max(1, ...stages.map((s) => s.leadCount));

  const surface = isDark
    ? "!border-slate-800 !bg-slate-950 !text-slate-200"
    : "!border-slate-200 !bg-white !text-slate-700";

  const softSurface = isDark
    ? "!border-slate-800 !bg-slate-900/30 !text-slate-300"
    : "!border-slate-200 !bg-slate-50 !text-slate-700";

  const rowHover = isDark ? "hover:bg-slate-900/35" : "hover:bg-slate-50";

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
          <div
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm ${surface}`}
          >
            <span className="h-2 w-2 rounded-full bg-indigo-500/70" />
            <span
              className={`font-semibold ${
                isDark ? "!text-slate-100" : "!text-slate-800"
              }`}
            >
              {t("funnel.tipLabel")}
            </span>
            <span className={isDark ? "!text-slate-300" : "!text-slate-600"}>
              {t("funnel.tipText")}
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleTable}
            className={`inline-flex cursor-pointer items-center justify-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition active:scale-[0.99] ${surface} ${
              isDark ? "hover:!bg-slate-900/40" : "hover:!bg-slate-50"
            }`}
            aria-pressed={showTable}
          >
            {showTable ? t("funnel.hideTable") : t("funnel.showTable")}
          </button>
        </div>

        <svg
          viewBox={`0 0 ${viewW} ${Math.max(1, height)}`}
          className="h-auto w-full"
          role="img"
          aria-label={t("funnel.ariaLabel")}
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

            const convText = hasEdge ? fmtPct(edge.actualConversionRate) : "—";

            const normalizedTarget = hasEdge
              ? normalizePercent(edge.targetRate)
              : null;
            const tgtText =
              normalizedTarget != null ? `${normalizedTarget}%` : null;

            const dropText = hasEdge
              ? `${edge.dropOffCount} (${fmtPct(edge.dropOffRate)})`
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
                  {compactNumber(s.stage.leadCount)}{" "}
                  {s.stage.leadCount === 1
                    ? t("common.leadSingular")
                    : t("common.leadPlural")}
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
                    {t("funnel.convShort")} {convText}
                    {tgtText
                      ? ` (${t("funnel.targetShort")} ${tgtText})`
                      : ""}{" "}
                    • {t("funnel.dropShort")} {dropText}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {selectedStageId && (
          <div
            ref={detailsRef}
            className={`mt-3 scroll-mt-24 rounded-xl border p-3 shadow-sm ${surface}`}
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
                      <div
                        className={`truncate text-sm font-extrabold ${
                          isDark ? "!text-slate-100" : "!text-slate-900"
                        }`}
                      >
                        {s.name}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isDark
                            ? "bg-indigo-500/15 !text-indigo-200"
                            : "bg-indigo-50 !text-indigo-700"
                        }`}
                      >
                        {t("funnel.stageBadge", {
                          current: i + 1,
                          total: stages.length,
                        })}
                      </span>
                    </div>

                    <div
                      className={`mt-0.5 text-[11px] ${
                        isDark ? "!text-slate-400" : "!text-slate-500"
                      }`}
                    >
                      {t("funnel.stageLeadCount", {
                        count: s.leadCount,
                      })}
                    </div>

                    {e && (
                      <div
                        className={`mt-1.5 text-[11px] ${
                          isDark ? "!text-slate-300" : "!text-slate-600"
                        }`}
                      >
                        {t("funnel.nextLabel")}{" "}
                        <span
                          className={`font-semibold ${
                            isDark ? "!text-slate-100" : "!text-slate-900"
                          }`}
                        >
                          {e.fromStageName} → {e.toStageName}
                        </span>{" "}
                        <span
                          className={
                            isDark ? "!text-slate-600" : "!text-slate-400"
                          }
                        >
                          •
                        </span>{" "}
                        <span className="font-semibold">{e.label}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div
                      className={`rounded-lg border px-2.5 py-2 ${softSurface}`}
                    >
                      <div className="text-[10px] opacity-80">
                        {t("funnel.conversion")}
                      </div>
                      <div
                        className={`text-sm font-extrabold ${
                          isDark ? "!text-slate-100" : "!text-slate-900"
                        }`}
                      >
                        {fmtPct(e?.actualConversionRate ?? null)}
                      </div>
                      {normalizedTarget != null && (
                        <div className="text-[10px] opacity-80">
                          {t("funnel.targetLong", { value: normalizedTarget })}
                        </div>
                      )}
                    </div>

                    <div
                      className={`rounded-lg border px-2.5 py-2 ${softSurface}`}
                    >
                      <div className="text-[10px] opacity-80">
                        {t("funnel.dropOff")}
                      </div>
                      <div
                        className={`text-sm font-extrabold ${
                          isDark ? "!text-slate-100" : "!text-slate-900"
                        }`}
                      >
                        {e ? e.dropOffCount : "—"}
                      </div>
                      <div className="text-[10px] opacity-80">
                        {fmtPct(e?.dropOffRate ?? null)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectStageId(null)}
                      className={`cursor-pointer rounded-lg border px-2.5 py-2 text-[11px] font-semibold shadow-sm transition active:scale-[0.99] ${surface} ${
                        isDark ? "hover:!bg-slate-900/40" : "hover:!bg-slate-50"
                      }`}
                    >
                      {common("actions.clear")}
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
            className={`mt-4 scroll-mt-24 overflow-hidden rounded-xl border ${
              isDark ? "!border-slate-800" : "!border-slate-200"
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 ${
                isDark ? "!bg-slate-950" : "!bg-white"
              }`}
            >
              <div
                className={`text-sm font-semibold ${
                  isDark ? "!text-slate-100" : "!text-slate-900"
                }`}
              >
                {t("funnel.tableTitle")}
              </div>
            </div>

            <div className={isDark ? "!bg-slate-950" : "bg-slate-50/60"}>
              <div
                className={`grid grid-cols-12 gap-2 border-t px-3 py-2 text-[10px] font-semibold ${
                  isDark
                    ? "!border-slate-800 !text-slate-300"
                    : "!border-slate-200 !text-slate-600"
                }`}
              >
                <div className="col-span-4">{t("funnel.table.transition")}</div>
                <div className="col-span-3">{t("funnel.table.label")}</div>
                <div className="col-span-2 text-right">
                  {t("funnel.table.conversion")}
                </div>
                <div className="col-span-3 text-right">
                  {t("funnel.table.dropOff")}
                </div>
              </div>

              {edges.length === 0 ? (
                <div
                  className={`border-t px-3 py-3 text-[11px] ${
                    isDark
                      ? "!border-slate-800 !text-slate-300"
                      : "!border-slate-200 !text-slate-600"
                  }`}
                >
                  {t("funnel.table.empty")}
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
                        className={`grid w-full grid-cols-12 gap-2 border-t px-3 py-2.5 text-left text-[12px] transition ${
                          isDark ? "!border-slate-800" : "!border-slate-200"
                        } ${
                          isRowActive
                            ? isDark
                              ? "bg-indigo-500/10"
                              : "bg-indigo-50/60"
                            : isDark
                              ? `!bg-slate-950 ${rowHover}`
                              : `!bg-white ${rowHover}`
                        }`}
                      >
                        <div className="col-span-4 min-w-0">
                          <div
                            className={`truncate font-semibold ${
                              isDark ? "!text-slate-100" : "!text-slate-900"
                            }`}
                            title={`${e.fromStageName} → ${e.toStageName}`}
                          >
                            {e.fromStageName} → {e.toStageName}
                          </div>
                        </div>

                        <div className="col-span-3 min-w-0">
                          <div
                            className={`truncate ${
                              isDark ? "!text-slate-300" : "!text-slate-700"
                            }`}
                            title={safeLabel}
                          >
                            {safeLabel}
                          </div>
                        </div>

                        <div className="col-span-2 text-right">
                          <div
                            className={`font-semibold ${
                              isDark ? "!text-slate-100" : "!text-slate-900"
                            }`}
                          >
                            {fmtPct(e.actualConversionRate)}
                          </div>
                          {normalizedTarget != null && (
                            <div
                              className={`text-[10px] ${
                                isDark ? "!text-slate-400" : "!text-slate-500"
                              }`}
                            >
                              {t("funnel.targetLong", {
                                value: normalizedTarget,
                              })}
                            </div>
                          )}
                        </div>

                        <div className="col-span-3 text-right">
                          <div
                            className={`font-semibold ${
                              isDark ? "!text-slate-100" : "!text-slate-900"
                            }`}
                          >
                            {e.dropOffCount}{" "}
                            <span
                              className={`font-medium ${
                                isDark ? "!text-slate-400" : "!text-slate-500"
                              }`}
                            >
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

/* -------------------- main component -------------------- */

export default function DashboardClient() {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const BRAND = "#4f46e5";

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const pageText = isDark ? "!text-slate-200" : "!text-slate-900";
  const subText = isDark ? "!text-slate-400" : "!text-slate-600";

  const card = isDark
    ? "!border-slate-800 !bg-slate-950"
    : "!border-slate-200 !bg-white";

  const cardHover = isDark ? "hover:!bg-slate-900/30" : "hover:!bg-slate-50";

  const pill = isDark
    ? "!border-slate-800 !bg-slate-950 !text-slate-300"
    : "!border-slate-200 !bg-white !text-slate-600";

  const input = isDark
    ? "!border-slate-800 !bg-slate-950 !text-slate-200"
    : "!border-slate-200 !bg-white !text-slate-700";

  const dashedEmpty = isDark
    ? "!border-slate-800 !bg-slate-950 !text-slate-400"
    : "!border-slate-200 !bg-slate-50 !text-slate-600";

  const badgeSoft = isDark
    ? "!bg-slate-900/60 !text-slate-200"
    : "!bg-slate-100 !text-slate-700";

  const badgeIndigo = isDark
    ? "bg-indigo-500/15 !text-indigo-200"
    : "bg-indigo-50 !text-indigo-700";

  const linkIndigo = isDark
    ? "!text-indigo-300 hover:!text-indigo-200"
    : "!text-indigo-600 hover:!text-indigo-700";

  const gridStroke = isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.10)";
  const axisStroke = isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.12)";
  const tickFill = isDark ? "rgba(226,232,240,0.70)" : "rgba(15,23,42,0.60)";

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
    if (sessionErr || !accessToken) throw new Error(t("errors.unauthorized"));
    return crmLocaleFetch(url, {
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
        throw new Error(
          text || t("errors.requestFailed", { status: res.status }),
        );
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
        setError(String(e?.message ?? t("errors.failedToLoad")));
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

    let tmr: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (tmr) clearTimeout(tmr);
      tmr = setTimeout(() => {
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
      if (tmr) clearTimeout(tmr);
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
    return scope === "team" ? t("filters.scopeTeam") : t("filters.scopeMe");
  }, [data, scope, t]);

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
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className={`text-xl font-semibold ${pageText}`}>
              {t("page.title")}
            </h1>
            <p className={`mt-0.5 text-sm ${subText}`}>{t("page.subtitle")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm ${pill}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  refreshing ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
              <span
                className={`font-semibold ${
                  isDark ? "!text-slate-100" : "!text-slate-800"
                }`}
              >
                {refreshing ? t("status.updating") : t("status.live")}
              </span>
              {data && (
                <>
                  <span
                    className={`mx-2 ${
                      isDark ? "!text-slate-700" : "!text-slate-300"
                    }`}
                  >
                    •
                  </span>
                  <span
                    className={`font-semibold ${
                      isDark ? "!text-slate-100" : "!text-slate-800"
                    }`}
                  >
                    {visibilityLabel}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className={`h-9 rounded-lg border px-2 text-[12px] font-semibold shadow-sm outline-none cursor-pointer ${input}`}
              >
                <option value="team">{t("filters.team")}</option>
                <option value="me">{t("filters.me")}</option>
              </select>

              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className={`h-9 rounded-lg border px-2 text-[12px] font-semibold shadow-sm outline-none cursor-pointer ${input}`}
              >
                <option value={30}>{t("filters.days30")}</option>
                <option value={90}>{t("filters.days90")}</option>
                <option value={120}>{t("filters.days120")}</option>
              </select>

              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as Bucket)}
                className={`h-9 rounded-lg border px-2 text-[12px] font-semibold shadow-sm outline-none cursor-pointer ${input}`}
              >
                <option value="day">{t("filters.daily")}</option>
                <option value="week">{t("filters.weekly")}</option>
                <option value="month">{t("filters.monthly")}</option>
              </select>

              <button
                type="button"
                onClick={() => fetchOverview({ silent: false })}
                className={`h-9 rounded-lg border px-3 text-[12px] font-semibold shadow-sm cursor-pointer ${input} ${
                  isDark ? "hover:!bg-slate-900/40" : "hover:!bg-slate-50"
                }`}
              >
                {common("actions.refresh")}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
              isDark
                ? "border-rose-900/40 bg-rose-500/10 !text-rose-200"
                : "border-rose-200 bg-rose-50 !text-rose-800"
            }`}
          >
            {error}
          </div>
        )}
      </div>

      {loading && (
        <div className="relative">
          <DashboardSkeleton isDark={isDark} />
          <MiniLoadingOverlay label={t("loading.dashboard")} isDark={isDark} />
        </div>
      )}

      {data && !error && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard
            isDark={isDark}
            label={t("kpis.leads")}
            value={compactNumber(data.kpis.leads_total)}
          />
          <StatCard
            isDark={isDark}
            label={t("kpis.newLeads7d")}
            value={compactNumber(data.kpis.leads_new_7d)}
            sub={t("kpis.last30d", {
              value: compactNumber(data.kpis.leads_new_30d),
            })}
          />
          <StatCard
            isDark={isDark}
            label={t("kpis.messagesSent7d")}
            value={compactNumber(data.kpis.messages_sent_7d)}
            sub={t("kpis.last30d", {
              value: compactNumber(data.kpis.messages_sent_30d),
            })}
          />
          <StatCard
            isDark={isDark}
            label={t("kpis.bookings7d")}
            value={compactNumber(data.kpis.bookings_7d)}
            sub={t("kpis.last30d", {
              value: compactNumber(data.kpis.bookings_30d),
            })}
          />
          <StatCard
            isDark={isDark}
            label={t("kpis.showRate30d")}
            value={fmtPct(data.kpis.show_rate_30d)}
            sub={t("kpis.basedOnOutcomes")}
            tone={
              data.kpis.show_rate_30d != null && data.kpis.show_rate_30d >= 70
                ? "good"
                : "default"
            }
          />
          <StatCard
            isDark={isDark}
            label={t("kpis.closeRate30d")}
            value={fmtPct(data.kpis.close_rate_30d)}
            sub={t("kpis.basedOnOutcomes")}
            tone={
              data.kpis.close_rate_30d != null && data.kpis.close_rate_30d >= 20
                ? "good"
                : "default"
            }
          />
        </div>
      )}

      {data && !error && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
              <SectionHeader
                isDark={isDark}
                title={t("funnel.title")}
                subtitle={
                  stageCount < 2
                    ? t("funnel.subtitleNeedStages")
                    : t("funnel.subtitleInteractive")
                }
                right={
                  stageCount < 2 ? (
                    <Link
                      href="/settings/pipeline-stages"
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-indigo-700"
                    >
                      {t("funnel.configureStages")}
                    </Link>
                  ) : null
                }
              />

              {stageCount === 0 ? (
                <div
                  className={`rounded-xl border border-dashed px-4 py-6 text-sm ${dashedEmpty}`}
                >
                  {t("funnel.noStages")}
                </div>
              ) : stageCount === 1 ? (
                <div
                  className={`rounded-xl border px-4 py-6 text-sm ${
                    isDark
                      ? "!border-slate-800 !bg-slate-900/30 !text-slate-300"
                      : "!border-slate-200 !bg-slate-50 !text-slate-700"
                  }`}
                >
                  {t.rich("funnel.onlyOneStage", {
                    count: 1,
                    strong: (chunks) => (
                      <span className="font-semibold">{chunks}</span>
                    ),
                  })}
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
                  isDark={isDark}
                />
              )}

              {stageCount >= 2 && (
                <div
                  className={`mt-3 rounded-xl border p-3 text-[11px] ${
                    isDark
                      ? "!border-slate-800 !bg-slate-900/30 !text-slate-300"
                      : "!border-slate-200 !bg-slate-50 !text-slate-700"
                  }`}
                >
                  <span className="font-semibold">
                    {t("funnel.overallConversionLabel")}
                  </span>{" "}
                  <span
                    className={`font-extrabold ${
                      isDark ? "!text-slate-100" : "!text-slate-900"
                    }`}
                  >
                    {fmtPct(insights.overallConv)}
                  </span>
                  {insights.worstEdge && (
                    <>
                      <span
                        className={`mx-2 ${
                          isDark ? "!text-slate-700" : "!text-slate-300"
                        }`}
                      >
                        •
                      </span>
                      <span className="font-semibold">
                        {t("funnel.biggestDropLabel")}
                      </span>{" "}
                      <span
                        className={`font-extrabold ${
                          isDark ? "!text-slate-100" : "!text-slate-900"
                        }`}
                      >
                        {insights.worstEdge.fromStageName} →{" "}
                        {insights.worstEdge.toStageName}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
              <SectionHeader
                isDark={isDark}
                title={t("activity.title")}
                subtitle={t("activity.subtitle", {
                  leads: totals.leads,
                  messages: totals.msgs,
                })}
              />

              {!activitySeries.length ? (
                <div
                  className={`rounded-xl border border-dashed px-4 py-8 text-sm ${dashedEmpty}`}
                >
                  {t("activity.empty")}
                </div>
              ) : (
                <div className={`rounded-xl border p-3 ${card}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${pill}`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: BRAND }}
                      />
                      {t("activity.legendLeads")}
                    </div>
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${pill}`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: "rgba(79,70,229,0.45)" }}
                      />
                      {t("activity.legendMessages")}
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
                          stroke={gridStroke}
                        />
                        <XAxis
                          dataKey="bucket_start"
                          tickFormatter={(v: string) =>
                            fmtBucketLabel(String(v), bucket)
                          }
                          minTickGap={18}
                          tick={{ fontSize: 11, fill: tickFill }}
                          axisLine={{ stroke: axisStroke }}
                          tickLine={{ stroke: axisStroke }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickFormatter={(v: number) => formatYAxisTick(v)}
                          tick={{ fontSize: 11, fill: tickFill }}
                          axisLine={{ stroke: axisStroke }}
                          tickLine={{ stroke: axisStroke }}
                        />
                        <Tooltip
                          content={(props) => (
                            <ActivityTooltip
                              {...props}
                              bucket={bucket}
                              isDark={isDark}
                            />
                          )}
                        />
                        <Legend wrapperStyle={{ display: "none" }} />
                        <Line
                          type="monotone"
                          dataKey="leads_created"
                          name={t("activity.legendLeads")}
                          stroke={BRAND}
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="messages_sent"
                          name={t("activity.legendMessages")}
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

                  <div
                    className={`mt-3 text-[10px] ${
                      isDark ? "!text-slate-400" : "!text-slate-500"
                    }`}
                  >
                    {t("activity.tip")}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
              <SectionHeader
                isDark={isDark}
                title={t("attention.title")}
                subtitle={t("attention.subtitle")}
                right={
                  <Link
                    href="/pipeline"
                    className={`text-[12px] font-semibold hover:underline ${linkIndigo}`}
                  >
                    {t("attention.openPipeline")}
                  </Link>
                }
              />

              {data.panels.needs_attention.length === 0 ? (
                <div
                  className={`rounded-xl border border-dashed px-4 py-6 text-sm ${dashedEmpty}`}
                >
                  {t("attention.empty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.panels.needs_attention.map((l) => (
                    <div
                      key={l.id}
                      className={`rounded-xl border px-3 py-2 ${card} ${cardHover}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={`truncate text-[12px] font-semibold ${
                              isDark ? "!text-slate-100" : "!text-slate-900"
                            }`}
                          >
                            {l.name || t("attention.unnamedLead")}
                          </div>
                          <div
                            className={`mt-0.5 text-[11px] ${
                              isDark ? "!text-slate-400" : "!text-slate-500"
                            }`}
                          >
                            {t("attention.stageLabel")}{" "}
                            <span
                              className={`font-semibold ${
                                isDark ? "!text-slate-200" : "!text-slate-700"
                              }`}
                            >
                              {l.stage || "—"}
                            </span>
                            {l.last_activity_at && (
                              <>
                                <span
                                  className={`mx-2 ${
                                    isDark
                                      ? "!text-slate-700"
                                      : "!text-slate-300"
                                  }`}
                                >
                                  •
                                </span>
                                {t("attention.lastActivityLabel")}{" "}
                                {fmtDateTime(l.last_activity_at)}
                              </>
                            )}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${badgeIndigo}`}
                        >
                          {l.score == null
                            ? "—"
                            : t("attention.score", { score: l.score })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
              <SectionHeader
                isDark={isDark}
                title={t("bookings.title")}
                subtitle={t("bookings.subtitle")}
              />

              {data.panels.upcoming_bookings.length === 0 ? (
                <div
                  className={`rounded-xl border border-dashed px-4 py-6 text-sm ${dashedEmpty}`}
                >
                  {t("bookings.empty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.panels.upcoming_bookings.map((b) => (
                    <div
                      key={b.id}
                      className={`rounded-xl border px-3 py-2 ${card} ${cardHover}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={`truncate text-[12px] font-semibold ${
                              isDark ? "!text-slate-100" : "!text-slate-900"
                            }`}
                          >
                            {b.invitee_first_name
                              ? `${b.invitee_first_name}`
                              : t("bookings.bookingFallback")}
                            {b.invitee_email ? ` · ${b.invitee_email}` : ""}
                          </div>
                          <div
                            className={`mt-0.5 text-[11px] ${
                              isDark ? "!text-slate-400" : "!text-slate-500"
                            }`}
                          >
                            {fmtDateTime(b.start_at)}
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeSoft}`}
                        >
                          {t("bookings.scheduled")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
              <SectionHeader
                isDark={isDark}
                title={t("feed.title")}
                subtitle={t("feed.subtitle")}
              />

              {data.panels.feed.length === 0 ? (
                <div
                  className={`rounded-xl border border-dashed px-4 py-6 text-sm ${dashedEmpty}`}
                >
                  {t("feed.empty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {data.panels.feed.map((e, idx) => (
                    <div
                      key={`${e.type}-${idx}`}
                      className={`rounded-xl border px-3 py-2 ${card}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className={`truncate text-[12px] font-semibold ${
                              isDark ? "!text-slate-100" : "!text-slate-900"
                            }`}
                          >
                            {e.label}
                          </div>
                          <div
                            className={`mt-0.5 text-[11px] ${
                              isDark ? "!text-slate-400" : "!text-slate-500"
                            }`}
                          >
                            {fmtDateTime(e.at)}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeSoft}`}
                        >
                          {e.type === "lead_created"
                            ? t("feed.types.lead")
                            : e.type === "booking"
                              ? t("feed.types.booking")
                              : t("feed.types.message")}
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
