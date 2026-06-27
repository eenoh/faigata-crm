import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { readJsonBody } from "@/lib/http/request";
import { requireAuthenticatedRequestUser } from "@/features/auth/server/request-auth";

type AfterLoginBody = {
  userId?: string;
  inviteId?: string | null;
  teamId?: string | null;
};

type JsonRes =
  | { needsOnboarding: boolean; teamId: string | null }
  | { error: string };

type InviteRow = {
  id: string;
  team_id: string;
  role: string | null;
  invited_by: string | null;
};

const bad = (error: string, status = 400) =>
  NextResponse.json({ error } satisfies JsonRes, { status });
const ok = (needsOnboarding: boolean, teamId: string | null) =>
  NextResponse.json({ needsOnboarding, teamId } satisfies JsonRes);

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

export async function handleAfterLogin(request: Request) {
  try {
    const body = await readJsonBody<AfterLoginBody>(request, {});
    const auth = await requireAuthenticatedRequestUser(request, body.userId);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseAdminClient();
    const email = auth.user.email;
    if (!email) return bad("User has no email");

    const metadata = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
    const firstName =
      typeof metadata.first_name === "string" ? metadata.first_name : null;
    const lastName =
      typeof metadata.last_name === "string" ? metadata.last_name : null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", auth.userId)
      .maybeSingle();

    if (profileError) {
      console.error("[after-login] profile select error", profileError);
    }

    if (!profile) {
      const { error } = await supabase.from("profiles").insert({
        id: auth.userId,
        first_name: firstName,
        last_name: lastName,
        team_id: null,
        company_id: null,
      });

      if (error) {
        console.error("[after-login] profile insert error", error);
      }
    }

    const profileRow = profile as
      | {
          team_id?: string | null;
          company_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        }
      | null;

    let primaryTeamId: string | null = profileRow?.team_id ?? null;
    let derivedCompanyId: string | null = profileRow?.company_id ?? null;

    let inviteQuery = supabase
      .from("team_invites")
      .select("id, team_id, role, invited_by")
      .eq("email", email)
      .is("accepted_at", null);

    if (body.inviteId) inviteQuery = inviteQuery.eq("id", body.inviteId);
    if (body.teamId) inviteQuery = inviteQuery.eq("team_id", body.teamId);

    const { data: invites, error: invitesError } = await inviteQuery;
    if (invitesError) {
      console.error("[after-login] invites lookup error", invitesError);
    }

    const inviteRows = Array.isArray(invites)
      ? invites
          .map((invite) => parseInviteRow(invite))
          .filter((invite): invite is InviteRow => Boolean(invite))
      : [];

    if (inviteRows.length) {
      for (const invite of inviteRows) {
        const currentTeamId = invite.team_id;

        const { data: inviteRoles, error: rolesError } = await supabase
          .from("team_invite_roles")
          .select("role")
          .eq("invite_id", invite.id);

        if (rolesError) {
          console.error("[after-login] invite roles lookup error", rolesError);
        }

        const memberRoles = inviteRoles?.length
          ? inviteRoles
              .map((row) => String((row as { role?: unknown }).role ?? ""))
              .filter(Boolean)
          : invite.role
            ? [String(invite.role)]
            : [];

        const { error: membershipError } = await supabase
          .from("team_members")
          .upsert(
            {
              team_id: currentTeamId,
              user_id: auth.userId,
              role: memberRoles,
            },
            { onConflict: "team_id,user_id" },
          );

        if (membershipError) {
          console.error(
            "[after-login] team_members upsert error",
            membershipError,
          );
        }

        if (!derivedCompanyId && invite.invited_by) {
          const { data: inviter, error } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", invite.invited_by)
            .single();

          if (error) {
            console.error("[after-login] inviter profile error", error);
          } else {
            derivedCompanyId =
              typeof (inviter as { company_id?: unknown } | null)?.company_id ===
              "string"
                ? ((inviter as { company_id?: string | null } | null)
                    ?.company_id ?? null)
                : null;
          }
        }

        const { error: acceptError } = await supabase
          .from("team_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invite.id);

        if (acceptError) {
          console.error("[after-login] invite accept update error", acceptError);
        }

        if (!primaryTeamId) primaryTeamId = currentTeamId;
      }

      if (primaryTeamId) {
        const { error } = await supabase
          .from("profiles")
          .update({
            first_name: profileRow?.first_name ?? firstName,
            last_name: profileRow?.last_name ?? lastName,
            team_id: primaryTeamId,
            company_id: profileRow?.company_id ?? derivedCompanyId,
          })
          .eq("id", auth.userId);

        if (error) {
          console.error("[after-login] profile update error", error);
        }
      }
    }

    return primaryTeamId ? ok(false, primaryTeamId) : ok(true, null);
  } catch (error) {
    console.error("[after-login] unexpected error", error);
    return bad("Unexpected error", 500);
  }
}
