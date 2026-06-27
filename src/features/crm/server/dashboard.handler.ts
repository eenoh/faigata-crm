import { NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { applyEntityTranslations } from "@/features/crm/server/custom-value-translations";
import {
  buildCrmLeadScopeApplier,
  buildCrmMessageScopeApplier,
  isDashboardBucket,
  isDashboardScope,
  loadRecentCrmLeadsWithFallback,
  type DashboardBucket,
  type DashboardScope,
} from "@/features/crm/server/dashboard-shared";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import {
  resolveCrmTeamContext,
  type CrmRole,
} from "@/features/crm/server/team-context";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";

export const runtime = "nodejs";

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
  label: string;
  targetRate: number | null;
  actualConversionRate: number | null;
  dropOffCount: number;
  dropOffRate: number | null;
};

type DashboardActivityRow = Record<string, unknown>;

type PipelineStageRow = {
  id: string;
  team_id: string;
  name: string;
  position: number;
};

type ConversionMetricRow = {
  id: string;
  team_id: string;
  label: string | null;
  from_stage_id: string;
  to_stage_id: string;
  position: number;
  target_rate: number | null;
};

type LeadRow = {
  id: string;
  team_id: string;
  stage_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  created_at: string;
  score: number | null;
  lead_name: string | null;
  name: string | null;
};

type LeadMessageRow = {
  id: string;
  team_id: string;
  lead_id: string;
  sender_profile_id: string | null;
  direction: string | null;
  channel: string | null;
  sent_at: string | null;
};

type BookingRow = {
  id: string;
  team_id: string;
  lead_id: string | null;
  invitee_first_name: string | null;
  invitee_email: string | null;
  booking_link_id: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
};

type BookingOutcomeRow = {
  id: string;
  team_id: string;
  closer_user_id: string | null;
  attended_status: string | null;
  closed_on_call: boolean | null;
  created_at: string | null;
};

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function loadRecentLeadsWithFallback(args: {
  admin: ReturnType<typeof getCrmAdminClient>;
  applyLeadScope: (query: any) => any;
}) {
  try {
    return await loadRecentCrmLeadsWithFallback(args);
  } catch (error) {
    const wrapped = new Error("recent_leads_failed");
    (wrapped as { details?: unknown }).details =
      error ?? "recent_leads_select_failed";
    throw wrapped;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bucketRaw = String(url.searchParams.get("bucket") || "week").trim();
    const daysRaw = Number(url.searchParams.get("days") || "120");
    const scopeRaw = String(url.searchParams.get("scope") || "team").trim();

    if (!isDashboardBucket(bucketRaw)) {
      return jsonError("invalid_bucket", 400);
    }
    if (!Number.isFinite(daysRaw) || daysRaw < 7 || daysRaw > 365) {
      return jsonError("invalid_days", 400);
    }
    if (!isDashboardScope(scopeRaw)) {
      return jsonError("invalid_scope", 400);
    }

    const bucket = bucketRaw as DashboardBucket;
    const days = daysRaw;
    const requestedScope = scopeRaw as DashboardScope;

    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(req, admin);
    if (!auth.ok) {
      return jsonError(auth.reason, 401, auth.detail);
    }

    const { teamId, roles, isManagerOrAdmin } = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request: req,
    });
    const locale = await resolveRequestLocale({
      request: req,
      admin,
      userId: auth.userId,
    });
    const role: CrmRole = roles[0] ?? "member";
    const effectiveScope: DashboardScope = isManagerOrAdmin
      ? requestedScope
      : "me";

    const now = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const from7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const applyLeadScope = buildCrmLeadScopeApplier({
      teamId,
      userId: auth.userId,
      scope: effectiveScope,
    });
    const applyMessageScope = buildCrmMessageScopeApplier({
      teamId,
      userId: auth.userId,
      scope: effectiveScope,
    });

    const [stagesRes, metricsRes] = await Promise.all([
      admin
        .from("pipeline_stages")
        .select("id, team_id, name, position")
        .eq("team_id", teamId)
        .order("position", { ascending: true }),
      admin
        .from("conversion_metrics")
        .select(
          "id, team_id, label, from_stage_id, to_stage_id, position, target_rate",
        )
        .eq("team_id", teamId)
        .order("position", { ascending: true }),
    ]);

    if (stagesRes.error) {
      return jsonError("stages_load_failed", 500, stagesRes.error);
    }
    if (metricsRes.error) {
      return jsonError("metrics_load_failed", 500, metricsRes.error);
    }

    const stages: PipelineStageRow[] = Array.isArray(stagesRes.data)
      ? (stagesRes.data as PipelineStageRow[])
      : [];
    const metrics: ConversionMetricRow[] = Array.isArray(metricsRes.data)
      ? (metricsRes.data as ConversionMetricRow[])
      : [];

    await applyEntityTranslations({
      admin,
      teamId,
      entityTable: "pipeline_stages",
      rows: stages,
      requestedLocale: locale,
      fields: [
        {
          fieldKey: "name",
          sourceText: (row) => row.name,
          assign: (row, value) => {
            row.name = value;
          },
        },
      ],
    });

    await applyEntityTranslations({
      admin,
      teamId,
      entityTable: "conversion_metrics",
      rows: metrics,
      requestedLocale: locale,
      fields: [
        {
          fieldKey: "label",
          sourceText: (row) => row.label ?? "",
          assign: (row, value) => {
            row.label = value;
          },
        },
      ],
    });

    const stageIdToName = new Map<string, string>();
    for (const stage of stages) {
      stageIdToName.set(String(stage.id), String(stage.name));
    }

    const funnelPromise = (async () => {
      const { data, error } = await applyLeadScope(
        admin.from("leads").select("id, team_id, stage_id, setter_id, closer_id"),
      );

      if (error) {
        throw new Error("leads_load_failed");
      }

      const safeLeads = Array.isArray(data)
        ? (data as Pick<LeadRow, "id" | "stage_id" | "setter_id" | "closer_id">[])
        : [];

      const stageIdToCount = new Map<string, number>();
      for (const lead of safeLeads) {
        const stageId = lead.stage_id ? String(lead.stage_id) : "";
        if (!stageId) {
          continue;
        }
        stageIdToCount.set(stageId, (stageIdToCount.get(stageId) ?? 0) + 1);
      }

      const funnelStages: FunnelStage[] = stages.map((stage) => ({
        id: String(stage.id),
        name: String(stage.name),
        position: stage.position ?? null,
        leadCount: stageIdToCount.get(String(stage.id)) ?? 0,
      }));

      const metricByPair = new Map<
        string,
        { label: string; targetRate: number | null }
      >();
      for (const metric of metrics) {
        metricByPair.set(`${metric.from_stage_id}__${metric.to_stage_id}`, {
          label: String(metric.label ?? ""),
          targetRate:
            metric.target_rate == null ? null : Number(metric.target_rate),
        });
      }

      const edges: FunnelEdge[] = [];
      for (let index = 0; index < funnelStages.length - 1; index += 1) {
        const fromStage = funnelStages[index];
        const toStage = funnelStages[index + 1];
        const fromCount = fromStage.leadCount;
        const toCount = toStage.leadCount;
        const metric = metricByPair.get(`${fromStage.id}__${toStage.id}`);
        const label = metric?.label?.trim()
          ? metric.label.trim()
          : `${fromStage.name} -> ${toStage.name}`;
        const actualConversionRate =
          fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : null;
        const dropOffCount = Math.max(0, fromCount - toCount);
        const dropOffRate =
          fromCount > 0
            ? Math.round(((fromCount - toCount) / fromCount) * 1000) / 10
            : null;

        edges.push({
          fromStageId: fromStage.id,
          toStageId: toStage.id,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
          label,
          targetRate: metric?.targetRate ?? null,
          actualConversionRate,
          dropOffCount,
          dropOffRate,
        });
      }

      return {
        leadTotal: safeLeads.length,
        stages: funnelStages,
        edges,
      };
    })();

    const activityPromise = (async () => {
      const { data, error } = await (admin as any).rpc(
        "dashboard_activity_series",
        {
          p_team_id: teamId,
          p_user_id: auth.userId,
          p_bucket: bucket,
          p_from: from.toISOString(),
          p_to: now.toISOString(),
        },
      );

      if (error) {
        return {
          ok: false,
          bucket,
          from: from.toISOString(),
          to: now.toISOString(),
          series: [] as DashboardActivityRow[],
        };
      }

      return {
        ok: true,
        bucket,
        from: from.toISOString(),
        to: now.toISOString(),
        series: Array.isArray(data) ? (data as DashboardActivityRow[]) : [],
      };
    })();

    const kpisPromise = (async () => {
      const { count: leadsTotal, error: leadsTotalError } = await applyLeadScope(
        admin.from("leads").select("id", { count: "exact", head: true }),
      );
      if (leadsTotalError) {
        throw new Error("kpi_leads_total_failed");
      }

      const [{ count: leadsNew7d }, { count: leadsNew30d }] = await Promise.all([
        applyLeadScope(
          admin
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("created_at", from7.toISOString()),
        ),
        applyLeadScope(
          admin
            .from("leads")
            .select("id", { count: "exact", head: true })
            .gte("created_at", from30.toISOString()),
        ),
      ]);

      const [{ count: messagesSent7d }, { count: messagesSent30d }] =
        await Promise.all([
          applyMessageScope(
            admin
              .from("lead_messages")
              .select("id", { count: "exact", head: true })
              .gte("sent_at", from7.toISOString())
              .eq("direction", "outbound")
              .neq("channel", "pipeline"),
          ),
          applyMessageScope(
            admin
              .from("lead_messages")
              .select("id", { count: "exact", head: true })
              .gte("sent_at", from30.toISOString())
              .eq("direction", "outbound")
              .neq("channel", "pipeline"),
          ),
        ]);

      const [{ count: bookings7d }, { count: bookings30d }] = await Promise.all([
        admin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .gte("created_at", from7.toISOString()),
        admin
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .gte("created_at", from30.toISOString()),
      ]);

      let outcomesQuery: any = admin
        .from("booking_outcomes")
        .select("attended_status, closed_on_call, closer_user_id")
        .eq("team_id", teamId)
        .gte("created_at", from30.toISOString());

      if (effectiveScope === "me") {
        outcomesQuery = outcomesQuery.eq("closer_user_id", auth.userId);
      }

      const { data: outcomes, error: outcomesError } = await outcomesQuery;
      if (outcomesError) {
        throw new Error("kpi_outcomes_failed");
      }

      const rows: Pick<BookingOutcomeRow, "attended_status" | "closed_on_call">[] =
        Array.isArray(outcomes)
          ? (outcomes as Pick<
              BookingOutcomeRow,
              "attended_status" | "closed_on_call"
            >[])
          : [];

      const totalOutcomes = rows.length;
      const showed = rows.filter(
        (row) => String(row.attended_status ?? "") === "showed",
      ).length;
      const closed = rows.filter((row) => Boolean(row.closed_on_call)).length;

      return {
        leads_total: leadsTotal ?? 0,
        leads_new_7d: leadsNew7d ?? 0,
        leads_new_30d: leadsNew30d ?? 0,
        messages_sent_7d: messagesSent7d ?? 0,
        messages_sent_30d: messagesSent30d ?? 0,
        bookings_7d: bookings7d ?? 0,
        bookings_30d: bookings30d ?? 0,
        show_rate_30d:
          totalOutcomes > 0 ? Math.round((showed / totalOutcomes) * 1000) / 10 : null,
        close_rate_30d:
          totalOutcomes > 0 ? Math.round((closed / totalOutcomes) * 1000) / 10 : null,
      };
    })();

    const panelsPromise = (async () => {
      const to14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const { data: upcomingRaw, error: upcomingError } = await admin
        .from("bookings")
        .select(
          "id, start_at, end_at, lead_id, invitee_first_name, invitee_email, booking_link_id",
        )
        .eq("team_id", teamId)
        .gte("start_at", now.toISOString())
        .lte("start_at", to14.toISOString())
        .order("start_at", { ascending: true })
        .limit(12);

      if (upcomingError) {
        throw new Error("upcoming_bookings_failed");
      }

      const upcomingRows: Partial<BookingRow>[] = Array.isArray(upcomingRaw)
        ? (upcomingRaw as Partial<BookingRow>[])
        : [];
      const upcoming = upcomingRows
        .filter((booking) => Boolean(booking.start_at))
        .map((booking) => ({
          id: String(booking.id ?? ""),
          start_at: String(booking.start_at),
          end_at: booking.end_at ? String(booking.end_at) : null,
          lead_id: booking.lead_id ? String(booking.lead_id) : null,
          invitee_first_name: booking.invitee_first_name ?? null,
          invitee_email: booking.invitee_email ?? null,
          booking_link_id: booking.booking_link_id
            ? String(booking.booking_link_id)
            : null,
        }));

      const recentLeadResult = await loadRecentLeadsWithFallback({
        admin,
        applyLeadScope,
      });
      const normalizedRecent = recentLeadResult.data.map((lead: any) => {
        const stageId = lead.stage_id ? String(lead.stage_id) : null;
        const stageName = stageId ? stageIdToName.get(stageId) ?? null : null;

        return {
          id: String(lead.id ?? ""),
          name: (lead.lead_name ?? lead.name ?? null) as string | null,
          stage_id: stageId,
          stage_name: stageName,
          stage: stageName,
          created_at: String(lead.created_at ?? ""),
          score: lead.score == null ? null : Number(lead.score),
        };
      });

      const leadIds = normalizedRecent.map((lead) => lead.id).filter(Boolean);
      const { data: messageRowsRaw } = await admin
        .from("lead_messages")
        .select("lead_id, sent_at")
        .eq("team_id", teamId)
        .in(
          "lead_id",
          leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"],
        )
        .order("sent_at", { ascending: false })
        .limit(200);

      const messageRows: Pick<LeadMessageRow, "lead_id" | "sent_at">[] =
        Array.isArray(messageRowsRaw)
          ? (messageRowsRaw as Pick<LeadMessageRow, "lead_id" | "sent_at">[])
          : [];

      const lastByLead = new Map<string, string>();
      for (const message of messageRows) {
        const leadId = String(message.lead_id ?? "");
        if (leadId && !lastByLead.has(leadId)) {
          lastByLead.set(leadId, String(message.sent_at ?? ""));
        }
      }

      const needsAttention = normalizedRecent
        .map((lead) => ({
          id: lead.id,
          name: lead.name ?? "Unnamed",
          stage: lead.stage_name ?? "-",
          score: lead.score ?? null,
          last_activity_at: lastByLead.get(lead.id) ?? null,
        }))
        .filter((lead) => {
          if (!lead.last_activity_at) {
            return true;
          }
          const timestamp = Date.parse(lead.last_activity_at);
          return !Number.isFinite(timestamp) || timestamp < Date.now() - 3 * 24 * 60 * 60 * 1000;
        })
        .sort((left, right) => Number(right.score ?? -1) - Number(left.score ?? -1))
        .slice(0, 6);

      const [feedMessagesRes, feedBookingsRes] = await Promise.all([
        admin
          .from("lead_messages")
          .select("id, lead_id, direction, channel, sent_at")
          .eq("team_id", teamId)
          .order("sent_at", { ascending: false })
          .limit(10),
        admin
          .from("bookings")
          .select("id, lead_id, invitee_email, start_at, created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const feed: Array<Record<string, unknown>> = [];
      for (const lead of normalizedRecent) {
        feed.push({
          type: "lead_created",
          at: lead.created_at,
          lead_id: lead.id,
          label: `Lead added: ${lead.name ?? "Unnamed"}`,
        });
      }

      for (const message of Array.isArray(feedMessagesRes.data)
        ? feedMessagesRes.data
        : []) {
        feed.push({
          type: "message",
          at: String((message as any).sent_at ?? ""),
          lead_id: (message as any).lead_id ?? null,
          label: `${(message as any).direction === "inbound" ? "Inbound" : "Outbound"} message`,
        });
      }

      for (const booking of Array.isArray(feedBookingsRes.data)
        ? feedBookingsRes.data
        : []) {
        feed.push({
          type: "booking",
          at: String((booking as any).created_at ?? ""),
          lead_id: (booking as any).lead_id ?? null,
          label: `Booking created (${(booking as any).invitee_email ?? "invitee"})`,
        });
      }

      feed.sort(
        (left, right) => Date.parse(String(right.at)) - Date.parse(String(left.at)),
      );

      return {
        upcoming_bookings: upcoming,
        recent_leads: normalizedRecent,
        needs_attention: needsAttention,
        feed: feed.slice(0, 20),
      };
    })();

    const [funnel, activity, kpis, panels] = await Promise.all([
      funnelPromise,
      activityPromise,
      kpisPromise,
      panelsPromise,
    ]);

    return NextResponse.json({
      ok: true,
      teamId,
      role,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      kpis,
      funnel,
      activity,
      panels,
    });
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (message === "missing_team_membership") {
      return jsonError(
        "missing_team",
        400,
        "User is not in any team_members row",
      );
    }
    if (message === "not_a_member_of_team") {
      return jsonError("forbidden", 403, "Not a member of requested teamId");
    }
    if (message === "select_failed" || message === "recent_leads_failed") {
      return jsonError(
        "recent_leads_failed",
        500,
        (error as { details?: unknown }).details ?? "unknown_recent_leads_error",
      );
    }

    console.error("[dashboard] unexpected:", error);
    return jsonError("unhandled_error", 500, message);
  }
}
