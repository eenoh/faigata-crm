import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveRequestLocaleMock = vi.fn();
const applyEntityTranslationsMock = vi.fn();
const deleteEntityTranslationsMock = vi.fn();
const syncEntityTranslationSourcesMock = vi.fn();
const getNormalizedLeadFieldDefinitionsMock = vi.fn();
const replaceLeadFieldOptionsMock = vi.fn();
let currentAdmin: any;

vi.mock("@/features/i18n/server/requestLocale", () => ({
  resolveRequestLocale: resolveRequestLocaleMock,
}));

vi.mock("@/features/crm/server/custom-value-translations", () => ({
  applyEntityTranslations: applyEntityTranslationsMock,
  deleteEntityTranslations: deleteEntityTranslationsMock,
  syncEntityTranslationSources: syncEntityTranslationSourcesMock,
}));

vi.mock("@/features/crm/server/normalized-crm", () => ({
  getNormalizedLeadFieldDefinitions: getNormalizedLeadFieldDefinitionsMock,
  replaceLeadFieldOptions: replaceLeadFieldOptionsMock,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    return currentAdmin;
  },
}));

function createLeadFieldsAdmin() {
  const deletedIds: string[][] = [];
  const upsertedRows: Record<string, unknown>[][] = [];

  const existingRows = [
    { id: "field-old", key: "old_field" },
    { id: "field-company", key: "company_size" },
  ];

  const savedRows = [
    {
      id: "field-company",
      key: "company_size",
      label: "Company Size",
      type: "select",
      position: 0,
    },
    {
      id: "field-industry",
      key: "industry",
      label: "Industry",
      type: "text",
      position: 1,
    },
  ];

  const admin = {
    from(table: string) {
      if (table !== "lead_fields") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(columns: string) {
          expect(columns).toBe("id, key");

          return {
            eq(field: string, value: string) {
              expect(field).toBe("team_id");
              expect(value).toBe("team-1");
              return Promise.resolve({ data: existingRows, error: null });
            },
          };
        },
        delete() {
          return {
            in(field: string, ids: string[]) {
              expect(field).toBe("id");
              deletedIds.push(ids);
              return Promise.resolve({ error: null });
            },
          };
        },
        upsert(rows: Record<string, unknown>[], options: unknown) {
          upsertedRows.push(rows);
          expect(options).toEqual({ onConflict: "id" });

          return {
            select(columns: string) {
              expect(columns).toBe("id, key, label, type, position");
              return Promise.resolve({ data: savedRows, error: null });
            },
          };
        },
      };
    },
  };

  return { admin, deletedIds, upsertedRows, savedRows };
}

describe("crm lead fields route", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveRequestLocaleMock.mockReset();
    applyEntityTranslationsMock.mockReset();
    deleteEntityTranslationsMock.mockReset();
    syncEntityTranslationSourcesMock.mockReset();
    getNormalizedLeadFieldDefinitionsMock.mockReset();
    replaceLeadFieldOptionsMock.mockReset();
  });

  it("loads normalized lead fields and translates labels and select options", async () => {
    currentAdmin = { from: vi.fn() };
    resolveRequestLocaleMock.mockResolvedValue("de");
    getNormalizedLeadFieldDefinitionsMock.mockResolvedValue([
      {
        id: "field-1",
        team_id: "team-1",
        key: "company_size",
        label: "Company Size",
        type: "select",
        options: ["Enterprise", "Startup"],
        position: 0,
      },
      {
        id: "field-2",
        team_id: "team-1",
        key: "website",
        label: "Website",
        type: "link",
        options: [],
        position: 1,
      },
    ]);
    applyEntityTranslationsMock.mockImplementation(async ({ rows, fields }) => {
      if (rows[0] && "label" in rows[0]) {
        for (const row of rows) {
          if (row.id === "field-1") {
            fields[0].assign(row, "Unternehmensgroesse");
          }
        }
      } else {
        for (const row of rows) {
          if (row.option === "Enterprise") {
            fields[0].assign(row, "Konzern");
          }
          if (row.option === "Startup") {
            fields[0].assign(row, "Startup DE");
          }
        }
      }

      return rows;
    });

    const { POST } = await import("@/app/api/crm/lead-fields/route");
    const response = await POST(
      new Request("https://example.com/api/crm/lead-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: "team-1" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getNormalizedLeadFieldDefinitionsMock).toHaveBeenCalledWith(
      currentAdmin,
      "team-1",
    );
    expect(data).toEqual([
      expect.objectContaining({
        id: "field-1",
        label: "Unternehmensgroesse",
        options: ["Enterprise", "Startup"],
        optionLabels: ["Konzern", "Startup DE"],
      }),
      expect.objectContaining({
        id: "field-2",
        label: "Website",
        optionLabels: [],
      }),
    ]);
  });

  it("saves lead fields, removes deleted rows, and syncs normalized options", async () => {
    const { admin, deletedIds, upsertedRows, savedRows } = createLeadFieldsAdmin();
    currentAdmin = admin;
    resolveRequestLocaleMock.mockResolvedValue("de");

    const { POST } = await import("@/app/api/crm/lead-fields/route");
    const response = await POST(
      new Request("https://example.com/api/crm/lead-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: "team-1",
          fields: [
            {
              key: "company_size",
              label: "Company Size",
              type: "select",
              options: ["Enterprise", "Startup", "Enterprise"],
            },
            {
              key: "industry",
              label: "Industry",
              type: "text",
            },
          ],
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, count: 2 });
    expect(deletedIds).toEqual([["field-old"]]);
    expect(upsertedRows).toEqual([
      [
        {
          id: "field-company",
          team_id: "team-1",
          key: "company_size",
          label: "Company Size",
          type: "select",
          position: 0,
        },
        {
          id: undefined,
          team_id: "team-1",
          key: "industry",
          label: "Industry",
          type: "text",
          position: 1,
        },
      ],
    ]);
    expect(deleteEntityTranslationsMock).toHaveBeenCalledWith({
      admin,
      entityTable: "lead_fields",
      entityIds: ["field-old"],
    });
    expect(replaceLeadFieldOptionsMock).toHaveBeenCalledTimes(2);
    expect(replaceLeadFieldOptionsMock).toHaveBeenNthCalledWith(1, {
      admin,
      fieldId: "field-company",
      options: ["Enterprise", "Startup", "Enterprise"],
    });
    expect(replaceLeadFieldOptionsMock).toHaveBeenNthCalledWith(2, {
      admin,
      fieldId: "field-industry",
      options: [],
    });
    expect(syncEntityTranslationSourcesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin,
        teamId: "team-1",
        entityTable: "lead_fields",
        rows: savedRows.map((row) =>
          expect.objectContaining({
            id: row.id,
            label: row.label,
          }),
        ),
        sourceLocale: "de",
      }),
    );
  });
});
