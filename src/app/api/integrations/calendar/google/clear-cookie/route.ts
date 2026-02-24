import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getBearer(req: NextRequest) {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json({ error: "missing_auth" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user) {
    return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  // Clear Google calendar UI-hint cookie
  res.cookies.set("calendar_google_connected", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });

  return res;
}
