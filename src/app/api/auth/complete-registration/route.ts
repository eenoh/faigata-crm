// src/app/api/auth/complete-registration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      teamId,
      inviteId,
      companyId: companyIdFromClient,
      firstName: firstNameFromClient,
      lastName: lastNameFromClient,
    } = (await req.json()) as {
      userId?: string;
      teamId?: string | null;
      inviteId?: string | null;
      companyId?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    };

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // No teamId in URL → normal flow, create new team during onboarding
    if (!teamId) {
      return NextResponse.json({ redirectTo: "/onboarding" });
    }

    // 1) Load auth user (for canonical email + existing metadata)
    const { data: userRes, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (authError || !userRes?.user) {
      console.error("[complete-registration] auth lookup error", authError);
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const email = userRes.user.email;
    const meta = (userRes.user.user_metadata || {}) as Record<string, any>;

    if (!email) {
      return NextResponse.json(
        { error: "User has no email" },
        { status: 400 }
      );
    }

    // 2) Determine first / last name:
    const firstName =
      firstNameFromClient ??
      meta.first_name ??
      meta.firstName ??
      null;

    const lastName =
      lastNameFromClient ??
      meta.last_name ??
      meta.lastName ??
      null;

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    // 3) Make sure auth user metadata is updated (so Supabase "Display name" is correct)
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...meta,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
        },
      });
    } catch (updateErr) {
      console.error(
        "[complete-registration] failed to update auth user metadata",
        updateErr
      );
    }

    // 4) Find the invite for this team/email (prefer specific inviteId)
    let invite: {
      id: string;
      team_id: string;
      role: string | null;
      invited_by: string | null;
    } | null = null;

    if (inviteId) {
      const { data, error } = await supabaseAdmin
        .from("team_invites")
        .select("id, team_id, role, invited_by")
        .eq("id", inviteId)
        .eq("email", email)
        .single();

      if (error) {
        console.error("[complete-registration] invite lookup error", error);
      } else {
        invite = data;
      }
    }

    if (!invite) {
      const { data, error } = await supabaseAdmin
        .from("team_invites")
        .select("id, team_id, role, invited_by")
        .eq("email", email)
        .eq("team_id", teamId)
        .is("accepted_at", null)
        .maybeSingle();

      if (error) {
        console.error("[complete-registration] invite fallback error", error);
      } else {
        invite = data;
      }
    }

    // 5) Work out company_id (prefer inviter's company; fallback to client-provided)
    let companyId: string | null = companyIdFromClient ?? null;

    if (invite?.invited_by) {
      const { data: inviterProfile, error: inviterError } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", invite.invited_by)
        .single();

      if (inviterError) {
        console.error(
          "[complete-registration] inviter profile error",
          inviterError
        );
      } else if (inviterProfile?.company_id) {
        companyId = inviterProfile.company_id as string;
      }
    }

    // 6) Upsert profile with first/last name, team_id, company_id, and primary role
    const { data: existingProfile, error: profileSelectError } =
      await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (profileSelectError) {
      console.error(
        "[complete-registration] profile select error",
        profileSelectError
      );
    }

    if (!existingProfile) {
      const { error: insertProfileError } = await supabaseAdmin
        .from("profiles")
        .insert({
          id: userId,
          first_name: firstName,
          last_name: lastName,
          team_id: teamId,
          company_id: companyId,
          role: invite?.role ?? null, // optional "primary" profile role
        });

      if (insertProfileError) {
        console.error(
          "[complete-registration] profile insert error",
          insertProfileError
        );
      }
    } else {
      const { error: updateProfileError } = await supabaseAdmin
        .from("profiles")
        .update({
          first_name: existingProfile.first_name ?? firstName,
          last_name: existingProfile.last_name ?? lastName,
          team_id: teamId,
          company_id:
            existingProfile.company_id ?? companyId ?? existingProfile.company_id,
          role: existingProfile.role ?? invite?.role ?? existingProfile.role,
        })
        .eq("id", userId);

      if (updateProfileError) {
        console.error(
          "[complete-registration] profile update error",
          updateProfileError
        );
      }
    }

    // 7) Collect all roles for this invite → store in team_members
    let memberRoles: string[] = [];

    if (invite) {
      const { data: inviteRoles, error: rolesError } = await supabaseAdmin
        .from("team_invite_roles")
        .select("role")
        .eq("invite_id", invite.id);

      if (rolesError) {
        console.error(
          "[complete-registration] invite roles lookup error",
          rolesError
        );
      }

      if (inviteRoles && inviteRoles.length > 0) {
        memberRoles = inviteRoles.map((r) => r.role as string);
      } else if (invite.role) {
        memberRoles = [invite.role as string];
      }
    }

    const { error: tmError } = await supabaseAdmin
      .from("team_members")
      .upsert(
        {
          team_id: teamId,
          user_id: userId,
          role: memberRoles,
        },
        { onConflict: "team_id,user_id" }
      );

    if (tmError) {
      console.error("[complete-registration] team_members upsert error", tmError);
    }

    // 8) Mark invite accepted
    if (invite) {
      const { error: inviteUpdateError } = await supabaseAdmin
        .from("team_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      if (inviteUpdateError) {
        console.error(
          "[complete-registration] invite update error",
          inviteUpdateError
        );
      }
    }

    // 9) Redirect straight to this team's dashboard (userId implicit in session)
    const qs = new URLSearchParams({ team: teamId });
    if (companyId) {
      qs.set("company", companyId);
    }

    return NextResponse.json({
      redirectTo: `/dashboard?${qs.toString()}`,
    });
  } catch (err) {
    console.error("[complete-registration] unexpected error", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
