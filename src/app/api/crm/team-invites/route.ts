// src/app/api/team-invites/route.ts
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

const TO_DB_ROLE: Record<TeamRole, DbRole> = {
  Prospector: "Prospector",
  Setter: "Setter",
  Closer: "Closer",
  Manager: "Manager",
  Admin: "Admin",
};

export async function POST(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
    }

    const { email, roles, companyId } = (await req.json()) as {
      email?: string;
      roles?: TeamRole[];
      companyId?: string | null;
    };

    if (!email || !roles || roles.length === 0) {
      return NextResponse.json(
        { error: "Email and at least one role are required." },
        { status: 400 }
      );
    }

    const primaryRole = roles[0];

    // 1) Create invite row in your DB (NO auth user yet)
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
      .insert({
        team_id: teamId,
        email,
        role: TO_DB_ROLE[primaryRole],
      })
      .select("id, created_at")
      .single();

    if (inviteError || !invite) {
      console.error("[team-invites] insert error", inviteError);
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 }
      );
    }

    const inviteId = invite.id as string;

    // 2) Store all roles in team_invite_roles
    const roleRows = roles.map((r) => ({
      invite_id: inviteId,
      role: TO_DB_ROLE[r],
    }));

    const { error: roleError } = await supabaseAdmin
      .from("team_invite_roles")
      .insert(roleRows);

    if (roleError) {
      console.error("[team-invite-roles] insert error", roleError);
      // Not fatal – the base invite row still exists
    }

    // 3) Build accept link: /invite/accept?invite=...&team=...&company=...
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";

    const acceptUrl =
      `${baseUrl}/invite/accept` +
      `?invite=${encodeURIComponent(inviteId)}` +
      `&team=${encodeURIComponent(teamId)}` +
      (companyId ? `&company=${encodeURIComponent(companyId)}` : "");

    // 4) Use Supabase's email tool: inviteUserByEmail
    // This sends the email and the link redirects to acceptUrl
    const { data: invitedUser, error: inviteUserError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: acceptUrl,
        data: {
          invite_id: inviteId,
          team_id: teamId,
          company_id: companyId ?? null,
          roles,
        },
      });

    if (inviteUserError) {
      console.error("[team-invites] inviteUserByEmail error", inviteUserError);
      // You might optionally delete the invite row here, but we just report error:
      return NextResponse.json(
        { error: "Failed to send invite email." },
        { status: 500 }
      );
    }

    // 5) Store the auth user id on the invite row
    const userId = invitedUser?.user?.id;
    if (userId) {
      const { error: updateInviteError } = await supabaseAdmin
        .from("team_invites")
        .update({ user_id: userId })
        .eq("id", inviteId);

      if (updateInviteError) {
        console.error(
          "[team-invites] failed to store user_id on invite",
          updateInviteError
        );
        // Not fatal for the email flow, but useful to know in logs
      }
    }

    return NextResponse.json({ ok: true, acceptUrl });
  } catch (err) {
    console.error("[team-invites] unexpected error", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
