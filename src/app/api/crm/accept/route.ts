import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TEAM_ROLE_PROFILE_DB_VALUE } from "@/features/crm/server/team-roles.shared";

export const runtime = "nodejs";

const AVAILABLE_ROLES = [
  "Prospector",
  "Setter",
  "Closer",
  "Manager",
  "Admin",
] as const;

type TeamRole = (typeof AVAILABLE_ROLES)[number];

type TeamInviteRow = {
  id: string;
  email: string | null;
  team_id: string | null;
  company_id: string | null;
  user_id: string | null;
  created_at: string | null;
  accepted_at: string | null;
  team_invite_roles?: Array<{ role?: unknown }> | null;
};

type TeamRow = {
  organization_id: string | null;
};

const INVITE_TTL_HOURS = 24;

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status },
  );
}

function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toTeamRole(v: unknown): TeamRole | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  return AVAILABLE_ROLES.find((r) => r.toLowerCase() === lower) ?? null;
}

export async function POST(req: NextRequest) {
  const nowIso = new Date().toISOString();

  try {
    const body = (await req.json().catch(() => null)) as {
      inviteId?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
    } | null;

    const inviteId = String(body?.inviteId ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const firstName = String(body?.firstName ?? "").trim();
    const lastName = String(body?.lastName ?? "").trim();
    const password = String(body?.password ?? "").trim();

    if (!inviteId || !email || !firstName || !lastName || !password) {
      return jsonError("Missing required fields.", 400, {
        code: "missing_required_fields",
      });
    }

    const teamInvitesTable = supabaseAdmin.from("team_invites") as any;
    const teamsTable = supabaseAdmin.from("teams") as any;
    const profilesTable = supabaseAdmin.from("profiles") as any;
    const teamMembersTable = supabaseAdmin.from("team_members") as any;

    const { data, error: inviteErr } = await teamInvitesTable
      .select(
        `
        id,
        email,
        team_id,
        company_id,
        user_id,
        created_at,
        accepted_at,
        team_invite_roles ( role )
      `,
      )
      .eq("id", inviteId)
      .single();

    const invite = (data ?? null) as TeamInviteRow | null;

    if (inviteErr || !invite) {
      return jsonError("Invite not found.", 404, {
        code: "invite_not_found",
        details: inviteErr?.message ?? null,
      });
    }

    if (!invite.team_id) {
      return jsonError("Invite is missing a team.", 500, {
        code: "invite_missing_team_id",
      });
    }

    if (invite.accepted_at) {
      return jsonError("Invite already accepted.", 400, {
        code: "invite_already_accepted",
      });
    }

    const createdAt = new Date(String(invite.created_at ?? ""));
    if (Number.isNaN(createdAt.getTime())) {
      return jsonError("Invite has invalid created_at.", 400, {
        code: "invite_invalid_created_at",
      });
    }

    const expiresAt = new Date(
      createdAt.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000,
    );

    if (Date.now() > expiresAt.getTime()) {
      return jsonError("Invite expired.", 410, {
        code: "invite_expired",
      });
    }

    if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
      return jsonError("Email mismatch.", 400, {
        code: "invite_email_mismatch",
      });
    }

    const rolesFromJoin: TeamRole[] = Array.isArray(invite.team_invite_roles)
      ? invite.team_invite_roles
          .map((r) => toTeamRole(r?.role))
          .filter((r: TeamRole | null): r is TeamRole => Boolean(r))
      : [];

    const rolesForProfile: TeamRole[] =
      rolesFromJoin.length > 0 ? uniq(rolesFromJoin) : ["Prospector"];

    const dbRoles = rolesForProfile.map(
      (role) => TEAM_ROLE_PROFILE_DB_VALUE[role],
    );

    let userId: string | null = invite.user_id ?? null;

    if (!userId) {
      const { data: createdUser, error: createUserErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
          },
        });

      if (createUserErr || !createdUser?.user) {
        return jsonError("User creation failed.", 500, {
          code: "auth_create_user_failed",
          details: createUserErr?.message ?? null,
        });
      }

      userId = createdUser.user.id;

      const { error: linkErr } = await teamInvitesTable
        .update({ user_id: userId } as any)
        .eq("id", inviteId);

      if (linkErr) {
        return jsonError("Failed to link user to invite.", 500, {
          code: "invite_link_user_failed",
          details: linkErr.message ?? null,
        });
      }
    } else {
      const { error: updAuthErr } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
          },
        });

      if (updAuthErr) {
        return jsonError("User update failed.", 500, {
          code: "auth_update_user_failed",
          details: updAuthErr.message ?? null,
        });
      }
    }

    const finalUserId = userId;

    let companyId: string | null = invite.company_id ?? null;

    if (!companyId) {
      const { data: teamData, error: teamErr } = await teamsTable
        .select("organization_id")
        .eq("id", invite.team_id)
        .maybeSingle();

      const team = (teamData ?? null) as TeamRow | null;

      if (teamErr) {
        return jsonError("Failed to resolve team organization.", 500, {
          code: "team_lookup_failed",
          details: teamErr.message ?? null,
        });
      }

      if (team?.organization_id) {
        companyId = String(team.organization_id);
      }
    }

    const { error: profErr } = await profilesTable.upsert(
      {
        id: finalUserId,
        first_name: firstName,
        last_name: lastName,
        team_id: invite.team_id,
        company_id: companyId,
        role: dbRoles,
        is_active: true,
      } as any,
      { onConflict: "id" },
    );

    if (profErr) {
      return jsonError("Failed to upsert profile.", 500, {
        code: "profile_upsert_failed",
        details: profErr.message ?? null,
      });
    }

    const { error: tmErr } = await teamMembersTable.upsert(
      {
        team_id: invite.team_id,
        user_id: finalUserId,
        role: dbRoles,
        joined_at: nowIso,
      } as any,
      { onConflict: "team_id,user_id" },
    );

    if (tmErr) {
      return jsonError("Failed to upsert team membership.", 500, {
        code: "team_members_upsert_failed",
        details: tmErr.message ?? null,
      });
    }

    const { error: acceptErr } = await teamInvitesTable
      .update({ accepted_at: nowIso } as any)
      .eq("id", inviteId);

    if (acceptErr) {
      return jsonError("Failed to mark invite accepted.", 500, {
        code: "invite_accept_failed",
        details: acceptErr.message ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      teamId: invite.team_id,
    });
  } catch (e: any) {
    console.error("[crm.accept.POST] unexpected error", e);

    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error while accepting invite.",
        code: "unexpected_accept_error",
        message: String(e?.message ?? e),
      },
      { status: 500 },
    );
  }
}
