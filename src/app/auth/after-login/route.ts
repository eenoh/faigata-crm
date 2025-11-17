// src/app/api/auth/after-login/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/auth/after-login
// body: { userId: string }
export async function POST(req: Request) {
  const { userId } = (await req.json()) as { userId?: string };

  if (!userId) {
    return NextResponse.json(
      { error: "Missing userId" },
      { status: 400 }
    );
  }

  // Find one membership for this user + its team
  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select("team_id, role, teams(onboarding_completed)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("after-login: DB error", error);
    return NextResponse.json(
      { error: "Database error" },
      { status: 500 }
    );
  }

  // If user has no team yet, treat as "needs onboarding" – they’ll create the first team.
  if (!data) {
    return NextResponse.json({ needsOnboarding: true });
  }

  const role = (data.role ?? "").toLowerCase();
  const isAdmin = role === "admin";

  // `teams:onboarding_complete(*)` returns an object; adjust property name if needed.
  const team = (data as any).teams as { onboarding_complete?: boolean } | null;
  const onboardingDone = team?.onboarding_complete ?? false;

  const needsOnboarding = isAdmin && !onboardingDone;

  return NextResponse.json({ needsOnboarding });
}
