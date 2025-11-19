// src/app/api/invite/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const AVAILABLE_ROLES = [
  "Prospector",
  "Setter",
  "Closer",
  "Manager",
  "Admin",
] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];
type DbRole = TeamRole;

const INVITE_TTL_HOURS = 24;

const TO_DB_ROLE: Record<TeamRole, DbRole> = {
  Prospector: "Prospector",
  Setter: "Setter",
  Closer: "Closer",
  Manager: "Manager",
  Admin: "Admin",
};

/* -------------- GET: fetch invite metadata for client page -------------- */

export async function GET(req: NextRequest) {
  try {
    const inviteId = req.nextUrl.searchParams.get("inviteId");
    if (!inviteId) {
      return NextResponse.json(
        { error: "Missing inviteId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("team_invites")
      .select(
        `
        id,
        email,
        team_id,
        created_at,
        accepted_at,
        team_invite_roles (
          role
        )
      `
      )
      .eq("id", inviteId)
      .single();

    if (error || !data) {
      console.error("[invite-accept][GET] invite error", error);
      return NextResponse.json(
        { error: "Invite not found or no longer valid." },
        { status: 404 }
      );
    }

    // Already accepted?
    if (data.accepted_at) {
      return NextResponse.json(
        { error: "Invite has already been accepted." },
        { status: 400 }
      );
    }

    // 24h expiry
    if (data.created_at) {
      const created = new Date(data.created_at);
      const expires = new Date(
        created.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000
      );
      if (Date.now() > expires.getTime()) {
        return NextResponse.json(
          { error: "Invite has expired." },
          { status: 410 }
        );
      }
    }

    const roles: TeamRole[] =
      (data.team_invite_roles ?? []).map(
        (r: { role: TeamRole }) => r.role
      ) || [];

    return NextResponse.json({
      email: data.email as string,
      teamId: data.team_id as string,
      companyId: null, // we can derive later if needed
      organizationName: null,
      roles,
    });
  } catch (err) {
    console.error("[invite-accept][GET] unexpected error", err);
    return NextResponse.json(
      { error: "Unexpected error loading invite." },
      { status: 500 }
    );
  }
}

/* ----------------- POST: accept invite + update user ----------------- */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      inviteId?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
    };

    const { inviteId, email, firstName, lastName, password } = body;

    if (!inviteId || !email || !firstName || !lastName || !password) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // 1) Load invite + roles + linked auth user (if any)
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .select(
        `
        id,
        email,
        team_id,
        user_id,
        created_at,
        accepted_at,
        team_invite_roles (
          role
        )
      `
      )
      .eq("id", inviteId)
      .single();

    if (inviteError || !invite) {
      console.error("[invite-accept][POST] invite error", inviteError);
      return NextResponse.json(
        { error: "Invite not found." },
        { status: 404 }
      );
    }

    // 24h expiry
    if (invite.created_at) {
      const created = new Date(invite.created_at);
      const expires = new Date(
        created.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000
      );
      if (Date.now() > expires.getTime()) {
        return NextResponse.json(
          { error: "Invite has expired." },
          { status: 410 }
        );
      }
    }

    // Already accepted?
    if (invite.accepted_at) {
      return NextResponse.json(
        { error: "Invite already accepted." },
        { status: 400 }
      );
    }

    // Email must match
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match invitation." },
        { status: 400 }
      );
    }

    const teamId: string = invite.team_id;
    const inviteRoles: TeamRole[] =
      (invite.team_invite_roles ?? []).map(
        (r: { role: TeamRole }) => r.role
      ) || [];

    // 2) Ensure we have an auth user
    let userId: string | null = invite.user_id ?? null;

    if (!userId) {
      // Fallback for older invites or if inviteUserByEmail didn't store user_id
      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
          },
        });

      if (createError || !created.user) {
        console.error("[invite-accept][POST] create user error", createError);
        return NextResponse.json(
          { error: "Failed to create user from invite." },
          { status: 500 }
        );
      }

      userId = created.user.id;

      // store it back on the invite for future reference
      const { error: updateInviteError } = await supabaseAdmin
        .from("team_invites")
        .update({ user_id: userId })
        .eq("id", inviteId);

      if (updateInviteError) {
        console.error(
          "[invite-accept][POST] failed to store user_id on invite",
          updateInviteError
        );
        // not fatal for the flow
      }
    } else {
      // We already have an auth user from inviteUserByEmail -> update it
      const { error: updateUserError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email,
          password,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
          },
        });

      if (updateUserError) {
        console.error(
          "[invite-accept][POST] update user error",
          updateUserError
        );
        return NextResponse.json(
          { error: "Failed to update user." },
          { status: 500 }
        );
      }
    }

    const finalUserId = userId as string;

    // 3) Determine company_id from the team (optional)
    let companyId: string | null = null;
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .select("organization_id")
      .eq("id", teamId)
      .single();

    if (!teamError && team?.organization_id) {
      companyId = team.organization_id as string;
    }

    // 4) Compute profileRole: must match profiles_role_check (AVAILABLE_ROLES)
    let profileRole: DbRole = "Prospector"; // default fallback

    if (inviteRoles.includes("Admin")) {
      profileRole = "Admin";
    } else if (inviteRoles.includes("Manager")) {
      profileRole = "Manager";
    } else if (inviteRoles.length > 0) {
      profileRole = inviteRoles[0]; // Setter / Closer / Prospector
    }


    // 5) Upsert profile row for this user
    const profilePayload: Record<string, any> = {
      id: finalUserId,
      first_name: firstName,
      last_name: lastName,
      role: profileRole,        // <- now always a valid value
      team_id: teamId,
    };
    if (companyId) {
      profilePayload.company_id = companyId;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profileError) {
      console.error("[invite-accept][POST] profile error", profileError);
      return NextResponse.json(
        {
          error: `Failed to create profile: ${profileError.message}`,
          details: profileError.details,
          hint: profileError.hint,
          code: profileError.code,
        },
        { status: 500 }
      );
    }

    // 6) Add to team_members with all roles
    const effectiveRoles: DbRole[] =
      inviteRoles.length > 0 ? (inviteRoles as DbRole[]) : [profileRole];

    const memberRows = effectiveRoles.map((r) => ({
      team_id: teamId,
      user_id: finalUserId,
      role: r,
      joined_at: new Date().toISOString(),
    }));

    const { error: memberError } = await supabaseAdmin
      .from("team_members")
      .insert(memberRows);  // no upsert, no onConflict

    if (memberError) {
      console.error("[invite-accept][POST] team_members error", memberError);
      return NextResponse.json(
        {
          error: `Failed to add member to team: ${memberError.message}`,
          details: memberError.details,
          hint: memberError.hint,
          code: memberError.code,
        },
        { status: 500 }
      );
    }

    // 7) Mark invite as accepted
    const { error: markError } = await supabaseAdmin
      .from("team_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inviteId);

    if (markError) {
      console.error("[invite-accept][POST] mark accepted error", markError);
      // non-fatal
    }

    return NextResponse.json({
      ok: true,
      teamId,
    });
  } catch (err) {
    console.error("[invite-accept][POST] unexpected error", err);
    return NextResponse.json(
      { error: "Unexpected error while accepting invite." },
      { status: 500 }
    );
  }
}

