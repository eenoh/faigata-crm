export type Bucket = "day" | "week" | "month";
export type Scope = "team" | "me";

export type FunnelStage = {
  id: string;
  name: string;
  position: number | null;
  leadCount: number;
};

export type FunnelEdge = {
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

export type ActivityPoint = {
  bucket_start: string;
  leads_created: number;
  messages_sent: number;
};

export type OverviewPayload = {
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

export type TooltipItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
};

export type ActivityTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipItem[];
  bucket: Bucket;
  isDark: boolean;
};
