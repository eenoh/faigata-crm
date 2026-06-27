import type { AppSupabaseClient } from "@/lib/supabase/types";

export type DashboardBucket = "day" | "week" | "month";
export type DashboardScope = "team" | "me";

export function isDashboardBucket(value: string): value is DashboardBucket {
  return value === "day" || value === "week" || value === "month";
}

export function isDashboardScope(value: string): value is DashboardScope {
  return value === "team" || value === "me";
}

export function buildCrmLeadScopeApplier(args: {
  teamId: string;
  userId: string;
  scope: DashboardScope;
}) {
  const { teamId, userId, scope } = args;

  return (query: any) => {
    let scoped = query.eq("team_id", teamId);

    if (scope === "me") {
      scoped = scoped.or(`setter_id.eq.${userId},closer_id.eq.${userId}`);
    }

    return scoped;
  };
}

export function buildCrmMessageScopeApplier(args: {
  teamId: string;
  userId: string;
  scope: DashboardScope;
}) {
  const { teamId, userId, scope } = args;

  return (query: any) => {
    let scoped = query.eq("team_id", teamId);

    if (scope === "me") {
      scoped = scoped.eq("sender_profile_id", userId);
    }

    return scoped;
  };
}

export async function selectWithFallback(
  buildQuery: (select: string) => Promise<{ data: unknown; error: unknown }>,
  selects: string[],
) {
  let lastError: unknown = null;

  for (const select of selects) {
    const { data, error } = await buildQuery(select);

    if (!error) {
      return {
        data: Array.isArray(data) ? data : [],
        usedSelect: select,
      };
    }

    lastError = error;
  }

  throw lastError ?? new Error("select_failed");
}

export async function loadRecentCrmLeadsWithFallback(args: {
  admin: AppSupabaseClient;
  applyLeadScope: (query: any) => any;
}) {
  const { admin, applyLeadScope } = args;

  return selectWithFallback(
    (select) =>
      applyLeadScope(
        admin
          .from("leads")
          .select(select)
          .order("created_at", { ascending: false })
          .limit(8),
      ),
    [
      "id, lead_name, stage_id, created_at, score",
      "id, lead_name, stage_id, created_at",
      "id, name, stage_id, created_at, score",
      "id, name, stage_id, created_at",
      "id, stage_id, created_at",
    ],
  );
}

export function normalizeDashboardTargetRate(value: unknown): number | null {
  if (value == null) return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  const asPercent = numeric > 0 && numeric < 1 ? numeric * 100 : numeric;
  return Math.round(Math.max(0, Math.min(100, asPercent)) * 10) / 10;
}

export function normalizeDashboardAttendance(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export const DASHBOARD_SHOW_ATTENDANCE_VALUES = new Set([
  "attended",
  "showed",
  "show",
]);
