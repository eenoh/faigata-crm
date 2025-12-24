import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const jwt = authHeader.slice("Bearer ".length);
  const { data } = await supabaseAdmin.auth.getUser(jwt);
  return data?.user ?? null;
}

async function resolveTeamIdForCaller(callerId: string): Promise<string | null> {
  // 1) Prefer current team from cookie (set by your /api/select-team)
  const cookieStore = await cookies();
  const cookieTeam = cookieStore.get("current_team_id")?.value;
  if (cookieTeam) return cookieTeam;

  // 2) Fallback: caller profile team_id
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("team_id")
    .eq("id", callerId)
    .maybeSingle();

  return (data?.team_id as string | null) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { userId?: string };
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
    }

    // Prevent self-removal
    if (user.id === userId) {
      return NextResponse.json({ ok: false, error: "You cannot remove yourself." }, { status: 400 });
    }

    // Resolve teamId from workspace/database
    const teamId = await resolveTeamIdForCaller(user.id);
    if (!teamId) {
      return NextResponse.json({ ok: false, error: "No team selected." }, { status: 400 });
    }

    // Permission check (Manager/Admin) from caller profile roles (array)
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const callerRoles: string[] = Array.isArray(callerProfile?.role) ? callerProfile!.role : [];
    const isAdmin = callerRoles.includes("Admin");
    const isManager = callerRoles.includes("Manager") || isAdmin;

    if (!isManager) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Ensure target is actually in THIS team (profiles.team_id)
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("team_id")
      .eq("id", userId)
      .maybeSingle();

    if (!targetProfile) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    }

    if (targetProfile.team_id !== teamId) {
      return NextResponse.json(
        { ok: false, error: "That user is not a member of your current team." },
        { status: 400 }
      );
    }

    // Remove team association from profiles (your chosen “delete” behavior)
    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({
        team_id: null,
        role: [],
        is_active: false,
      })
      .eq("id", userId)
      .eq("team_id", teamId);

    if (updErr) {
      return NextResponse.json({ ok: false, error: "Failed to remove team member." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team-member-delete]", err);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
