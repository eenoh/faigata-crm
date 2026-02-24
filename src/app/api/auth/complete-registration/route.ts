// src/app/api/auth/complete-registration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  userId?: string;
  teamId?: string | null;
  inviteId?: string | null;
  companyId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

function pickName(
  client: string | null | undefined,
  meta: any,
  snake: string,
  camel: string,
) {
  return client ?? meta?.[snake] ?? meta?.[camel] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      teamId,
      inviteId,
      companyId: companyIdFromClient,
      firstName: firstNameFromClient,
      lastName: lastNameFromClient,
    } = (await req.json()) as Body;

    if (!userId) return bad("Missing userId");
    if (!teamId) return NextResponse.json({ redirectTo: "/onboarding" });

    // 1) Auth user (canonical email + metadata)
    const { data: userRes, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    const user = userRes?.user;
    if (authError || !user) {
      console.error("[complete-registration] auth lookup error", authError);
      return bad("User not found");
    }

    const email = user.email;
    if (!email) return bad("User has no email");

    const meta = (user.user_metadata ?? {}) as Record<string, any>;

    // 2) Names (client -> metadata snake -> metadata camel)
    const firstName = pickName(
      firstNameFromClient,
      meta,
      "first_name",
      "firstName",
    );
    const lastName = pickName(
      lastNameFromClient,
      meta,
      "last_name",
      "lastName",
    );
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    // 3) Best-effort metadata update (Display name)
    supabaseAdmin.auth.admin
      .updateUserById(userId, {
        user_metadata: {
          ...meta,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
        },
      })
      .catch((e) =>
        console.error(
          "[complete-registration] failed to update auth user metadata",
          e,
        ),
      );

    // 4) Invite for this email/team (prefer inviteId)
    const inviteSelect = supabaseAdmin
      .from("team_invites")
      .select("id, team_id, role, invited_by")
      .eq("email", email)
      .eq("team_id", teamId)
      .is("accepted_at", null);

    const inviteById = inviteId
      ? inviteSelect.eq("id", inviteId).maybeSingle()
      : null;
    const inviteFallback = inviteSelect.maybeSingle();

    let invite: {
      id: string;
      team_id: string;
      role: string | null;
      invited_by: string | null;
    } | null = null;

    if (inviteById) {
      const { data, error } = await inviteById;
      if (error)
        console.error("[complete-registration] invite lookup error", error);
      else invite = data ?? null;
    }

    if (!invite) {
      const { data, error } = await inviteFallback;
      if (error)
        console.error("[complete-registration] invite fallback error", error);
      else invite = data ?? null;
    }

    // 5) company_id (inviter wins, else client)
    let companyId: string | null = companyIdFromClient ?? null;

    if (invite?.invited_by) {
      const { data: inviter, error } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", invite.invited_by)
        .single();

      if (error)
        console.error("[complete-registration] inviter profile error", error);
      else companyId = inviter?.company_id ?? companyId;
    }

    // 6) Upsert profile (preserve existing first/last/role if already set)
    const { data: existingProfile, error: profileSelectError } =
      await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (profileSelectError)
      console.error(
        "[complete-registration] profile select error",
        profileSelectError,
      );

    const profilePayload = existingProfile
      ? {
          first_name: existingProfile.first_name ?? firstName,
          last_name: existingProfile.last_name ?? lastName,
          team_id: teamId,
          company_id:
            existingProfile.company_id ??
            companyId ??
            existingProfile.company_id,
          role: existingProfile.role ?? invite?.role ?? existingProfile.role,
        }
      : {
          id: userId,
          first_name: firstName,
          last_name: lastName,
          team_id: teamId,
          company_id: companyId,
          role: invite?.role ?? null,
        };

    const profileWrite = existingProfile
      ? supabaseAdmin.from("profiles").update(profilePayload).eq("id", userId)
      : supabaseAdmin.from("profiles").insert(profilePayload);

    const { error: profileWriteError } = await profileWrite;
    if (profileWriteError)
      console.error(
        "[complete-registration] profile write error",
        profileWriteError,
      );

    // 7) Collect roles for invite -> team_members
    let memberRoles: string[] = [];

    if (invite) {
      const { data: inviteRoles, error: rolesError } = await supabaseAdmin
        .from("team_invite_roles")
        .select("role")
        .eq("invite_id", invite.id);

      if (rolesError)
        console.error(
          "[complete-registration] invite roles lookup error",
          rolesError,
        );

      memberRoles = inviteRoles?.length
        ? inviteRoles.map((r: any) => String(r.role))
        : invite.role
          ? [invite.role]
          : [];
    }

    const { error: tmError } = await supabaseAdmin
      .from("team_members")
      .upsert(
        { team_id: teamId, user_id: userId, role: memberRoles },
        { onConflict: "team_id,user_id" },
      );

    if (tmError)
      console.error(
        "[complete-registration] team_members upsert error",
        tmError,
      );

    // 8) Mark invite accepted (best-effort)
    if (invite) {
      const { error } = await supabaseAdmin
        .from("team_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      if (error)
        console.error("[complete-registration] invite update error", error);
    }

    // 9) Redirect to dashboard
    const qs = new URLSearchParams({ team: teamId });
    if (companyId) qs.set("company", companyId);

    return NextResponse.json({ redirectTo: `/dashboard?${qs.toString()}` });
  } catch (err) {
    console.error("[complete-registration] unexpected error", err);
    return bad("Unexpected error", 500);
  }
}
