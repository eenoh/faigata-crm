import { beforeEach, describe, expect, it, vi } from "vitest";

const loadLeadScoringConfigMock = vi.fn();
const saveLeadScoringConfigMock = vi.fn();
const recomputeLeadScoreMock = vi.fn();
let currentAdmin: any;

vi.mock("@/features/crm/server/normalized-crm", () => ({
  loadLeadScoringConfig: loadLeadScoringConfigMock,
  saveLeadScoringConfig: saveLeadScoringConfigMock,
}));

vi.mock("@/features/crm/scoring/recomputeLeadScore", () => ({
  recomputeLeadScore: recomputeLeadScoreMock,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    return currentAdmin;
  },
}));

function createLeadIdsAdmin() {
  const admin = {
    from(table: string) {
      if (table !== "leads") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select(columns: string) {
          expect(columns).toBe("id");
          return {
            eq(field: string, value: string) {
              expect(field).toBe("team_id");
              expect(value).toBe("team-1");
              return Promise.resolve({
                data: [{ id: "lead-1" }, { id: "lead-2" }],
                error: null,
              });
            },
          };
        },
      };
    },
  };

  return { admin };
}

describe("crm lead scoring config route", () => {
  beforeEach(() => {
    vi.resetModules();
    loadLeadScoringConfigMock.mockReset();
    saveLeadScoringConfigMock.mockReset();
    recomputeLeadScoreMock.mockReset();
  });

  it("reads the normalized scoring config", async () => {
    currentAdmin = { from: vi.fn() };
    loadLeadScoringConfigMock.mockResolvedValue({
      thresholds: { low: 35, high: 80 },
      rules: [
        {
          fieldKey: "company_size",
          label: "Company Size",
          weight: 5,
          optionWeights: { enterprise: 10 },
        },
      ],
    });

    const { POST } = await import("@/app/api/crm/lead-scoring-config/route");
    const response = await POST(
      new Request("https://example.com/api/crm/lead-scoring-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: "team-1",
          action: "get",
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      thresholds: { low: 35, high: 80 },
      rules: [
        {
          fieldKey: "company_size",
          label: "Company Size",
          weight: 5,
          optionWeights: { enterprise: 10 },
        },
      ],
    });
  });

  it("saves sanitized config and recomputes lead scores", async () => {
    const { admin } = createLeadIdsAdmin();
    currentAdmin = admin;
    saveLeadScoringConfigMock.mockResolvedValue(undefined);
    recomputeLeadScoreMock.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/crm/lead-scoring-config/route");
    const response = await POST(
      new Request("https://example.com/api/crm/lead-scoring-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: "team-1",
          action: "save",
          thresholds: { low: "88", high: "20" },
          rules: [
            {
              fieldKey: " company_size ",
              label: "Company Size",
              weight: 99,
              optionWeights: {
                enterprise: 50,
                startup: -30,
              },
            },
            {
              fieldKey: "   ",
              label: "Ignore Me",
              weight: 1,
            },
          ],
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(saveLeadScoringConfigMock).toHaveBeenCalledWith({
      admin,
      teamId: "team-1",
      config: {
        thresholds: { low: 88, high: 93 },
        rules: [
          {
            fieldKey: "company_size",
            label: "Company Size",
            weight: 20,
            optionWeights: {
              enterprise: 20,
              startup: -20,
            },
          },
        ],
      },
    });
    expect(recomputeLeadScoreMock).toHaveBeenCalledTimes(2);
    expect(recomputeLeadScoreMock).toHaveBeenNthCalledWith(1, "team-1", "lead-1");
    expect(recomputeLeadScoreMock).toHaveBeenNthCalledWith(2, "team-1", "lead-2");
    expect(data).toEqual(
      expect.objectContaining({
        ok: true,
        total: 2,
        recomputed: 2,
        failed: 0,
        config: {
          thresholds: { low: 88, high: 93 },
          rules: [
            {
              fieldKey: "company_size",
              label: "Company Size",
              weight: 20,
              optionWeights: {
                enterprise: 20,
                startup: -20,
              },
            },
          ],
        },
      }),
    );
  });

  it("can save without recomputing immediately", async () => {
    currentAdmin = { from: vi.fn() };
    saveLeadScoringConfigMock.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/crm/lead-scoring-config/route");
    const response = await POST(
      new Request("https://example.com/api/crm/lead-scoring-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: "team-1",
          action: "save",
          recomputeAll: false,
          thresholds: { low: 40, high: 70 },
          rules: [],
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(recomputeLeadScoreMock).not.toHaveBeenCalled();
    expect(data).toEqual({
      ok: true,
      recompute: "skipped",
      config: {
        thresholds: { low: 40, high: 70 },
        rules: [],
      },
    });
  });
});
