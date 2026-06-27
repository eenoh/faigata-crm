// src/app/api/crm/integrations/calendar/google/disconnect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function revokeToken(token: string) {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // best-effort revoke; ignore network errors
  }
}

export async function POST(req: NextRequest) {
  const auth = await getRequestUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = auth.user.id;

  const { data: tokenRow } = await supabaseAdmin
    .from("user_google_calendar_tokens")
    .select("access_token, refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const accessToken = (tokenRow as any)?.access_token as string | undefined;
  const refreshToken = (tokenRow as any)?.refresh_token as string | undefined;

  if (accessToken) await revokeToken(accessToken);
  if (refreshToken) await revokeToken(refreshToken);

  await supabaseAdmin
    .from("user_google_calendar_tokens")
    .delete()
    .eq("user_id", userId);

  const res = NextResponse.json({ success: true });
  res.cookies.set("calendar_google_connected", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.isProduction(),
    maxAge: 0,
  });

  return res;
}
