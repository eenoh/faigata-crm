import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveRequestLocaleMock = vi.fn();
const applyEntityTranslationsMock = vi.fn();
const syncEntityTranslationSourcesMock = vi.fn();
const recomputeLeadScoreMock = vi.fn();
let currentAdmin: any;

vi.mock("@/features/i18n/server/requestLocale", () => ({
  resolveRequestLocale: resolveRequestLocaleMock,
}));

vi.mock("@/features/crm/server/custom-value-translations", () => ({
  applyEntityTranslations: applyEntityTranslationsMock,
  syncEntityTranslationSources: syncEntityTranslationSourcesMock,
}));

vi.mock("@/features/crm/scoring/recomputeLeadScore", () => ({
  recomputeLeadScore: recomputeLeadScoreMock,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    return currentAdmin;
  },
}));

function createAdminMock() {
  const insertedMessages: Record<string, unknown>[] = [];

  const admin = {
    from(table: string) {
      if (table === "lead_messages") {
        return {
          select() {
            return {
              eq(field: string, value: string) {
                if (field !== "team_id" || value !== "team-1") {
                  throw new Error(`Unexpected lead_messages eq: ${field}=${value}`);
                }

                return {
                  eq(nextField: string, nextValue: string) {
                    if (nextField !== "lead_id" || nextValue !== "lead-1") {
                      throw new Error(
                        `Unexpected lead_messages nested eq: ${nextField}=${nextValue}`,
                      );
                    }

                    return {
                      order: async () => ({
                        data: [
                          {
                            id: "msg-1",
                            team_id: "team-1",
                            lead_id: "lead-1",
                            sender_profile_id: "user-1",
                            direction: "outbound",
                            channel: "dm",
                            body: "Call scheduled",
                            sent_at: "2026-04-10T08:00:00.000Z",
                            created_at: "2026-04-10T08:00:00.000Z",
                            event_type: null,
                            event_data: null,
                            sender: null,
                          },
                          {
                            id: "msg-2",
                            team_id: "team-1",
                            lead_id: "lead-1",
                            sender_profile_id: "user-1",
                            direction: "internal",
                            channel: "pipeline",
                            body: "LEAD_CREATED|Anna",
                            sent_at: "2026-04-10T08:05:00.000Z",
                            created_at: "2026-04-10T08:05:00.000Z",
                            event_type: "lead_created",
                            event_data: { lead_name: "Anna" },
                            sender: null,
                          },
                          {
                            id: "msg-3",
                            team_id: "team-1",
                            lead_id: "lead-1",
                            sender_profile_id: "user-1",
                            direction: "outbound",
                            channel: "pipeline",
                            body: "Manual pipeline note",
                            sent_at: "2026-04-10T08:06:00.000Z",
                            created_at: "2026-04-10T08:06:00.000Z",
                            event_type: null,
                            event_data: null,
                            sender: null,
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
          insert(payload: Record<string, unknown>) {
            insertedMessages.push(payload);

            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: "msg-new",
                      team_id: payload.team_id ?? null,
                      lead_id: payload.lead_id ?? null,
                      sender_profile_id: payload.sender_profile_id ?? null,
                      direction: payload.direction ?? null,
                      channel: payload.channel ?? null,
                      body: payload.body ?? null,
                      sent_at: payload.sent_at ?? null,
                      created_at: "2026-04-10T09:00:00.000Z",
                      event_type: null,
                      event_data: null,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "custom_value_translation_sources") {
        return {
          select() {
            return {
              eq(field: string, value: string) {
                if (field !== "team_id" || value !== "team-1") {
                  throw new Error(
                    `Unexpected custom_value_translation_sources eq: ${field}=${value}`,
                  );
                }

                return {
                  eq(nextField: string, nextValue: string) {
                    if (nextField !== "entity_table" || nextValue !== "lead_messages") {
                      throw new Error(
                        `Unexpected translation_sources nested eq: ${nextField}=${nextValue}`,
                      );
                    }

                    return {
                      eq(lastField: string, lastValue: string) {
                        if (lastField !== "field_key" || lastValue !== "body") {
                          throw new Error(
                            `Unexpected translation_sources final eq: ${lastField}=${lastValue}`,
                          );
                        }

                        return {
                          in: async () => ({
                            data: [
                              {
                                id: "source-1",
                                entity_id: "msg-1",
                                field_key: "body",
                                source_text: "Call scheduled",
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
      }

      if (table === "custom_value_translations") {
        return {
          select(columns: string) {
            expect(columns).toContain("locale");

            return {
              in(field: string, values: string[]) {
                if (field !== "source_id" || values[0] !== "source-1") {
                  throw new Error(
                    `Unexpected custom_value_translations in: ${field}=${values.join(",")}`,
                  );
                }

                return {
                  eq(localeField: string, localeValue: string) {
                    if (localeField !== "locale" || localeValue !== "de") {
                      throw new Error(
                        `Unexpected custom_value_translations eq: ${localeField}=${localeValue}`,
                      );
                    }

                    return Promise.resolve({
                      data: [
                        {
                          source_id: "source-1",
                          locale: "de",
                          translated_text: "Anruf geplant",
                          is_manual: false,
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, insertedMessages };
}

describe("crm lead messages route", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveRequestLocaleMock.mockReset();
    applyEntityTranslationsMock.mockReset();
    syncEntityTranslationSourcesMock.mockReset();
    recomputeLeadScoreMock.mockReset();

    applyEntityTranslationsMock.mockImplementation(async ({ rows, fields }) => {
      for (const row of rows) {
        const translated =
          row.id === "msg-1"
            ? "Anruf geplant"
            : row.id === "msg-3"
              ? "Manuelle Pipeline-Notiz"
              : null;

        if (translated) {
          fields[0].assign(row, translated);
        }
      }

      return rows;
    });
  });

  it("translates free-text bodies while preserving known pipeline events", async () => {
    const { admin } = createAdminMock();
    currentAdmin = admin;
    resolveRequestLocaleMock.mockResolvedValue("de");

    const { GET } = await import("@/app/api/crm/lead-messages/route");
    const response = await GET(
      new Request(
        "https://example.com/api/crm/lead-messages?teamId=team-1&leadId=lead-1",
        {
          headers: {
            "x-faigata-locale": "de",
          },
        },
      ),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(resolveRequestLocaleMock).toHaveBeenCalled();
    expect(data).toEqual([
      expect.objectContaining({
        id: "msg-1",
        body: "Anruf geplant",
      }),
      expect.objectContaining({
        id: "msg-2",
        body: "LEAD_CREATED|Anna",
        event_type: "lead_created",
      }),
      expect.objectContaining({
        id: "msg-3",
        body: "Manuelle Pipeline-Notiz",
        event_type: null,
      }),
    ]);
    expect(applyEntityTranslationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        requestedLocale: "de",
        rows: expect.arrayContaining([
          expect.objectContaining({ id: "msg-1" }),
          expect.objectContaining({ id: "msg-3" }),
        ]),
      }),
    );
  });

  it("stores canonical source text on create while syncing translations with the request locale", async () => {
    const { admin, insertedMessages } = createAdminMock();
    currentAdmin = admin;
    resolveRequestLocaleMock.mockResolvedValue("de");
    recomputeLeadScoreMock.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/crm/lead-messages/route");
    const response = await POST(
      new Request(
        "https://example.com/api/crm/lead-messages?teamId=team-1&leadId=lead-1",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-faigata-locale": "de",
          },
          body: JSON.stringify({
            direction: "outbound",
            channel: "dm",
            body: "Follow up tomorrow",
            sent_at: "2026-04-10T09:00:00.000Z",
            sender_profile_id: "user-1",
          }),
        },
      ),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        id: "msg-new",
        body: "Follow up tomorrow",
        team_id: "team-1",
        lead_id: "lead-1",
      }),
    );
    expect(insertedMessages).toEqual([
      expect.objectContaining({
        team_id: "team-1",
        lead_id: "lead-1",
        body: "Follow up tomorrow",
        channel: "dm",
        direction: "outbound",
      }),
    ]);
    expect(syncEntityTranslationSourcesMock).toHaveBeenCalledWith({
      admin,
      teamId: "team-1",
      entityTable: "lead_messages",
      rows: [
        expect.objectContaining({
          id: "msg-new",
          body: "Follow up tomorrow",
        }),
      ],
      fields: [
        expect.objectContaining({
          fieldKey: "body",
          sourceText: expect.any(Function),
        }),
      ],
      sourceLocale: "de",
    });

    const syncArgs = syncEntityTranslationSourcesMock.mock.calls[0]?.[0];
    expect(syncArgs.fields[0].sourceText(syncArgs.rows[0])).toBe(
      "Follow up tomorrow",
    );
    expect(recomputeLeadScoreMock).toHaveBeenCalledWith("team-1", "lead-1");
  });
});
