import type { Bucket } from "@/features/crm/components/dashboard/types";

export function fmtPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value}%`;
}

export function normalizePercent(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  if (value > 0 && value < 1) return Math.round(value * 100);
  return value;
}

export function fmtDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function compactNumber(value: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

export function fmtBucketLabel(iso: string, bucket: Bucket) {
  const date = new Date(iso);
  if (bucket === "month") {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

export function formatYAxisTick(value: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function indigoFill(value: number) {
  const eased = easeOutCubic(clamp(value, 0, 1));
  return `hsl(231 78% ${93 - eased * 38}%)`;
}

export function indigoShadowBand(value: number) {
  const eased = easeOutCubic(clamp(value, 0, 1));
  return `hsl(231 82% ${88 - eased * 44}%)`;
}

export function textColorFor(value: number) {
  return value >= 0.62 ? "rgba(255,255,255,0.98)" : "rgba(15,23,42,0.92)";
}

export function subTextColorFor(value: number) {
  return value >= 0.62 ? "rgba(255,255,255,0.86)" : "rgba(15,23,42,0.72)";
}
