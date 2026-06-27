import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/auth/session";

export type AuthenticatedRequestUser =
  | {
      ok: true;
      user: User;
      userId: string;
      token: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function normalizeRequestedUserId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function requireAuthenticatedRequestUser(
  request: Request,
  expectedUserId?: unknown,
): Promise<AuthenticatedRequestUser> {
  const auth = await getRequestUser(request);

  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const requestedUserId = normalizeRequestedUserId(expectedUserId);
  if (requestedUserId && requestedUserId !== auth.user.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user: auth.user,
    userId: auth.user.id,
    token: auth.token,
  };
}
