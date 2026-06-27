import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachBookingLinkWorkDays,
  ensureLeadSourceId,
  loadLeadScoringConfig,
  replaceBookingLinkWorkDays,
  replacePrimaryLeadContact,
  saveLeadScoringConfig,
} from "@/features/crm/server/normalized-crm";

function createUpsertAdmin() {
  const calls: Array<{ table: string; payload: unknown; options?: unknown }> = [];

  const admin = {
    from(table: string) {
      if (table === "lead_source_categories") {
        return {
          upsert(payload: unknown, options?: unknown) {
            calls.push({ table, payload, options });
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: "category-1" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "lead_sources") {
        return {
          upsert(payload: unknown, options?: unknown) {
            calls.push({ table, payload, options });
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: "source-1" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { admin, calls };
}

function createContactAdmin() {
  const deleted: Array<{ table: string; field: string; value: string }> = [];
  const inserted: Array<{ table: string; payload: unknown }> = [];

  const admin = {
    from(table: string) {
      if (table === "lead_contacts") {
        return {
          delete() {
            return {
              eq(field: string, value: string) {
                deleted.push({ table, field, value });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(payload: unknown) {
            inserted.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "lead_contact_types") {
        return {
          upsert(payload: unknown) {
            inserted.push({ table, payload });
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: "contact-type-1" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { admin, deleted, inserted };
}

function createScoringAdmin() {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const deletes: Array<{ table: string; mode: string; value: string | string[] }> = [];

  const rules = [{ id: "rule-old-1" }, { id: "rule-old-2" }];

  const admin = {
    from(table: string) {
      if (table === "lead_scoring_thresholds") {
        return {
          upsert(payload: unknown) {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq(field: string, value: string) {
                expect(field).toBe("team_id");
                expect(value).toBe("team-1");
                return {
                  maybeSingle: async () => ({
                    data: {
                      team_id: "team-1",
                      low_threshold: 35,
                      high_threshold: 80,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "lead_scoring_rules") {
        return {
          select(columns?: string) {
            return {
              eq(field: string, value: string) {
                expect(field).toBe("team_id");
                expect(value).toBe("team-1");
                if (columns === "id") {
                  return Promise.resolve({
                    data: rules,
                    error: null,
                  });
                }

                return {
                  order: async () => ({
                    data: [
                      {
                        id: "rule-1",
                        team_id: "team-1",
                        field_key: "company_size",
                        label: "Company Size",
                        weight: 5,
                        position: 0,
                      },
                    ],
                    error: null,
                  }),
                  then: undefined,
                };
              },
            };
          },
          delete() {
            return {
              eq(field: string, value: string) {
                deletes.push({ table, mode: field, value });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(payload: unknown) {
            inserts.push({ table, payload });
            return {
              select() {
                return Promise.resolve({
                  data: [{ id: "rule-new-1", position: 0 }],
                  error: null,
                });
              },
            };
          },
        };
      }

      if (table === "lead_scoring_rule_option_weights") {
        return {
          select() {
            return {
              in(field: string, value: string[]) {
                expect(field).toBe("rule_id");
                expect(value).toEqual(["rule-1"]);
                return {
                  order: async () => ({
                    data: [
                      {
                        rule_id: "rule-1",
                        option_value: "enterprise",
                        weight: 9,
                        position: 0,
                      },
                    ],
                    error: null,
                  }),
                };
              },
            };
          },
          delete() {
            return {
              in(field: string, value: string[]) {
                deletes.push({ table, mode: field, value });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(payload: unknown) {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { admin, inserts, deletes, rules };
}

function createWorkDayAdmin() {
  const deleted: Array<{ table: string; field: string; value: string }> = [];
  const inserted: Array<{ table: string; payload: unknown }> = [];

  const admin = {
    from(table: string) {
      if (table !== "booking_link_work_days") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select() {
          return {
            in(field: string, values: string[]) {
              expect(field).toBe("booking_link_id");
              expect(values).toEqual(["link-1", "link-2"]);
              return {
                order: async () => ({
                  data: [
                    { booking_link_id: "link-1", weekday: 1 },
                    { booking_link_id: "link-1", weekday: 3 },
                    { booking_link_id: "link-2", weekday: 5 },
                  ],
                  error: null,
                }),
              };
            },
          };
        },
        delete() {
          return {
            eq(field: string, value: string) {
              deleted.push({ table, field, value });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(payload: unknown) {
          inserted.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { admin, deleted, inserted };
}

describe("normalized CRM helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates source categories and sources when ensuring a lead source id", async () => {
    const { admin, calls } = createUpsertAdmin();

    const sourceId = await ensureLeadSourceId({
      admin: admin as any,
      teamId: "team-1",
      sourceCategory: "inbound",
      sourceName: "instagram",
    });

    expect(sourceId).toBe("source-1");
    expect(calls).toEqual([
      expect.objectContaining({
        table: "lead_source_categories",
        payload: { name: "inbound" },
      }),
      expect.objectContaining({
        table: "lead_sources",
        payload: {
          team_id: "team-1",
          category_id: "category-1",
          name: "instagram",
        },
      }),
    ]);
  });

  it("replaces the primary lead contact in normalized tables", async () => {
    const { admin, deleted, inserted } = createContactAdmin();

    await replacePrimaryLeadContact({
      admin: admin as any,
      leadId: "lead-1",
      contactTypeCode: "email",
      contactValue: "lead@example.com",
    });

    expect(deleted).toEqual([
      { table: "lead_contacts", field: "lead_id", value: "lead-1" },
    ]);
    expect(inserted).toEqual([
      expect.objectContaining({
        table: "lead_contact_types",
        payload: { code: "email", label: "Email" },
      }),
      expect.objectContaining({
        table: "lead_contacts",
        payload: {
          lead_id: "lead-1",
          contact_type_id: "contact-type-1",
          contact_value: "lead@example.com",
          is_primary: true,
        },
      }),
    ]);
  });

  it("loads normalized scoring config rows into the legacy config shape", async () => {
    const { admin } = createScoringAdmin();

    const config = await loadLeadScoringConfig(admin as any, "team-1");

    expect(config).toEqual({
      thresholds: {
        low: 35,
        high: 80,
      },
      rules: [
        {
          fieldKey: "company_size",
          label: "Company Size",
          weight: 5,
          optionWeights: {
            enterprise: 9,
          },
        },
      ],
    });
  });

  it("saves scoring config into normalized rules and weights tables", async () => {
    const { admin, inserts, deletes } = createScoringAdmin();

    await saveLeadScoringConfig({
      admin: admin as any,
      teamId: "team-1",
      config: {
        thresholds: { low: 40, high: 75 },
        rules: [
          {
            fieldKey: "company_size",
            label: "Company Size",
            weight: 4,
            optionWeights: {
              enterprise: 10,
              startup: 2,
            },
          },
        ],
      },
    });

    expect(deletes).toEqual([
      {
        table: "lead_scoring_rule_option_weights",
        mode: "rule_id",
        value: ["rule-old-1", "rule-old-2"],
      },
      {
        table: "lead_scoring_rules",
        mode: "team_id",
        value: "team-1",
      },
    ]);
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "lead_scoring_thresholds",
          payload: expect.objectContaining({
            team_id: "team-1",
            low_threshold: 40,
            high_threshold: 75,
          }),
        }),
        expect.objectContaining({
          table: "lead_scoring_rules",
          payload: [
            expect.objectContaining({
              team_id: "team-1",
              field_key: "company_size",
              label: "Company Size",
              weight: 4,
              position: 0,
            }),
          ],
        }),
        expect.objectContaining({
          table: "lead_scoring_rule_option_weights",
          payload: [
            expect.objectContaining({
              rule_id: "rule-new-1",
              option_value: "enterprise",
              weight: 10,
              position: 0,
            }),
            expect.objectContaining({
              rule_id: "rule-new-1",
              option_value: "startup",
              weight: 2,
              position: 1,
            }),
          ],
        }),
      ]),
    );
  });

  it("hydrates and replaces booking-link work days from the normalized table", async () => {
    const { admin, deleted, inserted } = createWorkDayAdmin();

    const rows = await attachBookingLinkWorkDays({
      admin: admin as any,
      rows: [{ id: "link-1", slug: "a" }, { id: "link-2", slug: "b" }],
    });

    expect(rows).toEqual([
      expect.objectContaining({ id: "link-1", work_days: [1, 3] }),
      expect.objectContaining({ id: "link-2", work_days: [5] }),
    ]);

    await replaceBookingLinkWorkDays({
      admin: admin as any,
      bookingLinkId: "link-1",
      weekdays: ["3", 1, "3", "x", 5],
    });

    expect(deleted).toEqual([
      {
        table: "booking_link_work_days",
        field: "booking_link_id",
        value: "link-1",
      },
    ]);
    expect(inserted).toEqual([
      {
        table: "booking_link_work_days",
        payload: [
          { booking_link_id: "link-1", weekday: 1 },
          { booking_link_id: "link-1", weekday: 3 },
          { booking_link_id: "link-1", weekday: 5 },
        ],
      },
    ]);
  });
});
