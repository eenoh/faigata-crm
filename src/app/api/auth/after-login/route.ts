// src/app/api/auth/after-login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { userId, inviteId, teamId } = (await req.json()) as {
      userId?: string;
      inviteId?: string | null;
      teamId?: string | null;
    };

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // 1) Get auth user (for email)
    const { data: userRes, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (authError || !userRes?.user) {
      console.error("[after-login] auth lookup error", authError);
      return NextResponse.json(
        { error: "User not found" },
        { status: 400 }
      );
    }

    const email = userRes.user.email;
    const meta = userRes.user.user_metadata || {};
    const firstName = meta.first_name ?? null;
    const lastName = meta.last_name ?? null;

    if (!email) {
      return NextResponse.json(
        { error: "User has no email" },
        { status: 400 }
      );
    }

    // 2) Ensure profile exists (without forcing team/company yet)
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("[after-login] profile select error", profileError);
    }

    if (!existingProfile) {
      const { error: createProfileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          first_name: firstName,
          last_name: lastName,
          team_id: null,
          company_id: null,
        });

      if (createProfileError) {
        console.error(
          "[after-login] profile insert error",
          createProfileError
        );
      }
    }

    // 3) Find invites for this email
    let invitesQuery = supabaseAdmin
      .from("team_invites")
      .select("id, team_id, role, accepted_at, invited_by")
      .eq("email", email)
      .is("accepted_at", null);

    if (inviteId) {
      invitesQuery = invitesQuery.eq("id", inviteId);
    }
    if (teamId) {
      invitesQuery = invitesQuery.eq("team_id", teamId);
    }

    const { data: invites, error: invitesError } = await invitesQuery;

    if (invitesError) {
      console.error("[after-login] invites lookup error", invitesError);
    }

    let primaryTeamId: string | null = existingProfile?.team_id ?? null;
    let derivedCompanyId: string | null = existingProfile?.company_id ?? null;

    if (invites && invites.length > 0) {
      for (const invite of invites) {
        const currentTeamId = invite.team_id as string;

        // Roles for this invite
        const { data: inviteRoles, error: rolesError } = await supabaseAdmin
          .from("team_invite_roles")
          .select("role")
          .eq("invite_id", invite.id);

        if (rolesError) {
          console.error(
            "[after-login] invite roles lookup error",
            rolesError
          );
        }

        const memberRoles =
          inviteRoles && inviteRoles.length > 0
            ? inviteRoles.map((r) => r.role as string)
            : invite.role
            ? [invite.role as string]
            : [];

        // Upsert membership
        const { error: tmError } = await supabaseAdmin
          .from("team_members")
          .upsert(
            {
              team_id: currentTeamId,
              user_id: userId,
              role: memberRoles,
            },
            { onConflict: "team_id,user_id" }
          );

        if (tmError) {
          console.error("[after-login] team_members upsert error", tmError);
        }

        // Derive company_id from inviter
        if (!derivedCompanyId && invite.invited_by) {
          const { data: inviterProfile, error: inviterError } =
            await supabaseAdmin
              .from("profiles")
              .select("company_id")
              .eq("id", invite.invited_by)
              .single();

          if (inviterError) {
            console.error(
              "[after-login] inviter profile error",
              inviterError
            );
          } else {
            derivedCompanyId = inviterProfile?.company_id ?? null;
          }
        }

        // Mark invite accepted
        await supabaseAdmin
          .from("team_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invite.id);

        if (!primaryTeamId) {
          primaryTeamId = currentTeamId;
        }
      }

      // Update profile with team + company
      if (primaryTeamId) {
        const { error: profileUpdateError } = await supabaseAdmin
          .from("profiles")
          .update({
            first_name: existingProfile?.first_name ?? firstName,
            last_name: existingProfile?.last_name ?? lastName,
            team_id: primaryTeamId,
            company_id: existingProfile?.company_id ?? derivedCompanyId,
          })
          .eq("id", userId);

        if (profileUpdateError) {
          console.error(
            "[after-login] profile update error",
            profileUpdateError
          );
        }
      }
    }

    // 4) Decide onboarding vs dashboard
    if (!primaryTeamId) {
      // user has no team yet → onboarding flow (create first workspace)
      return NextResponse.json({
        needsOnboarding: true,
        teamId: null,
      });
    }

    return NextResponse.json({
      needsOnboarding: false,
      teamId: primaryTeamId,
    });
  } catch (err) {
    console.error("[after-login] unexpected error", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
