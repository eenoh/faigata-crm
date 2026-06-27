import type { ReactNode } from "react";
import { fmtBucketLabel } from "@/features/crm/components/dashboard/helpers";
import type { ActivityTooltipProps } from "@/features/crm/components/dashboard/types";

export function ActivityTooltip({
  active,
  payload,
  label,
  bucket,
  isDark,
}: ActivityTooltipProps) {
  if (!active || !payload?.length || label == null) return null;

  const leadsRaw = payload.find((item) => String(item.dataKey) === "leads_created")?.value;
  const messagesRaw = payload.find((item) => String(item.dataKey) === "messages_sent")?.value;
  const leads = Number(leadsRaw ?? 0);
  const messages = Number(messagesRaw ?? 0);

  const shell = isDark
    ? "!border-slate-800 !bg-slate-950/95 !text-slate-200"
    : "!border-slate-200 !bg-white/95 !text-slate-600";
  const titleCls = isDark ? "!text-slate-100" : "!text-slate-900";
  const valueCls = isDark ? "!text-slate-100" : "!text-slate-900";

  return (
    <div className={`rounded-xl border px-3 py-2 shadow-lg backdrop-blur ${shell}`}>
      <div className={`text-[11px] font-semibold ${titleCls}`}>
        {fmtBucketLabel(String(label), bucket)}
      </div>
      <div
        className={`mt-1 grid gap-1 text-[11px] ${
          isDark ? "!text-slate-300" : "!text-slate-600"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: "#4f46e5" }} />
            <span>Leads added</span>
          </div>
          <span className={`font-semibold ${valueCls}`}>{leads}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "rgba(79,70,229,0.45)" }}
            />
            <span>Messages sent</span>
          </div>
          <span className={`font-semibold ${valueCls}`}>{messages}</span>
        </div>
      </div>
    </div>
  );
}

export function MiniLoadingOverlay({
  label = "Loading",
  isDark,
}: {
  label?: string;
  isDark: boolean;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div
        className={`absolute inset-0 backdrop-blur-md ${
          isDark ? "!bg-slate-950/40" : "!bg-white/40"
        }`}
      />
      <div
        className={`relative z-10 rounded-2xl border backdrop-blur-xl px-10 py-8 shadow-xl ${
          isDark
            ? "!border-slate-800 !bg-slate-950/80"
            : "!border-slate-200 !bg-white/80"
        }`}
      >
        <div className="flex items-end justify-center gap-2">
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.1s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce" />
        </div>
        <p
          className={`mt-4 text-center text-sm font-semibold ${
            isDark ? "!text-slate-200" : "!text-slate-700"
          }`}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

export function SkeletonBlock({
  className = "",
  isDark,
}: {
  className?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg ${
        isDark ? "bg-slate-800/70" : "bg-slate-100"
      } ${className}`}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "!border-slate-800 !bg-slate-950"
    : "!border-slate-200 !bg-white";
  const soft = isDark
    ? "!border-slate-800 !bg-slate-900/30"
    : "!border-slate-200 !bg-slate-50";

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <SkeletonBlock isDark={isDark} className="h-6 w-40" />
            <SkeletonBlock isDark={isDark} className="mt-2 h-4 w-80 max-w-full" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock isDark={isDark} className="h-9 w-40 rounded-lg" />
            <div className="flex items-center gap-2">
              <SkeletonBlock isDark={isDark} className="h-9 w-28 rounded-lg" />
              <SkeletonBlock isDark={isDark} className="h-9 w-28 rounded-lg" />
              <SkeletonBlock isDark={isDark} className="h-9 w-28 rounded-lg" />
              <SkeletonBlock isDark={isDark} className="h-9 w-24 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className={`rounded-xl border p-3 shadow-sm ${card}`}>
            <SkeletonBlock isDark={isDark} className="h-3 w-20" />
            <SkeletonBlock isDark={isDark} className="mt-2 h-7 w-24" />
            <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <SkeletonBlock isDark={isDark} className="h-4 w-32" />
                <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-64" />
              </div>
              <SkeletonBlock isDark={isDark} className="h-9 w-40 rounded-lg" />
            </div>
            <div className={`rounded-xl border p-4 ${soft}`}>
              <SkeletonBlock isDark={isDark} className="h-6 w-48" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBlock key={index} isDark={isDark} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 shadow-sm ${card}`}>
            <SkeletonBlock isDark={isDark} className="h-4 w-24" />
            <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-80 max-w-full" />
            <div className={`mt-4 rounded-xl border p-3 ${card}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SkeletonBlock isDark={isDark} className="h-7 w-28 rounded-full" />
                <SkeletonBlock isDark={isDark} className="h-7 w-32 rounded-full" />
              </div>
              <div className={`h-[280px] rounded-lg border ${soft}`}>
                <div className="p-4">
                  <SkeletonBlock isDark={isDark} className="h-4 w-56" />
                  <SkeletonBlock isDark={isDark} className="mt-3 h-4 w-72" />
                  <SkeletonBlock isDark={isDark} className="mt-3 h-4 w-64" />
                </div>
              </div>
              <SkeletonBlock isDark={isDark} className="mt-3 h-3 w-72 max-w-full" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, panelIdx) => (
            <div key={panelIdx} className={`rounded-2xl border p-4 shadow-sm ${card}`}>
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <SkeletonBlock isDark={isDark} className="h-4 w-36" />
                  <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-52" />
                </div>
                <SkeletonBlock isDark={isDark} className="h-4 w-20" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((__, rowIdx) => (
                  <div key={rowIdx} className={`rounded-xl border px-3 py-2 ${card}`}>
                    <SkeletonBlock isDark={isDark} className="h-4 w-44" />
                    <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-64" />
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

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  isDark,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
  isDark: boolean;
}) {
  const ring =
    tone === "good"
      ? isDark
        ? "!border-emerald-900/40 !bg-emerald-500/10"
        : "!border-emerald-200 !bg-emerald-50"
      : tone === "warn"
        ? isDark
          ? "!border-amber-900/40 !bg-amber-500/10"
          : "!border-amber-200 !bg-amber-50"
        : isDark
          ? "!border-slate-800 !bg-slate-950"
          : "!border-slate-200 !bg-white";

  return (
    <div className={`rounded-xl border ${ring} p-3 shadow-sm`}>
      <div
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          isDark ? "!text-slate-400" : "!text-slate-500"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-extrabold ${
          isDark ? "!text-slate-100" : "!text-slate-900"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`mt-1 text-[11px] ${
            isDark ? "!text-slate-300" : "!text-slate-600"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
  isDark,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  isDark: boolean;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <div
          className={`text-sm font-semibold ${
            isDark ? "!text-slate-100" : "!text-slate-900"
          }`}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className={`mt-0.5 text-[11px] ${
              isDark ? "!text-slate-400" : "!text-slate-500"
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
