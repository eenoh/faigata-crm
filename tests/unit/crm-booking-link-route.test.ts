import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveRequestLocaleMock = vi.fn();
const applyEntityTranslationsMock = vi.fn();
const syncEntityTranslationSourcesMock = vi.fn();
const deleteEntityTranslationsMock = vi.fn();
const replaceBookingLinkWorkDaysMock = vi.fn();
let currentAdmin: any;

vi.mock("@/features/i18n/server/requestLocale", () => ({
  resolveRequestLocale: resolveRequestLocaleMock,
}));

vi.mock("@/features/crm/server/custom-value-translations", () => ({
  applyEntityTranslations: applyEntityTranslationsMock,
  syncEntityTranslationSources: syncEntityTranslationSourcesMock,
  deleteEntityTranslations: deleteEntityTranslationsMock,
}));

vi.mock("@/features/crm/server/normalized-crm", () => ({
  replaceBookingLinkWorkDays: replaceBookingLinkWorkDaysMock,
}));

vi.mock("@/features/crm/server/supabase", () => ({
  getCrmAdminClient: () => currentAdmin,
}));

function createListAdmin() {
  const admin = {
    from(table: string) {
      if (table !== "booking_links") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(columns: string) {
          expect(columns).toContain("id");
          return {
            eq(field: string, value: string) {
              expect(field).toBe("team_id");
              expect(value).toBe("team-1");
              return {
                eq(nextField: string, nextValue: string) {
                  expect(nextField).toBe("owner_user_id");
                  expect(nextValue).toBe("user-1");
                  return {
                    is(lastField: string, lastValue: null) {
                      expect(lastField).toBe("deleted_at");
                      expect(lastValue).toBeNull();
                      return {
                        order: async () => ({
                          data: [
                            {
                              id: "link-1",
                              team_id: "team-1",
                              owner_user_id: "user-1",
                              name: "Discovery Call",
                              slug: "discovery-call",
                              description: "Intro",
                              confirmation_heading: "Booked",
                              confirmation_subheading: "See you soon",
                              primary_color: "#123456",
                              booking_type: "one_on_one",
                              created_at: "2026-06-01T10:00:00.000Z",
                              deleted_at: null,
                            },
                          ],
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { admin };
}

function createCreateAdmin() {
  const insertedHosts: Record<string, unknown>[][] = [];
  const deletedLinkIds: string[] = [];

  const admin = {
    from(table: string) {
      if (table === "booking_links") {
        return {
          insert(payload: Record<string, unknown>) {
            expect(payload).toEqual(
              expect.objectContaining({
                team_id: "team-1",
                owner_user_id: "user-1",
                name: "Discovery Call",
                slug: "discovery-call",
                duration_minutes: 45,
              }),
            );

            return {
              select(columns: string) {
                expect(columns).toContain("id");
                return {
                  single: async () => ({
                    data: {
                      id: "link-1",
                      team_id: "team-1",
                      owner_user_id: "user-1",
                      name: "Discovery Call",
                      slug: "discovery-call",
                      description: "Intro",
                      confirmation_heading: "Booked",
                      confirmation_subheading: "See you soon",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          delete() {
            return {
              eq(field: string, value: string) {
                expect(field).toBe("id");
                deletedLinkIds.push(value);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "booking_link_hosts") {
        return {
          insert(payload: Record<string, unknown>[]) {
            insertedHosts.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, insertedHosts, deletedLinkIds };
}

function createDeleteAdmin() {
  const updates: Record<string, unknown>[] = [];

  const admin = {
    from(table: string) {
      if (table !== "booking_links") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return {
            eq(field: string, value: string) {
              expect(field).toBe("id");
              expect(value).toBe("link-1");
              return {
                eq(nextField: string, nextValue: string) {
                  expect(nextField).toBe("team_id");
                  expect(nextValue).toBe("team-1");
                  return {
                    eq(lastField: string, lastValue: string) {
                      expect(lastField).toBe("owner_user_id");
                      expect(lastValue).toBe("user-1");
                      return {
                        is(deletedField: string, deletedValue: null) {
                          expect(deletedField).toBe("deleted_at");
                          expect(deletedValue).toBeNull();
                          return {
                            select(columns: string) {
                              expect(columns).toBe("id");
                              return {
                                maybeSingle: async () => ({
                                  data: { id: "link-1" },
                                  error: null,
                                }),
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { admin, updates };
}

describe("crm booking link route", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveRequestLocaleMock.mockReset();
    applyEntityTranslationsMock.mockReset();
    syncEntityTranslationSourcesMock.mockReset();
    deleteEntityTranslationsMock.mockReset();
    replaceBookingLinkWorkDaysMock.mockReset();
  });

  it("reads booking links and applies translations", async () => {
    const { admin } = createListAdmin();
    currentAdmin = admin;
    resolveRequestLocaleMock.mockResolvedValue("de");
    applyEntityTranslationsMock.mockImplementation(async ({ rows, fields }) => {
      fields[0].assign(rows[0], "Erstgespraech");
      return rows;
    });

    const { GET } = await import("@/app/api/crm/booking-link/route");
    const response = await GET(
      new Request(
        "https://example.com/api/crm/booking-link?teamId=team-1&ownerUserId=user-1",
      ),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      links: [
        expect.objectContaining({
          id: "link-1",
          name: "Erstgespraech",
          slug: "discovery-call",
        }),
      ],
    });
  });

  it("creates booking links and persists normalized host/work-day rows", async () => {
    const { admin, insertedHosts, deletedLinkIds } = createCreateAdmin();
    currentAdmin = admin;
    resolveRequestLocaleMock.mockResolvedValue("de");

    const { POST } = await import("@/app/api/crm/booking-link/route");
    const response = await POST(
      new Request("https://example.com/api/crm/booking-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: "team-1",
          owner_user_id: "user-1",
          name: "Discovery Call",
          slug: "discovery-call",
          description: "Intro",
          confirmation_heading: "Booked",
          confirmation_subheading: "See you soon",
          duration_minutes: 45,
          work_days: [1, "3", 5],
          host_user_ids: ["user-2", "user-3", "user-2"],
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      ok: true,
      link: expect.objectContaining({
        id: "link-1",
        team_id: "team-1",
      }),
    });
    expect(replaceBookingLinkWorkDaysMock).toHaveBeenCalledWith({
      admin,
      bookingLinkId: "link-1",
      weekdays: ["1", "3", "5"],
    });
    expect(insertedHosts).toEqual([
      [
        { booking_link_id: "link-1", user_id: "user-2" },
        { booking_link_id: "link-1", user_id: "user-3" },
      ],
    ]);
    expect(syncEntityTranslationSourcesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin,
        teamId: "team-1",
        entityTable: "booking_links",
        sourceLocale: "de",
      }),
    );
    expect(deletedLinkIds).toEqual([]);
  });

  it("soft deletes booking links and removes translation rows", async () => {
    const { admin, updates } = createDeleteAdmin();
    currentAdmin = admin;

    const { DELETE } = await import("@/app/api/crm/booking-link/route");
    const response = await DELETE(
      new Request("https://example.com/api/crm/booking-link", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "link-1",
          team_id: "team-1",
          owner_user_id: "user-1",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(
      expect.objectContaining({
        deleted_at: expect.any(String),
      }),
    );
    expect(deleteEntityTranslationsMock).toHaveBeenCalledWith({
      admin,
      entityTable: "booking_links",
      entityIds: ["link-1"],
    });
  });
});
