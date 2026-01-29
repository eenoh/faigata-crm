import { NextResponse } from "next/server";
import { cookies } from "next/headers";
// import your server-side Supabase client if you prefer DB-based storage
// import { createServerClient } from "@/lib/supabaseServer"; // example

export async function POST(request: Request) {
  try {
    const { teamId } = await request.json();

    if (!teamId || typeof teamId !== "string") {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 }
      );
    }

    // store teamId in a cookie
    const res = NextResponse.json({ ok: true });
    res.cookies.set("current_team_id", teamId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return res;

  } catch (err) {
    console.error("[select-team] error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
