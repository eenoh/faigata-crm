export type LeadMessage = {
  id: string;
  direction: "inbound" | "outbound" | "internal";
  channel: string | null;
  body: string;
  sent_at: string;
  created_at?: string | null;
  sender_profile_id: string | null;

  // NEW: structured timeline support (Phase X.3)
  event_type?: string | null;
  event_data?: Record<string, unknown> | null;

  sender?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type ScoreThresholds = { low: number; high: number };

export type CreatorProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export type BookingType = "one_on_one" | "group" | "round_robin";

export type BookingLinkRow = {
  id: string;
  name: string;
  slug: string;
  booking_type: BookingType | null;
  owner_user_id: string | null;
  owner_name: string;
  deleted_at?: string | null;
};
