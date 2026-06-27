import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type RequestUserResult =
  | { ok: true; user: User; token: string }
  | { ok: false; reason: "missing_token" | "invalid_session" };

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key) cookies[key] = value;
  }

  return cookies;
}

function isChunkedCookieKey(key: string) {
  return /(?:^supabase-auth-token$|(?:^|-)auth-token)\.\d+$/.test(key);
}

function getChunkedCookieValue(
  cookies: Record<string, string>,
  baseName: string,
): string | null {
  const parts = Object.entries(cookies)
    .filter(([key]) => key === baseName || key.startsWith(`${baseName}.`))
    .sort(([leftKey], [rightKey]) => {
      if (leftKey === baseName) return -1;
      if (rightKey === baseName) return 1;

      const leftIndex = Number(leftKey.slice(baseName.length + 1));
      const rightIndex = Number(rightKey.slice(baseName.length + 1));

      return leftIndex - rightIndex;
    });

  if (!parts.length) return null;

  try {
    return decodeURIComponent(parts.map(([, value]) => value).join(""));
  } catch {
    return null;
  }
}

function getSerializedAuthCookie(cookies: Record<string, string>): string | null {
  const directAuthCookieKey =
    Object.keys(cookies).find((key) => key === "supabase-auth-token") ??
    Object.keys(cookies).find((key) => key.endsWith("-auth-token"));

  if (directAuthCookieKey) {
    return getChunkedCookieValue(cookies, directAuthCookieKey);
  }

  const chunkedBaseNames = Array.from(
    new Set(
      Object.keys(cookies)
        .filter((key) => isChunkedCookieKey(key))
        .map((key) => key.replace(/\.\d+$/, "")),
    ),
  );

  for (const baseName of chunkedBaseNames) {
    const serialized = getChunkedCookieValue(cookies, baseName);
    if (serialized) return serialized;
  }

  return null;
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export function getAccessTokenFromCookies(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));

  const direct =
    cookies["sb-access-token"] ||
    cookies["supabase-access-token"] ||
    cookies["access-token"];

  if (direct) return decodeURIComponent(direct);

  const serializedAuthCookie = getSerializedAuthCookie(cookies);
  if (!serializedAuthCookie) return null;

  try {
    const parsed = JSON.parse(serializedAuthCookie);
    return Array.isArray(parsed) && typeof parsed[0] === "string"
      ? parsed[0]
      : null;
  } catch {
    return null;
  }
}

export function getRequestAuthToken(request: Request): string | null {
  return getBearerToken(request) ?? getAccessTokenFromCookies(request);
}

export async function getUserFromAccessToken(
  accessToken: string | null,
): Promise<User | null> {
  if (!accessToken) return null;

  const { data, error } = await getSupabaseAdminClient().auth.getUser(
    accessToken,
  );

  if (error) return null;

  return data.user ?? null;
}

export async function getRequestUser(
  request: Request,
): Promise<RequestUserResult> {
  const token = getRequestAuthToken(request);
  if (!token) return { ok: false, reason: "missing_token" };

  const user = await getUserFromAccessToken(token);
  if (!user) return { ok: false, reason: "invalid_session" };

  return { ok: true, user, token };
}


