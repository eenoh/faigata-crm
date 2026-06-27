import { beforeAll, describe, expect, it } from "vitest";

function buildChunkedAuthCookie(tokens: string[]) {
  const serialized = encodeURIComponent(JSON.stringify(tokens));
  const midpoint = Math.ceil(serialized.length / 2);
  return [serialized.slice(0, midpoint), serialized.slice(midpoint)];
}

describe("auth session helpers", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("prefers bearer tokens over cookie tokens", async () => {
    const { getRequestAuthToken } = await import("@/lib/auth/session");

    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer bearer-token",
        cookie: "supabase-auth-token=%5B%22cookie-token%22%2C%22refresh-token%22%5D",
      },
    });

    expect(getRequestAuthToken(request)).toBe("bearer-token");
  });

  it("parses chunked Supabase auth cookies", async () => {
    const { getAccessTokenFromCookies } = await import("@/lib/auth/session");
    const [part0, part1] = buildChunkedAuthCookie([
      "chunked-access-token",
      "refresh-token",
    ]);

    const request = new Request("https://example.com", {
      headers: {
        cookie: `sb-project-auth-token.0=${part0}; sb-project-auth-token.1=${part1}`,
      },
    });

    expect(getAccessTokenFromCookies(request)).toBe("chunked-access-token");
  });
});
