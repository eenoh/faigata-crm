import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequestUserMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getRequestUser: getRequestUserMock,
}));

describe("requireAuthenticatedRequestUser", () => {
  beforeEach(() => {
    getRequestUserMock.mockReset();
  });

  it("returns a 401 response when the request has no valid session", async () => {
    getRequestUserMock.mockResolvedValue({ ok: false, reason: "missing_token" });

    const { requireAuthenticatedRequestUser } = await import(
      "@/features/auth/server/request-auth"
    );

    const result = await requireAuthenticatedRequestUser(
      new Request("https://example.com"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth failure");
    expect(result.response.status).toBe(401);
  });

  it("returns a 403 response when the browser-supplied user id does not match", async () => {
    getRequestUserMock.mockResolvedValue({
      ok: true,
      token: "token",
      user: {
        id: "user-1",
      },
    });

    const { requireAuthenticatedRequestUser } = await import(
      "@/features/auth/server/request-auth"
    );

    const result = await requireAuthenticatedRequestUser(
      new Request("https://example.com"),
      "user-2",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected auth failure");
    expect(result.response.status).toBe(403);
  });
});
