import { beforeEach, describe, expect, it, vi } from "vitest";

const getCrmRequestUserMock = vi.fn();
const resolveCrmTeamContextMock = vi.fn();
const recomputeLeadScoreMock = vi.fn();
const getCrmAdminClientMock = vi.fn();

vi.mock("@/features/crm/server/auth", () => ({
  getCrmRequestUser: getCrmRequestUserMock,
}));

vi.mock("@/features/crm/server/team-context", () => ({
  resolveCrmTeamContext: resolveCrmTeamContextMock,
}));

vi.mock("@/features/crm/scoring/recomputeLeadScore", () => ({
  recomputeLeadScore: recomputeLeadScoreMock,
}));

vi.mock("@/features/crm/server/supabase", () => ({
  getCrmAdminClient: getCrmAdminClientMock,
}));

type AdminMockState = {
  insertedLeadMessages: Record<string, unknown>[];
  nextStatus: string;
};

const teamId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "123e4567-e89b-12d3-a456-426614174001";
const bookingId = "123e4567-e89b-12d3-a456-426614174002";
const userId = "123e4567-e89b-12d3-a456-426614174003";
const outcomeId = "123e4567-e89b-12d3-a456-426614174004";

function createEqChain(result: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => result),
  };
  return chain;
}

function createAdminMock(state: AdminMockState) {
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() =>
            createEqChain({
              data: { id: bookingId, lead_id: leadId, team_id: teamId },
              error: null,
            }),
          ),
        };
      }

      if (table === "booking_outcomes") {
        return {
          select: vi.fn(() =>
            createEqChain({
              data: {
                id: outcomeId,
                attended_status: "unknown",
                offer_made: false,
                offer_product_id: null,
                closed_on_call: false,
              },
              error: null,
            }),
          ),
          update: vi.fn((payload) => ({
            eq: vi.fn(() => ({
              data: { ...payload, attended_status: state.nextStatus },
              error: null,
            })),
          })),
        };
      }

      if (table === "lead_messages") {
        return {
          insert: vi.fn((payload) => {
            state.insertedLeadMessages.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "lead_score_events") {
        return {
          insert: vi.fn(() => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function postOutcome(nextStatus: string) {
  const state: AdminMockState = {
    insertedLeadMessages: [],
    nextStatus,
  };

  getCrmAdminClientMock.mockReturnValue(createAdminMock(state));

  const { POST } = await import(
    "@/features/crm/server/booking-outcome.handler"
  );

  const response = await POST(
    new Request(`https://example.test/api/crm/bookings/${bookingId}/outcome`, {
      method: "POST",
      body: JSON.stringify({
        teamId,
        attended_status: nextStatus,
        offer_made: false,
        offer_product_id: null,
        closed_on_call: false,
        notes: "",
      }),
    }),
    { params: Promise.resolve({ bookingId }) },
  );

  return { response, state };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  getCrmRequestUserMock.mockResolvedValue({
    ok: true,
    userId,
  });
  resolveCrmTeamContextMock.mockResolvedValue(undefined);
  recomputeLeadScoreMock.mockResolvedValue(undefined);
});

describe("booking outcome timeline events", () => {
  it.each(["attended", "no_show", "cancelled", "rescheduled"])(
    "persists a pipeline timeline event when attendance changes to %s",
    async (nextStatus) => {
      const { response, state } = await postOutcome(nextStatus);

      expect(response.status).toBe(200);
      expect(state.insertedLeadMessages).toHaveLength(1);
      expect(state.insertedLeadMessages[0]).toMatchObject({
        direction: "outbound",
        channel: "pipeline",
        event_type: "call_attendance_updated",
        event_data: {
          previous_status: "unknown",
          next_status: nextStatus,
        },
      });
    },
  );
});
