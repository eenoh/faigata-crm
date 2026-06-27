import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBody } from "@/lib/http/request";
import { requireAuthenticatedRequestUser } from "@/features/auth/server/request-auth";

type CompleteRegistrationBody = {
  userId?: string;
  teamId?: string | null;
  inviteId?: string | null;
  companyId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type InviteRow = {
  id: string;
  team_id: string;
  role: string | null;
  invited_by: string | null;
};

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseInviteRow(value: unknown): InviteRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = toOptionalString(row.id);
  const teamId = toOptionalString(row.team_id);

  if (!id || !teamId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    role: toOptionalString(row.role),
    invited_by: toOptionalString(row.invited_by),
  };
}

function pickName(
  explicitValue: string | null | undefined,
  metadata: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
) {
  return (
    explicitValue ??
    (typeof metadata[snakeKey] === "string"
      ? (metadata[snakeKey] as string)
      : null) ??
    (typeof metadata[camelKey] === "string"
      ? (metadata[camelKey] as string)
      : null)
  );
}

export async function handleCompleteRegistration(request: Request) {
  try {
    const body = await readJsonBody<CompleteRegistrationBody>(request, {});
    const auth = await requireAuthenticatedRequestUser(request, body.userId);
    if (!auth.ok) return auth.response;

    const teamId = body.teamId?.trim() || null;
    if (!teamId) return NextResponse.json({ redirectTo: "/onboarding" });

    const supabase = getSupabaseAdminClient();
    const user = auth.user;
    if (!user.email) return badRequest("User has no email");

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const firstName = pickName(body.firstName, metadata, "first_name", "firstName");
    const lastName = pickName(body.lastName, metadata, "last_name", "lastName");
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    supabase.auth.admin
      .updateUserById(auth.userId, {
        user_metadata: {
          ...metadata,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
        },
      })
      .catch((error) =>
        console.error(
          "[complete-registration] failed to update auth user metadata",
          error,
        ),
      );

    let inviteQuery = supabase
      .from("team_invites")
      .select("id, team_id, role, invited_by")
      .eq("email", user.email)
      .eq("team_id", teamId)
      .is("accepted_at", null);

    if (body.inviteId) {
      inviteQuery = inviteQuery.eq("id", body.inviteId);
    }

    let invite = null as
      | {
          id: string;
          team_id: string;
          role: string | null;
          invited_by: string | null;
        }
      | null;

    const inviteLookup = await inviteQuery.maybeSingle();
    if (inviteLookup.error) {
      console.error(
        "[complete-registration] invite lookup error",
        inviteLookup.error,
      );
    } else {
      invite = parseInviteRow(inviteLookup.data);
    }

    if (!invite) {
      const fallback = await supabase
        .from("team_invites")
        .select("id, team_id, role, invited_by")
        .eq("email", user.email)
        .eq("team_id", teamId)
        .is("accepted_at", null)
        .maybeSingle();

      if (fallback.error) {
        console.error(
          "[complete-registration] invite fallback error",
          fallback.error,
        );
      } else {
        invite = parseInviteRow(fallback.data);
      }
    }

    let companyId = body.companyId ?? null;

    if (invite?.invited_by) {
      const { data: inviter, error: inviterError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", invite.invited_by)
        .single();

      if (inviterError) {
        console.error(
          "[complete-registration] inviter profile error",
          inviterError,
        );
      } else {
        companyId =
          ((inviter as { company_id?: string | null } | null)?.company_id ??
            companyId) as string | null;
      }
    }

    const existingProfileResult = await supabase
      .from("profiles")
      .select("*")
      .eq("id", auth.userId)
      .maybeSingle();

    if (existingProfileResult.error) {
      console.error(
        "[complete-registration] profile select error",
        existingProfileResult.error,
      );
    }

    const existingProfile = existingProfileResult.data as
      | {
          first_name?: string | null;
          last_name?: string | null;
          company_id?: string | null;
          role?: string | string[] | null;
        }
      | null;

    const profilePayload = existingProfile
      ? {
          first_name: existingProfile.first_name ?? firstName,
          last_name: existingProfile.last_name ?? lastName,
          team_id: teamId,
          company_id: existingProfile.company_id ?? companyId,
          role: existingProfile.role ?? invite?.role ?? null,
        }
      : {
          id: auth.userId,
          first_name: firstName,
          last_name: lastName,
          team_id: teamId,
          company_id: companyId,
          role: invite?.role ?? null,
        };

    const profileWrite = existingProfile
      ? supabase.from("profiles").update(profilePayload).eq("id", auth.userId)
      : supabase.from("profiles").insert(profilePayload);

    const { error: profileWriteError } = await profileWrite;
    if (profileWriteError) {
      console.error(
        "[complete-registration] profile write error",
        profileWriteError,
      );
    }

    let memberRoles: string[] = [];
    if (invite) {
      const inviteRolesResult = await supabase
        .from("team_invite_roles")
        .select("role")
        .eq("invite_id", invite.id);

      if (inviteRolesResult.error) {
        console.error(
          "[complete-registration] invite roles lookup error",
          inviteRolesResult.error,
        );
      } else if (inviteRolesResult.data?.length) {
        memberRoles = inviteRolesResult.data
          .map((row) => String((row as { role?: unknown }).role ?? ""))
          .filter(Boolean);
      } else if (invite.role) {
        memberRoles = [invite.role];
      }
    }

    const { error: teamMemberError } = await supabase.from("team_members").upsert(
      {
        team_id: teamId,
        user_id: auth.userId,
        role: memberRoles,
      },
      { onConflict: "team_id,user_id" },
    );

    if (teamMemberError) {
      console.error(
        "[complete-registration] team_members upsert error",
        teamMemberError,
      );
    }

    if (invite) {
      const { error: inviteAcceptError } = await supabase
        .from("team_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      if (inviteAcceptError) {
        console.error(
          "[complete-registration] invite update error",
          inviteAcceptError,
        );
      }
    }

    const query = new URLSearchParams({ team: teamId });
    if (companyId) query.set("company", companyId);

    return NextResponse.json({
      redirectTo: `/dashboard?${query.toString()}`,
    });
  } catch (error) {
    console.error("[complete-registration] unexpected error", error);
    return badRequest("Unexpected error", 500);
  }
}
