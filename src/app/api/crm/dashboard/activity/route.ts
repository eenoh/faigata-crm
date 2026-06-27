import { NextResponse } from "next/server";
import { getBearerToken } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import {
  resolveCrmTeamContext,
  type CrmRole,
} from "@/features/crm/server/team-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Bucket = "day" | "week" | "month";
type Scope = "team" | "me";
type Role = CrmRole;

const json = (data: any, status = 200) => NextResponse.json(data, { status });
const jsonError = (error: string, status = 500, details?: unknown) =>
  json({ error, details }, status);

const isBucket = (v: string): v is Bucket =>
  v === "day" || v === "week" || v === "month";
const isScope = (v: string): v is Scope => v === "team" || v === "me";

const isoRange = (days: number) => {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from, to, fromISO: from.toISOString(), toISO: to.toISOString() };
};

async function rpcWithFallback(admin: any, fn: string, argSets: any[]) {
  let lastErr: any = null;
  for (const args of argSets) {
    const { data, error } = await admin.rpc(fn, args);
    if (!error) return { ok: true as const, data: data ?? [] };
    lastErr = error;
  }
  return { ok: false as const, error: lastErr };
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError("missing_auth", 401);

    const url = new URL(req.url);
    const bucketRaw = String(url.searchParams.get("bucket") ?? "week").trim();
    const scopeRaw = String(url.searchParams.get("scope") ?? "team").trim();
    const days = Number(url.searchParams.get("days") ?? "120");

    if (!isBucket(bucketRaw)) return jsonError("invalid_bucket", 400);
    if (!isScope(scopeRaw)) return jsonError("invalid_scope", 400);
    if (!Number.isFinite(days) || days < 7 || days > 365) {
      return jsonError("invalid_days", 400);
    }

    const admin = getCrmAdminClient();

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    const userId = userRes?.user?.id ? String(userRes.user.id) : null;
    if (userErr || !userId) {
      return jsonError("invalid_session", 401, userErr?.message);
    }

    const { teamId, roles, isManagerOrAdmin } = await resolveCrmTeamContext({
      admin,
      userId,
      request: req,
    });

    const requestedScope: Scope = scopeRaw;
    const effectiveScope: Scope = isManagerOrAdmin ? requestedScope : "me";
    const { from, to, fromISO, toISO } = isoRange(days);

    const rpcRes = await rpcWithFallback(
      admin as any,
      "dashboard_activity_series",
      [
        {
          p_team_id: teamId,
          p_user_id: userId,
          p_bucket: bucketRaw,
          p_from: fromISO,
          p_to: toISO,
          p_scope: effectiveScope,
        },
        {
          p_team_id: teamId,
          p_user_id: userId,
          p_bucket: bucketRaw,
          p_from: fromISO,
          p_to: toISO,
        },
      ],
    );

    const base = {
      teamId,
      roles: roles as Role[],
      isManagerOrAdmin,
      scope: effectiveScope,
      bucket: bucketRaw as Bucket,
      from: from.toISOString(),
      to: to.toISOString(),
    };

    if (!rpcRes.ok) return json({ ok: false, ...base, series: [] });

    return json({ ok: true, ...base, series: rpcRes.data });
  } catch (e: any) {
    console.error("[dashboard-activity] unexpected:", e);
    return jsonError("unhandled_error", 500, String(e?.message ?? e));
  }
}

