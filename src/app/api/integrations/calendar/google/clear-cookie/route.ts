import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getRequestUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "invalid_auth" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set("calendar_google_connected", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.isProduction(),
    maxAge: 0,
  });

  return res;
}
