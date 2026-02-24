import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVAILABLE_ROLES = [
  "Prospector",
  "Setter",
  "Closer",
  "Manager",
  "Admin",
] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

/**
 * Must match your Postgres enum values exactly.
 */
const TO_DB_ROLE: Record<TeamRole, TeamRole> = {
  Prospector: "Prospector",
  Setter: "Setter",
  Closer: "Closer",
  Manager: "Manager",
  Admin: "Admin",
};

function baseUrl(req: NextRequest) {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  return env.replace(/\/$/, "");
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeTeamRoleArray(raw: unknown): TeamRole[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => String(x).trim())
      .filter((x): x is TeamRole =>
        (AVAILABLE_ROLES as readonly string[]).includes(x),
      );
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    return (AVAILABLE_ROLES as readonly string[]).includes(s)
      ? [s as TeamRole]
      : [];
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    // 1) Verify caller
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 },
      );
    }
    const jwt = authHeader.slice("Bearer ".length).trim();

    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt);
    const user = userRes?.user ?? null;
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse body (defensive)
    const body = (await req.json().catch(() => null)) as {
      email?: string;
      roles?: unknown;
      companyId?: string | null;
    } | null;

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const roles = uniq(normalizeTeamRoleArray(body?.roles));
    const companyId =
      typeof body?.companyId === "string" ? body.companyId.trim() : null;

    if (!email || roles.length === 0) {
      return NextResponse.json(
        { error: "Email and at least one role are required." },
        { status: 400 },
      );
    }

    // 3) Resolve teamId server-side (workspace)
    let teamId: string | null = null;
    let resolvedCompanyId: string | null = companyId;

    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("team_id, company_id")
      .eq("id", user.id)
      .maybeSingle();

    // don't hard-fail here; fallback to team_members/meta
    if (profErr) console.warn("[team-invites] profiles lookup failed", profErr);

    if (profile?.team_id) teamId = String(profile.team_id);
    if (!resolvedCompanyId && profile?.company_id)
      resolvedCompanyId = String(profile.company_id);

    if (!teamId) {
      const { data: member, error: memErr } = await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true, nullsFirst: true })
        .limit(1)
        .maybeSingle();

      if (memErr)
        console.warn("[team-invites] team_members lookup failed", memErr);
      if (member?.team_id) teamId = String(member.team_id);
    }

    if (!teamId) {
      const metaTeam = (user.user_metadata as any)?.primary_team_id;
      if (typeof metaTeam === "string" && metaTeam.trim().length > 0) {
        teamId = metaTeam.trim();
      }
    }

    if (!teamId) {
      return NextResponse.json(
        { error: "Could not resolve teamId for current user." },
        { status: 400 },
      );
    }

    // 4) Create invite row (role is ARRAY in your DB)
    const token = randomUUID();
    const rolesDb = roles.map((r) => TO_DB_ROLE[r]); // array of enum strings

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .insert({
        team_id: teamId,
        email,
        role: rolesDb, // ✅ array
        invited_by: user.id,
        token,
        company_id: resolvedCompanyId,
      })
      .select("id, token")
      .single();

    if (inviteError || !invite) {
      console.error("[team-invites] insert error", inviteError);
      return NextResponse.json(
        {
          error: "Failed to create invite",
          supabase: {
            message: inviteError?.message,
            details: (inviteError as any)?.details,
            hint: (inviteError as any)?.hint,
            code: (inviteError as any)?.code,
          },
        },
        { status: 500 },
      );
    }

    // 5) Optional: also store per-role rows
    if (rolesDb.length > 0) {
      const roleRows = rolesDb.map((r) => ({ invite_id: invite.id, role: r }));
      const { error: rolesError } = await supabaseAdmin
        .from("team_invite_roles")
        .insert(roleRows);
      if (rolesError)
        console.warn("[team-invite-roles] insert error", rolesError);
    }

    // 6) Accept link
    // NOTE: your GET handler expects inviteId query param (not invite)
    const acceptUrl = `${baseUrl(req)}/invite/accept?inviteId=${encodeURIComponent(
      invite.id,
    )}`;

    // 7) Send Supabase invite email
    const { data: invitedUser, error: inviteUserError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: acceptUrl,
        data: {
          invite_id: invite.id,
          team_id: teamId,
          company_id: resolvedCompanyId,
          roles: rolesDb,
        },
      });

    if (inviteUserError) {
      console.error("[team-invites] inviteUserByEmail error", inviteUserError);
      return NextResponse.json(
        {
          error: "Failed to send invite email.",
          supabase: {
            message: inviteUserError.message,
            status: (inviteUserError as any).status,
            name: inviteUserError.name,
          },
        },
        { status: 500 },
      );
    }

    // 8) Store auth user id if returned
    const invitedUserId = invitedUser?.user?.id
      ? String(invitedUser.user.id)
      : null;
    if (invitedUserId) {
      const { error: updErr } = await supabaseAdmin
        .from("team_invites")
        .update({ user_id: invitedUserId })
        .eq("id", invite.id);

      if (updErr)
        console.warn("[team-invites] failed to store user_id", updErr);
    }

    return NextResponse.json({ ok: true, acceptUrl, inviteId: invite.id });
  } catch (err) {
    console.error("[team-invites] unexpected error", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
