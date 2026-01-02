import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Require bearer token (same pattern as your other integration routes)
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");

  const accessJwt =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

  if (!accessJwt) {
    return NextResponse.json({ error: "missing_auth" }, { status: 401 });
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(accessJwt);

  if (userError || !userData?.user) {
    return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  // ✅ Clear the UI-hint cookie so the user can re-run connect cleanly
  res.cookies.set("calendar_google_connected", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });

  return res;
}
