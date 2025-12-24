import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
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

export async function POST(req: NextRequest) {
  try {
    // 1) Verify caller
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
    }
    const jwt = authHeader.slice("Bearer ".length);

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    const user = userRes?.user;
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse body
    const body = (await req.json()) as {
      email?: string;
      roles?: TeamRole[];
      companyId?: string | null;
    };

    const email = body.email?.trim();
    const roles = (body.roles ?? []).filter((r): r is TeamRole =>
      AVAILABLE_ROLES.includes(r as TeamRole)
    );

    if (!email || roles.length === 0) {
      return NextResponse.json(
        { error: "Email and at least one role are required." },
        { status: 400 }
      );
    }

    // 3) Resolve teamId server-side (workspace)
    let teamId: string | null = null;
    let resolvedCompanyId: string | null = body.companyId ?? null;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("team_id, company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.team_id) teamId = profile.team_id;
    if (!resolvedCompanyId && profile?.company_id) resolvedCompanyId = profile.company_id;

    if (!teamId) {
      const { data: member } = await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (member?.team_id) teamId = member.team_id;
    }

    if (!teamId) {
      const metaTeam = (user.user_metadata as any)?.primary_team_id;
      if (typeof metaTeam === "string" && metaTeam.length > 0) teamId = metaTeam;
    }

    if (!teamId) {
      return NextResponse.json({ error: "Could not resolve teamId for current user." }, { status: 400 });
    }

    // 4) Create invite row (✅ role is ARRAY in your DB)
    const token = randomUUID();
    const rolesDb = roles.map((r) => TO_DB_ROLE[r]); // array of enum strings

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .insert({
        team_id: teamId,
        email,
        role: rolesDb,               // ✅ ARRAY FIX
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
        { status: 500 }
      );
    }

    // 5) Optional: also store per-role rows
    const roleRows = rolesDb.map((r) => ({ invite_id: invite.id, role: r }));
    const { error: rolesError } = await supabaseAdmin.from("team_invite_roles").insert(roleRows);
    if (rolesError) console.warn("[team-invite-roles] insert error", rolesError);

    // 6) Accept link
    const acceptUrl = `${baseUrl(req)}/invite/accept?invite=${encodeURIComponent(invite.id)}`;

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
        { status: 500 }
      );
    }

    // 8) Store auth user id if returned
    const invitedUserId = invitedUser?.user?.id;
    if (invitedUserId) {
      const { error: updErr } = await supabaseAdmin
        .from("team_invites")
        .update({ user_id: invitedUserId })
        .eq("id", invite.id);

      if (updErr) console.warn("[team-invites] failed to store user_id", updErr);
    }

    return NextResponse.json({ ok: true, acceptUrl, inviteId: invite.id });
  } catch (err) {
    console.error("[team-invites] unexpected error", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
