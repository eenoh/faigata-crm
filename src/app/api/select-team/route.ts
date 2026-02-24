/**
 * Simplifications made:
 * • Removed unused cookies import (we use res.cookies directly)
 * • Flattened validation with early return
 * • Narrowed JSON parsing safely
 * • Reduced try/catch surface area
 * • Kept identical response shape and cookie behavior
 */

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const teamId = typeof body?.teamId === "string" ? body.teamId : null;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

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
      { status: 500 },
    );
  }
}
