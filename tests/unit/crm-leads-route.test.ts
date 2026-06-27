import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestUserMock = vi.fn();
const resolveUserTeamMembershipMock = vi.fn();

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
            maybeSingle: vi.fn(),
            single: vi.fn(),
          })),
          single: vi.fn(),
          order: vi.fn(() => ({
            single: vi.fn(),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(),
                })),
              })),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  })),
}));

describe("crm leads route guards", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestUserMock.mockReset();
    resolveUserTeamMembershipMock.mockReset();
  });

  it("returns 401 when no authenticated request user exists", async () => {
    getRequestUserMock.mockResolvedValue({ ok: false, reason: "missing_token" });

    const { GET } = await import("@/app/api/crm/leads/route");
    const response = await GET(
      new Request("https://example.com/api/crm/leads?teamId=team-1"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when the user is not a member of the requested team", async () => {
    getRequestUserMock.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
    });
    resolveUserTeamMembershipMock.mockRejectedValue(
      new Error("not_a_member_of_team"),
    );

    const { GET } = await import("@/app/api/crm/leads/route");
    const response = await GET(
      new Request("https://example.com/api/crm/leads?teamId=team-2"),
    );

    expect(response.status).toBe(403);
  });
});
