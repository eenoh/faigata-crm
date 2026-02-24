// src/app/api/crm/integrations/calendar/google/disconnect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getBearer(req: NextRequest) {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

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
  const jwt = getBearer(req);
  if (!jwt)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = data.user.id;

  // Load tokens (best-effort)
  const { data: tokenRow } = await supabaseAdmin
    .from("user_google_calendar_tokens")
    .select("access_token, refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const accessToken = (tokenRow as any)?.access_token as string | undefined;
  const refreshToken = (tokenRow as any)?.refresh_token as string | undefined;

  // Revoke (best-effort)
  if (accessToken) await revokeToken(accessToken);
  if (refreshToken) await revokeToken(refreshToken);

  // Delete local record (best-effort)
  await supabaseAdmin
    .from("user_google_calendar_tokens")
    .delete()
    .eq("user_id", userId);

  // Clear UI-hint cookie
  const res = NextResponse.json({ success: true });
  res.cookies.set("calendar_google_connected", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });

  return res;
}
