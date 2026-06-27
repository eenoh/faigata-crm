import { NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { applyEntityTranslations } from "@/features/crm/server/custom-value-translations";
import {
  DASHBOARD_SHOW_ATTENDANCE_VALUES,
  buildCrmLeadScopeApplier,
  buildCrmMessageScopeApplier,
  isDashboardScope,
  normalizeDashboardAttendance,
  normalizeDashboardTargetRate,
  selectWithFallback,
  type DashboardScope,
} from "@/features/crm/server/dashboard-shared";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import { translateDynamicDisplayValuesBatch } from "@/features/i18n/server/dynamicDisplayTranslation";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";

type LeadMessageRow = { lead_id: string; sent_at: string | null };
type BookingOutcomeRow = {
  attended_status: string | null;
  closed_on_call: boolean | null;
  closer_user_id?: string | null;
};

type PipelineStageRow = {
  id: string;
  name: string | null;
  position: number | null;
  created_at?: string | null;
};

type ConversionMetricRow = {
  id: string;
  team_id: string;
  label: string | null;
  from_stage_id: string;
  to_stage_id: string;
  position: number | null;
  target_rate: number | null;
};

type LeadRowStage = {
  id: string;
  stage_id?: string | null;
  stage?: string | null;
  team_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
};

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

type DashboardUpcomingBookingRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  lead_id: string | null;
  invitee_first_name: string | null;
  invitee_email: string | null;
  booking_link_id: string | null;
};

type DashboardRecentLeadRow = {
  id: string;
  name: string | null;
  stage: string | null;
  created_at: string;
  score: number | null;
};

type DashboardFeedRow = {
  id: string;
  type: "lead_created" | "message" | "booking";
  at: string;
  lead_id: string | null;
  label: string;
};

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

const jsonError = (error: string, status = 500, details?: unknown) =>
  json({ error, details }, status);

async function safeResolveLocale(args: {
  request: Request;
  admin: ReturnType<typeof getCrmAdminClient>;
  userId?: string | null;
}): Promise<string | undefined> {
  try {
    const locale = await resolveRequestLocale(args);
    return typeof locale === "string" && locale.trim() ? locale : undefined;
  } catch (error) {
    console.warn("[dashboard-overview] resolveRequestLocale failed", error);
    return undefined;
  }
}

async function safeApplyTranslations<T extends { id: string }>(args: {
  admin: ReturnType<typeof getCrmAdminClient>;
  teamId: string;
  entityTable: string;
  rows: T[];
  requestedLocale?: string;
  fields: Array<{
    fieldKey: string | ((row: T) => string);
    sourceText: (row: T) => string;
    assign: (row: T, value: string) => void;
  }>;
}) {
  if (
    !args.requestedLocale ||
    !Array.isArray(args.rows) ||
    args.rows.length === 0
  ) {
    return;
  }

  try {
    await applyEntityTranslations<T>({
      admin: args.admin,
      teamId: args.teamId,
      entityTable: args.entityTable,
      rows: args.rows,
      requestedLocale: args.requestedLocale,
      fields: args.fields,
    });
  } catch (error) {
    console.warn(
      `[dashboard-overview] translation failed for ${args.entityTable}, using source values`,
      error,
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scopeRaw = String(url.searchParams.get("scope") ?? "team").trim();

    if (!isDashboardScope(scopeRaw)) {
      return jsonError("invalid_scope", 400);
    }

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

    const locale = await safeResolveLocale({
      request: req,
      admin,
      userId: auth.userId,
    });

    const effectiveScope: DashboardScope = isManagerOrAdmin
      ? requestedScope
      : "me";

    const now = new Date();
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

    const kpisPromise = (async () => {
      const { count: leadsTotal, error: leadsTotalError } =
        await applyLeadScope(
          admin.from("leads").select("id", { count: "exact", head: true }),
        );

      if (leadsTotalError) {
        throw leadsTotalError;
      }

      const [{ count: leadsNew7d }, { count: leadsNew30d }] = await Promise.all(
        [
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
        ],
      );

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

      const [{ count: bookings7d }, { count: bookings30d }] = await Promise.all(
        [
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
        ],
      );

      let outcomesQuery: any = admin
        .from("booking_outcomes")
        .select("attended_status, closed_on_call, closer_user_id, created_at")
        .eq("team_id", teamId)
        .gte("created_at", from30.toISOString());

      if (effectiveScope === "me") {
        outcomesQuery = outcomesQuery.eq("closer_user_id", auth.userId);
      }

      const { data: outcomes, error: outcomesError } = await outcomesQuery;

      if (outcomesError) {
        throw outcomesError;
      }

      const rows: BookingOutcomeRow[] = Array.isArray(outcomes)
        ? (outcomes as BookingOutcomeRow[])
        : [];

      const eligible = rows.filter(
        (row) => normalizeDashboardAttendance(row.attended_status).length > 0,
      );

      const total = eligible.length;
      const attended = eligible.filter((row) =>
        DASHBOARD_SHOW_ATTENDANCE_VALUES.has(
          normalizeDashboardAttendance(row.attended_status),
        ),
      ).length;

      const closed = eligible.filter((row) =>
        Boolean(row.closed_on_call),
      ).length;

      return {
        leads_total: leadsTotal ?? 0,
        leads_new_7d: leadsNew7d ?? 0,
        leads_new_30d: leadsNew30d ?? 0,
        messages_sent_7d: messagesSent7d ?? 0,
        messages_sent_30d: messagesSent30d ?? 0,
        bookings_7d: bookings7d ?? 0,
        bookings_30d: bookings30d ?? 0,
        show_rate_30d: total
          ? Math.round((attended / total) * 1000) / 10
          : null,
        close_rate_30d: total ? Math.round((closed / total) * 1000) / 10 : null,
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
        throw upcomingError;
      }

      const upcoming = (upcomingRaw ?? [])
        .filter((booking: any) => Boolean(booking.start_at))
        .map((booking: any) => ({
          id: String(booking.id ?? ""),
          start_at: String(booking.start_at),
          end_at: booking.end_at ? String(booking.end_at) : null,
          lead_id: booking.lead_id ? String(booking.lead_id) : null,
          invitee_first_name: booking.invitee_first_name ?? null,
          invitee_email: booking.invitee_email ?? null,
          booking_link_id: booking.booking_link_id
            ? String(booking.booking_link_id)
            : null,
        })) as DashboardUpcomingBookingRow[];

      await safeApplyTranslations<DashboardUpcomingBookingRow>({
        admin,
        teamId,
        entityTable: "bookings",
        rows: upcoming,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "invitee_first_name",
            sourceText: (row) => row.invitee_first_name ?? "",
            assign: (row, value) => {
              row.invitee_first_name = value || null;
            },
          },
        ],
      });

      const { data: recentRaw } = await selectWithFallback(
        (select) =>
          applyLeadScope(
            admin
              .from("leads")
              .select(select)
              .order("created_at", { ascending: false })
              .limit(8),
          ),
        [
          "id, lead_name, stage_id, stage, created_at, score",
          "id, lead_name, stage_id, created_at, score",
          "id, lead_name, stage, created_at, score",
          "id, lead_name, stage_id, created_at",
          "id, lead_name, stage, created_at",
          "id, created_at",
        ],
      );

      const recentLeads = Array.isArray(recentRaw) ? (recentRaw as any[]) : [];
      const leadIds = recentLeads
        .map((lead) => String(lead.id ?? ""))
        .filter(Boolean);

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

      const messageRows: LeadMessageRow[] = Array.isArray(messageRowsRaw)
        ? (messageRowsRaw as LeadMessageRow[])
        : [];

      const lastByLead = new Map<string, string>();

      for (const row of messageRows) {
        const leadId = String(row.lead_id ?? "");
        if (leadId && !lastByLead.has(leadId)) {
          lastByLead.set(leadId, String(row.sent_at ?? ""));
        }
      }

      const normalizedRecent = recentLeads.map((lead) => ({
        id: String(lead.id ?? ""),
        name: (lead.lead_name ?? lead.name ?? null) as string | null,
        stage: (lead.stage ?? null) as string | null,
        created_at: String(lead.created_at ?? ""),
        score: lead.score == null ? null : Number(lead.score),
      })) as DashboardRecentLeadRow[];

      await safeApplyTranslations<DashboardRecentLeadRow>({
        admin,
        teamId,
        entityTable: "leads",
        rows: normalizedRecent,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "lead_name",
            sourceText: (row) => row.name ?? "",
            assign: (row, value) => {
              row.name = value || null;
            },
          },
          {
            fieldKey: "stage",
            sourceText: (row) => row.stage ?? "",
            assign: (row, value) => {
              row.stage = value || null;
            },
          },
        ],
      });

      const needsAttention = normalizedRecent
        .map((lead) => ({
          id: lead.id,
          name: lead.name ?? "Unnamed",
          stage: lead.stage ?? "-",
          score: lead.score ?? null,
          last_activity_at: lastByLead.get(lead.id) ?? null,
        }))
        .filter((lead) => {
          if (!lead.last_activity_at) {
            return true;
          }
          const timestamp = Date.parse(lead.last_activity_at);
          return (
            !Number.isFinite(timestamp) ||
            timestamp < Date.now() - 3 * 24 * 60 * 60 * 1000
          );
        })
        .sort(
          (left, right) => Number(right.score ?? -1) - Number(left.score ?? -1),
        )
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

      const leadFeed: DashboardFeedRow[] = normalizedRecent.map((lead) => ({
        id: `lead:${lead.id}`,
        type: "lead_created",
        at: lead.created_at,
        lead_id: lead.id,
        label: `Lead added: ${lead.name ?? "Unnamed"}`,
      }));

      const messageFeed: DashboardFeedRow[] = (
        Array.isArray(feedMessagesRes.data) ? feedMessagesRes.data : []
      ).map((message: any) => ({
        id: `message:${String(message.id ?? "")}`,
        type: "message",
        at: String(message.sent_at ?? ""),
        lead_id:
          typeof message.lead_id === "string" && message.lead_id.trim()
            ? message.lead_id
            : null,
        label: `${message.direction === "inbound" ? "Inbound" : "Outbound"} message`,
      }));

      const bookingFeed: DashboardFeedRow[] = (
        Array.isArray(feedBookingsRes.data) ? feedBookingsRes.data : []
      ).map((booking: any) => ({
        id: `booking:${String(booking.id ?? "")}`,
        type: "booking",
        at: String(booking.created_at ?? ""),
        lead_id:
          typeof booking.lead_id === "string" && booking.lead_id.trim()
            ? booking.lead_id
            : null,
        label: `Booking created (${booking.invitee_email ?? "invitee"})`,
      }));

      const feed: DashboardFeedRow[] = [
        ...leadFeed,
        ...messageFeed,
        ...bookingFeed,
      ].sort(
        (left, right) =>
          Date.parse(String(right.at)) - Date.parse(String(left.at)),
      );

      if (locale && feed.length > 0) {
        try {
          const translatedFeedLabels = await translateDynamicDisplayValuesBatch(
            feed.map((entry) => ({
              cacheKey: `${entry.id}:label`,
              fieldKey: `${entry.type}_feed_label`,
              value: entry.label,
              targetLocale: locale,
              sourceLocalePolicy: "allow_unknown_as_source" as const,
            })),
          );

          for (const entry of feed) {
            const translatedLabel = translatedFeedLabels.get(
              `${entry.id}:label`,
            );
            if (translatedLabel) {
              entry.label = translatedLabel;
            }
          }
        } catch (error) {
          console.warn(
            "[dashboard-overview] feed label translation failed, using source values",
            error,
          );
        }
      }

      return {
        upcoming_bookings: upcoming,
        recent_leads: normalizedRecent,
        needs_attention: needsAttention,
        feed: feed.slice(0, 20).map(({ id: _id, ...entry }) => entry),
      };
    })();

    const funnelPromise = (async () => {
      const { data: stageRowsRaw, error: stagesError } = await admin
        .from("pipeline_stages")
        .select("id, name, position, created_at")
        .eq("team_id", teamId)
        .order("position", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (stagesError) {
        throw stagesError;
      }

      const stageRows = Array.isArray(stageRowsRaw)
        ? (stageRowsRaw as PipelineStageRow[])
        : [];

      await safeApplyTranslations<PipelineStageRow>({
        admin,
        teamId,
        entityTable: "pipeline_stages",
        rows: stageRows,
        requestedLocale: locale,
        fields: [
          {
            fieldKey: "name",
            sourceText: (row) => row.name ?? "",
            assign: (row, value) => {
              row.name = value;
            },
          },
        ],
      });

      if (!stageRows.length) {
        return {
          leadTotal: 0,
          stages: [] as FunnelStage[],
          edges: [] as FunnelEdge[],
        };
      }

      const { data: metricsRaw, error: metricsError } = await admin
        .from("conversion_metrics")
        .select(
          "id, team_id, label, from_stage_id, to_stage_id, position, target_rate",
        )
        .eq("team_id", teamId)
        .order("position", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (metricsError) {
        throw metricsError;
      }

      const metrics = Array.isArray(metricsRaw)
        ? (metricsRaw as ConversionMetricRow[])
        : [];

      await safeApplyTranslations<ConversionMetricRow>({
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

      const metricByPair = new Map<
        string,
        {
          label: string | null;
          position: number | null;
          targetRate: number | null;
        }
      >();

      for (const metric of metrics) {
        const key = `${metric.from_stage_id}__${metric.to_stage_id}`;
        if (!metricByPair.has(key)) {
          metricByPair.set(key, {
            label: metric.label ?? null,
            position: metric.position ?? null,
            targetRate: normalizeDashboardTargetRate(metric.target_rate),
          });
        }
      }

      let leads: LeadRowStage[] = [];

      try {
        const { data: leadRows, error: leadError } = await applyLeadScope(
          admin.from("leads").select("id, stage_id, stage"),
        );

        if (leadError) {
          throw leadError;
        }

        leads = Array.isArray(leadRows) ? (leadRows as LeadRowStage[]) : [];
      } catch {
        const { data: leadRows, error: leadError } = await applyLeadScope(
          admin.from("leads").select("id, stage"),
        );

        if (leadError) {
          throw leadError;
        }

        leads = Array.isArray(leadRows) ? (leadRows as LeadRowStage[]) : [];
      }

      const countsByStageId = new Map<string, number>(
        stageRows.map((stage) => [String(stage.id), 0]),
      );

      for (const lead of leads) {
        const stageId = lead.stage_id ? String(lead.stage_id) : null;

        if (stageId && countsByStageId.has(stageId)) {
          countsByStageId.set(stageId, (countsByStageId.get(stageId) ?? 0) + 1);
          continue;
        }

        const stageText = String(lead.stage ?? "")
          .trim()
          .toLowerCase();
        if (!stageText) {
          continue;
        }

        const matchedStage = stageRows.find(
          (stage) =>
            String(stage.name ?? "")
              .trim()
              .toLowerCase() === stageText,
        );

        if (matchedStage) {
          const matchedStageId = String(matchedStage.id);
          countsByStageId.set(
            matchedStageId,
            (countsByStageId.get(matchedStageId) ?? 0) + 1,
          );
        }
      }

      const stages: FunnelStage[] = [...stageRows]
        .sort(
          (left, right) =>
            (left.position ?? Number.POSITIVE_INFINITY) -
              (right.position ?? Number.POSITIVE_INFINITY) ||
            Date.parse(String(left.created_at ?? "")) -
              Date.parse(String(right.created_at ?? "")),
        )
        .map((stage) => ({
          id: String(stage.id),
          name: String(stage.name ?? "Untitled"),
          position: stage.position ?? null,
          leadCount: countsByStageId.get(String(stage.id)) ?? 0,
        }));

      const edges: FunnelEdge[] = stages
        .slice(0, -1)
        .map((fromStage, index) => {
          const toStage = stages[index + 1];
          const metric = metricByPair.get(`${fromStage.id}__${toStage.id}`);
          const denominator = fromStage.leadCount + toStage.leadCount;
          const actualConversionRate = denominator
            ? Math.round((toStage.leadCount / denominator) * 1000) / 10
            : null;
          const dropOffCount = fromStage.leadCount;
          const dropOffRate = denominator
            ? Math.round((dropOffCount / denominator) * 1000) / 10
            : null;

          return {
            fromStageId: fromStage.id,
            toStageId: toStage.id,
            fromStageName: fromStage.name,
            toStageName: toStage.name,
            position: metric?.position ?? index,
            label:
              (metric?.label ?? "").trim().length > 0
                ? String(metric?.label).trim()
                : "Next stage",
            targetRate: metric?.targetRate ?? null,
            actualConversionRate,
            dropOffCount,
            dropOffRate,
          };
        });

      return { leadTotal: leads.length, stages, edges };
    })();

    const activityPromise = (async () => {
      const bucketRaw = String(url.searchParams.get("bucket") ?? "week").trim();
      const daysRaw = Number(url.searchParams.get("days") ?? 120);

      const bucket: "day" | "week" | "month" =
        bucketRaw === "day" || bucketRaw === "month" ? bucketRaw : "week";

      const days = Number.isFinite(daysRaw)
        ? Math.max(7, Math.min(365, daysRaw))
        : 120;

      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const to = new Date();

      const [leadsRes, messagesRes] = await Promise.all([
        applyLeadScope(
          admin
            .from("leads")
            .select("id, created_at")
            .gte("created_at", from.toISOString()),
        ),
        applyMessageScope(
          admin
            .from("lead_messages")
            .select("id, sent_at, direction, channel")
            .gte("sent_at", from.toISOString())
            .eq("direction", "outbound")
            .neq("channel", "pipeline"),
        ),
      ]);

      if (leadsRes.error) {
        throw leadsRes.error;
      }

      if (messagesRes.error) {
        throw messagesRes.error;
      }

      const getBucketKey = (date: Date) => {
        const normalized = new Date(date);

        if (bucket === "day") {
          normalized.setHours(0, 0, 0, 0);
          return normalized.toISOString();
        }

        if (bucket === "week") {
          const day = (normalized.getDay() + 6) % 7;
          normalized.setDate(normalized.getDate() - day);
          normalized.setHours(0, 0, 0, 0);
          return normalized.toISOString();
        }

        normalized.setDate(1);
        normalized.setHours(0, 0, 0, 0);
        return normalized.toISOString();
      };

      const points = new Map<string, ActivityPoint>();

      for (const lead of Array.isArray(leadsRes.data) ? leadsRes.data : []) {
        const timestamp = Date.parse(String((lead as any).created_at ?? ""));
        if (!Number.isFinite(timestamp)) {
          continue;
        }

        const key = getBucketKey(new Date(timestamp));
        const point = points.get(key) ?? {
          bucket_start: key,
          leads_created: 0,
          messages_sent: 0,
        };

        point.leads_created += 1;
        points.set(key, point);
      }

      for (const message of Array.isArray(messagesRes.data)
        ? messagesRes.data
        : []) {
        const timestamp = Date.parse(String((message as any).sent_at ?? ""));
        if (!Number.isFinite(timestamp)) {
          continue;
        }

        const key = getBucketKey(new Date(timestamp));
        const point = points.get(key) ?? {
          bucket_start: key,
          leads_created: 0,
          messages_sent: 0,
        };

        point.messages_sent += 1;
        points.set(key, point);
      }

      return {
        ok: true,
        bucket,
        from: from.toISOString(),
        to: to.toISOString(),
        series: Array.from(points.values()).sort(
          (left, right) =>
            Date.parse(left.bucket_start) - Date.parse(right.bucket_start),
        ),
      };
    })();

    const [kpis, panels, funnel, activity] = await Promise.all([
      kpisPromise,
      panelsPromise,
      funnelPromise,
      activityPromise,
    ]);

    return json({
      ok: true,
      teamId,
      roles,
      isManagerOrAdmin,
      scope: effectiveScope,
      kpis,
      funnel,
      activity,
      panels,
    });
  } catch (error: any) {
    console.error("[dashboard-overview] unexpected:", error);
    return jsonError("unhandled_error", 500, String(error?.message ?? error));
  }
}
