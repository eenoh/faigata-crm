import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestUserMock = vi.fn();
const resolveUserTeamMembershipMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getRequestUser: getRequestUserMock,
}));

vi.mock("@/features/organizations/server/team-membership.service", () => ({
  resolveUserTeamMembership: resolveUserTeamMembershipMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: maybeSingleMock,
          })),
        })),
      })),
    })),
  })),
}));

describe("getAuthedBillingContextWithReason", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestUserMock.mockReset();
    resolveUserTeamMembershipMock.mockReset();
    maybeSingleMock.mockReset();
  });

  it("returns the resolved team, role, and stripe account", async () => {
    getRequestUserMock.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
    });
    resolveUserTeamMembershipMock.mockResolvedValue({
      teamId: "team-1",
      orgId: "org-1",
      roles: ["manager"],
      highestRole: "manager",
    });
    maybeSingleMock.mockResolvedValue({
      data: { stripe_account_id: "acct_123" },
      error: null,
    });

    const { getAuthedBillingContextWithReason } = await import(
      "@/features/billing/server/auth"
    );

    const result = await getAuthedBillingContextWithReason(
      new Request("https://example.com/api/billing/products"),
    );

    expect(result).toEqual({
      ok: true,
      ctx: {
        userId: "user-1",
        teamId: "team-1",
        orgId: "org-1",
        livemode: false,
        stripeAccountId: "acct_123",
        role: "manager",
        roles: ["manager"],
      },
    });
  });

  it("rejects members without billing privileges", async () => {
    getRequestUserMock.mockResolvedValue({
      ok: true,
      user: { id: "user-2" },
    });
    resolveUserTeamMembershipMock.mockResolvedValue({
      teamId: "team-2",
      orgId: "org-2",
      roles: ["member"],
      highestRole: "member",
    });

    const { getAuthedBillingContextWithReason } = await import(
      "@/features/billing/server/auth"
    );

    const result = await getAuthedBillingContextWithReason(
      new Request("https://example.com/api/billing/products"),
    );

    expect(result).toEqual({
      ok: false,
      reason: "missing_privilege",
      details: { roles: ["member"] },
    });
  });
});
