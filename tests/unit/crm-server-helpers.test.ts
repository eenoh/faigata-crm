import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBearerToken,
  isUuid,
  pickFirstRouteParam,
} from "@/features/crm/server/request";
import {
  getBookingInviteState,
  getInviteLinkMismatchError,
  normalizePublicBookingType,
  resolveGroupParticipantIds,
} from "@/features/crm/server/booking-public";
import {
  buildAvailabilitySlots,
  computeWorkWindowUtc,
  resolvePublicBookingSlug,
} from "@/features/crm/server/booking-availability";
import {
  normalizeCrmRole,
  normalizeCrmRoles,
} from "@/features/crm/server/team-context";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CRM server request helpers", () => {
  it("extracts bearer tokens from authorization headers", () => {
    const request = new Request("https://example.com", {
      headers: { authorization: "Bearer token-123" },
    });

    expect(getBearerToken(request)).toBe("token-123");
  });

  it("picks the first route param value", () => {
    expect(pickFirstRouteParam(["lead-1", "lead-2"])).toBe("lead-1");
    expect(pickFirstRouteParam("lead-3")).toBe("lead-3");
  });

  it("validates UUIDs consistently", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("CRM public booking helpers", () => {
  it("normalizes public booking types", () => {
    expect(normalizePublicBookingType("group")).toBe("group");
    expect(normalizePublicBookingType("round_robin")).toBe("round_robin");
    expect(normalizePublicBookingType("unexpected")).toBe("one_on_one");
  });

  it("derives invite state from usage and expiry", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-12T12:00:00.000Z").getTime(),
    );

    expect(getBookingInviteState({ used_at: "2026-03-11T12:00:00.000Z" })).toBe(
      "used",
    );
    expect(
      getBookingInviteState({ expires_at: "2026-03-11T12:00:00.000Z" }),
    ).toBe("expired");
    expect(
      getBookingInviteState({ expires_at: "2026-03-13T12:00:00.000Z" }),
    ).toBe("ready");
  });

  it("detects invite and link mismatches", () => {
    expect(
      getInviteLinkMismatchError(
        { booking_link_id: "invite-link", team_id: "team-1" },
        { id: "link-2", team_id: "team-1" },
      ),
    ).toBe("invite_link_mismatch");
    expect(
      getInviteLinkMismatchError(
        { booking_link_id: "link-1", team_id: "team-1" },
        { id: "link-1", team_id: "team-2" },
      ),
    ).toBe("invite_team_mismatch");
  });

  it("resolves group participant ids from allowed hosts and owner", () => {
    expect(
      resolveGroupParticipantIds({
        hostIds: ["host-1", "host-2"],
        ownerUserId: "owner-1",
        requestedHostIds: ["host-2", "ignored"],
      }),
    ).toEqual(["owner-1", "host-2"]);
  });
});

describe("CRM booking availability helpers", () => {
  it("resolves public booking slug from params or pathname", () => {
    expect(
      resolvePublicBookingSlug(new URL("https://example.com/x"), "route-slug"),
    ).toBe("route-slug");
    expect(
      resolvePublicBookingSlug(
        new URL("https://example.com/api/crm/booking-links/path-slug/availability"),
      ),
    ).toBe("path-slug");
  });

  it("computes a work window for business hours", () => {
    const result = computeWorkWindowUtc({
      timeZone: "UTC",
      year: 2026,
      month: 3,
      day: 12,
      availabilityMode: "business_hours",
      workStartMinuteRaw: 9 * 60,
      workEndMinuteRaw: 17 * 60,
      workDaysRaw: [4],
    });

    expect(result?.workStartUtc.toISOString()).toBe("2026-03-12T09:00:00.000Z");
    expect(result?.workEndUtc.toISOString()).toBe("2026-03-12T17:00:00.000Z");
  });

  it("builds round-robin slots when any host is free", () => {
    const slots = buildAvailabilitySlots({
      bookingType: "round_robin",
      busyPerHost: [
        [[Date.parse("2026-03-12T09:00:00.000Z"), Date.parse("2026-03-12T10:00:00.000Z")]],
        [],
      ],
      workStartMs: Date.parse("2026-03-12T09:00:00.000Z"),
      workEndMs: Date.parse("2026-03-12T10:00:00.000Z"),
      minBookableMs: Date.parse("2026-03-12T08:00:00.000Z"),
      maxBookableMs: Date.parse("2026-03-13T08:00:00.000Z"),
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });

    expect(slots).toEqual([
      {
        start: "2026-03-12T09:00:00.000Z",
        end: "2026-03-12T09:30:00.000Z",
      },
      {
        start: "2026-03-12T09:15:00.000Z",
        end: "2026-03-12T09:45:00.000Z",
      },
      {
        start: "2026-03-12T09:30:00.000Z",
        end: "2026-03-12T10:00:00.000Z",
      },
    ]);
  });
});

describe("CRM team context helpers", () => {
  it("normalizes primary roles", () => {
    expect(normalizeCrmRole("ADMIN")).toBe("admin");
    expect(normalizeCrmRole("manager")).toBe("manager");
    expect(normalizeCrmRole("setter")).toBe("member");
  });

  it("normalizes role arrays", () => {
    expect(normalizeCrmRoles(["admin", "manager"])).toEqual([
      "admin",
      "manager",
    ]);
    expect(normalizeCrmRoles("admin")).toEqual(["admin"]);
  });
});