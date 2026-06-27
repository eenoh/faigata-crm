import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestUserMock = vi.fn();
const resolveUserTeamMembershipMock = vi.fn();
const resolveEnabledLeadNicheMock = vi.fn();
const applyEntityTranslationsMock = vi.fn();
const deleteEntityTranslationsMock = vi.fn();
const syncEntityTranslationSourcesMock = vi.fn();
const resolveRequestLocaleMock = vi.fn();
const translateDynamicDisplayValuesBatchMock = vi.fn();
const recomputeLeadScoreMock = vi.fn();
let currentAdmin: any;

vi.mock("@/lib/auth/session", () => ({
  getRequestUser: getRequestUserMock,
}));

vi.mock("@/features/organizations/server/team-membership.service", () => ({
  resolveUserTeamMembership: resolveUserTeamMembershipMock,
}));

vi.mock("@/features/crm/server/niches.service", () => ({
  resolveEnabledLeadNiche: resolveEnabledLeadNicheMock,
}));

vi.mock("@/features/crm/server/custom-value-translations", () => ({
  applyEntityTranslations: applyEntityTranslationsMock,
  deleteEntityTranslations: deleteEntityTranslationsMock,
  syncEntityTranslationSources: syncEntityTranslationSourcesMock,
}));

vi.mock("@/features/i18n/server/requestLocale", () => ({
  resolveRequestLocale: resolveRequestLocaleMock,
}));

vi.mock("@/features/i18n/server/dynamicDisplayTranslation", () => ({
  translateDynamicDisplayValuesBatch: translateDynamicDisplayValuesBatchMock,
}));

vi.mock("@/features/crm/scoring/recomputeLeadScore", () => ({
  recomputeLeadScore: recomputeLeadScoreMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => currentAdmin),
}));

function createAdminMock() {
  const deleteCalls: Array<{ field: string; value: string }> = [];

  const admin = {
    from(table: string) {
      if (table === "leads") {
        return {
          select() {
            return {
              eq(field: string, value: string) {
                if (field !== "team_id" || value !== "team-1") {
                  throw new Error(`Unexpected leads eq: ${field}=${value}`);
                }

                return {
                  order: async () => ({
                    data: [
                      {
                        id: "lead-1",
                        team_id: "team-1",
                        stage: "Qualified",
                        stage_id: "stage-1",
                        lead_name: "Anna",
                        niche_id: "niche-1",
                        niche: "Agencies",
                        lead_type: null,
                        gender: null,
                        country: null,
                        region: null,
                        city: null,
                        postal_code: null,
                        primary_contact_type: "email",
                        primary_contact_value: "anna@example.com",
                        source_category: null,
                        source_name: null,
                        custom_values: {
                          pain_points: "Needs better booking flow",
                        },
                        prospector_id: null,
                        setter_id: null,
                        closer_id: null,
                        notes: "Call scheduled",
                        score: null,
                        score_updated_at: null,
                        created_at: null,
                        updated_at: null,
                      },
                    ],
                    error: null,
                  }),
                  eq(nextField: string, nextValue: string) {
                    if (nextField !== "id" || nextValue !== "lead-1") {
                      throw new Error(
                        `Unexpected leads nested eq: ${nextField}=${nextValue}`,
                      );
                    }

                    return Promise.resolve({
                      data: {
                        id: "lead-1",
                        team_id: "team-1",
                      },
                      error: null,
                    });
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq(field: string, value: string) {
                deleteCalls.push({ field, value });

                return {
                  eq(nextField: string, nextValue: string) {
                    deleteCalls.push({ field: nextField, value: nextValue });
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "lead_fields") {
        return {
          select() {
            return {
              eq: async () => ({
                data: [{ key: "pain_points", type: "text" }],
                error: null,
              }),
            };
          },
        };
      }

      if (table === "pipeline_stages") {
        return {
          select() {
            return {
              eq(field: string, value: string) {
                if (field !== "team_id" || value !== "team-1") {
                  throw new Error(
                    `Unexpected pipeline_stages eq: ${field}=${value}`,
                  );
                }

                return {
                  in: async () => ({
                    data: [{ id: "stage-1", name: "Qualified" }],
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "niches") {
        return {
          select() {
            return {
              in: async () => ({
                data: [{ id: "niche-1", name: "Agencies" }],
                error: null,
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, deleteCalls };
}

describe("crm leads translation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    getRequestUserMock.mockReset();
    resolveUserTeamMembershipMock.mockReset();
    resolveEnabledLeadNicheMock.mockReset();
    applyEntityTranslationsMock.mockReset();
    deleteEntityTranslationsMock.mockReset();
    syncEntityTranslationSourcesMock.mockReset();
    resolveRequestLocaleMock.mockReset();
    translateDynamicDisplayValuesBatchMock.mockReset();
    recomputeLeadScoreMock.mockReset();
  });

  it("returns translated display labels when a locale header is present", async () => {
    const { admin } = createAdminMock();
    currentAdmin = admin;
    getRequestUserMock.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
    });
    resolveUserTeamMembershipMock.mockResolvedValue({ teamId: "team-1" });
    resolveRequestLocaleMock.mockResolvedValue("de");
    applyEntityTranslationsMock.mockImplementation(async ({ entityTable, rows }) => {
      if (entityTable === "pipeline_stages") {
        rows[0].name = "Qualifiziert";
      }

      if (entityTable === "niches") {
        rows[0].name = "Agenturen";
      }

       if (entityTable === "leads") {
        rows[0].display_values = {
          lead_name: "Anna (DE)",
          notes: "Anruf geplant",
          pain_points: "Braucht bessere Buchungsablaeufe",
        };
      }

      return rows;
    });
    translateDynamicDisplayValuesBatchMock.mockResolvedValue(new Map());

    const { GET } = await import("@/app/api/crm/leads/route");
    const response = await GET(
      new Request("https://example.com/api/crm/leads?teamId=team-1", {
        headers: {
          "x-faigata-locale": "de",
        },
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(resolveRequestLocaleMock).toHaveBeenCalled();
    expect(data).toEqual([
      expect.objectContaining({
        lead_name: "Anna",
        notes: "Call scheduled",
        stage: "Qualifiziert",
        niche: "Agenturen",
        display_values: expect.objectContaining({
          lead_name: "Anna (DE)",
          notes: "Anruf geplant",
          pain_points: "Braucht bessere Buchungsablaeufe",
        }),
      }),
    ]);
  });

  it("deletes by stable id even when the UI locale is not English", async () => {
    const { admin, deleteCalls } = createAdminMock();
    currentAdmin = admin;
    getRequestUserMock.mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
    });
    resolveUserTeamMembershipMock.mockResolvedValue({ teamId: "team-1" });

    const { DELETE } = await import("@/app/api/crm/leads/route");
    const response = await DELETE(
      new Request(
        "https://example.com/api/crm/leads?teamId=team-1&id=lead-123",
        {
          method: "DELETE",
          headers: {
            "x-faigata-locale": "de",
          },
        },
      ),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(deleteCalls).toEqual([
      { field: "team_id", value: "team-1" },
      { field: "id", value: "lead-123" },
    ]);
    expect(deleteEntityTranslationsMock).toHaveBeenCalledWith({
      admin,
      entityTable: "leads",
      entityIds: ["lead-123"],
    });
  });
});
