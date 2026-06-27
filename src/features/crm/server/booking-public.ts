import type { AppSupabaseClient } from "@/lib/supabase/types";

export type PublicBookingType = "one_on_one" | "group" | "round_robin";

type BookingInviteState = "ready" | "used" | "expired";

export function normalizePublicBookingType(raw: unknown): PublicBookingType {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "group") return "group";
  if (normalized === "round_robin") return "round_robin";

  return "one_on_one";
}

export function getBookingInviteState(invite: {
  used_at?: unknown;
  expires_at?: unknown;
}): BookingInviteState {
  if (invite.used_at) return "used";

  if (invite.expires_at) {
    const expiresAt = new Date(String(invite.expires_at));

    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return "expired";
    }
  }

  return "ready";
}

export function getInviteLinkMismatchError(
  invite: { booking_link_id?: unknown; team_id?: unknown },
  link: { id?: unknown; team_id?: unknown },
) {
  if (String(invite.booking_link_id ?? "") !== String(link.id ?? "")) {
    return "invite_link_mismatch";
  }

  if (String(invite.team_id ?? "") !== String(link.team_id ?? "")) {
    return "invite_team_mismatch";
  }

  return null;
}

export async function getBookingInviteByToken(
  admin: AppSupabaseClient,
  token: string,
  select =
    "id, team_id, booking_link_id, lead_id, used_at, expires_at, created_at",
) {
  return admin
    .from("booking_link_invites")
    .select(select)
    .eq("token", token)
    .maybeSingle();
}

export async function getPublicBookingLink(args: {
  admin: AppSupabaseClient;
  slug: string;
  linkId?: string | null;
  select: string;
}) {
  const { admin, slug, linkId, select } = args;
  const query = admin.from("booking_links").select(select);

  return linkId
    ? query.eq("id", linkId).maybeSingle()
    : query.eq("slug", slug).maybeSingle();
}

export async function getBookingLinkHostIds(args: {
  admin: AppSupabaseClient;
  bookingLinkId: string;
  bookingType: PublicBookingType;
  ownerUserId: unknown;
  includeOwnerForGroup?: boolean;
}) {
  const {
    admin,
    bookingLinkId,
    bookingType,
    ownerUserId,
    includeOwnerForGroup = false,
  } = args;
  const ownerId = String(ownerUserId ?? "").trim() || null;

  if (bookingType === "one_on_one") {
    return {
      hostIds: ownerId ? [ownerId] : [],
      error: null,
    };
  }

  const { data, error } = await admin
    .from("booking_link_hosts")
    .select("user_id")
    .eq("booking_link_id", bookingLinkId);

  if (error) {
    return { hostIds: [] as string[], error };
  }

  const hostIds = Array.from(
    new Set((data ?? []).map((row: any) => String(row.user_id)).filter(Boolean)),
  );

  if (includeOwnerForGroup && ownerId && !hostIds.includes(ownerId)) {
    hostIds.unshift(ownerId);
  }

  if (!hostIds.length && ownerId) {
    hostIds.push(ownerId);
  }

  return { hostIds, error: null };
}

export function resolveGroupParticipantIds(args: {
  hostIds: string[];
  ownerUserId: unknown;
  requestedHostIds: string[];
}) {
  const ownerId = String(args.ownerUserId ?? "").trim() || null;
  const allowed = new Set(args.hostIds);

  if (ownerId) {
    allowed.add(ownerId);
  }

  const chosen =
    args.requestedHostIds.length > 0
      ? args.requestedHostIds.filter((hostId) => allowed.has(hostId))
      : args.hostIds.slice();

  const participantIds = Array.from(new Set(chosen));

  if (ownerId && !participantIds.includes(ownerId)) {
    participantIds.unshift(ownerId);
  }

  return participantIds;
}

export function isUniqueViolation(error: unknown) {
  const code = String((error as { code?: string })?.code ?? "").trim();
  const message = String(
    (error as { message?: string })?.message ?? "",
  ).toLowerCase();

  return (
    code === "23505" ||
    message.includes("duplicate key") ||
    message.includes("unique constraint")
  );
}
