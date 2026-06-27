import { beforeEach, describe, expect, it, vi } from "vitest";

const readJsonBodyMock = vi.fn();
const requireAuthenticatedRequestUserMock = vi.fn();

vi.mock("@/lib/http/request", () => ({
  readJsonBody: readJsonBodyMock,
}));

vi.mock("@/features/auth/server/request-auth", () => ({
  requireAuthenticatedRequestUser: requireAuthenticatedRequestUserMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => {
    throw new Error("Supabase admin client should not be used in guard tests");
  }),
}));

describe("auth-sensitive route guards", () => {
  beforeEach(() => {
    readJsonBodyMock.mockReset();
    requireAuthenticatedRequestUserMock.mockReset();
    readJsonBodyMock.mockResolvedValue({});
    requireAuthenticatedRequestUserMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
  });

  it("blocks after-login without an authenticated request user", async () => {
    const { handleAfterLogin } = await import(
      "@/features/auth/server/after-login.handler"
    );

    const response = await handleAfterLogin(new Request("https://example.com"));
    expect(response.status).toBe(401);
  });

  it("blocks complete-registration without an authenticated request user", async () => {
    const { handleCompleteRegistration } = await import(
      "@/features/auth/server/complete-registration.handler"
    );

    const response = await handleCompleteRegistration(
      new Request("https://example.com"),
    );
    expect(response.status).toBe(401);
  });

  it("blocks onboarding without an authenticated request user", async () => {
    const { POST } = await import("@/app/api/crm/onboarding/route");

    const response = await POST(new Request("https://example.com"));
    expect(response.status).toBe(401);
  });
});
