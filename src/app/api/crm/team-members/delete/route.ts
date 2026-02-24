import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const jwt = m?.[1]?.trim() ?? null;
  if (!jwt) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error) return null;
  return data?.user ?? null;
}

async function resolveTeamIdForCaller(
  callerId: string,
): Promise<string | null> {
  // cookies() can be sync in some Next versions; in others it may be async.
  // This works in both.
  const cookieStore = await Promise.resolve(cookies());
  const cookieTeam = cookieStore.get("current_team_id")?.value;
  if (cookieTeam && cookieTeam.trim().length > 0) return cookieTeam.trim();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("team_id")
    .eq("id", callerId)
    .maybeSingle();

  if (error) return null;

  const tid = data?.team_id;
  return typeof tid === "string" && tid.trim().length > 0 ? tid.trim() : null;
}

function normalizeRoleArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => String(r ?? "").trim()).filter((r) => r.length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await req.json().catch(() => null)) as {
      userId?: unknown;
    } | null;

    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 },
      );
    }

    // Prevent self-removal
    if (String(user.id) === userId) {
      return NextResponse.json(
        { ok: false, error: "You cannot remove yourself." },
        { status: 400 },
      );
    }

    // Resolve teamId from workspace/database
    const teamId = await resolveTeamIdForCaller(String(user.id));
    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "No team selected." },
        { status: 400 },
      );
    }

    // Permission check (Manager/Admin) from caller profile roles (array)
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from("profiles")
      .select("role, team_id")
      .eq("id", user.id)
      .maybeSingle();

    if (callerErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to verify permissions." },
        { status: 500 },
      );
    }

    // Optional extra safety: ensure caller is operating within the selected team
    if (callerProfile?.team_id && String(callerProfile.team_id) !== teamId) {
      return NextResponse.json(
        { ok: false, error: "Team mismatch." },
        { status: 403 },
      );
    }

    const callerRoles = normalizeRoleArray(callerProfile?.role);
    const isAdmin = callerRoles.includes("Admin");
    const isManager = callerRoles.includes("Manager") || isAdmin;

    if (!isManager) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    // Ensure target is actually in THIS team (profiles.team_id)
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("team_id")
      .eq("id", userId)
      .maybeSingle();

    if (targetErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to load target user." },
        { status: 500 },
      );
    }

    if (!targetProfile) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 },
      );
    }

    if (String(targetProfile.team_id ?? "") !== teamId) {
      return NextResponse.json(
        { ok: false, error: "That user is not a member of your current team." },
        { status: 400 },
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
      return NextResponse.json(
        { ok: false, error: "Failed to remove team member." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team-member-delete]", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 },
    );
  }
}
