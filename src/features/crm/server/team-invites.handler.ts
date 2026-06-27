import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import {
  normalizeTeamRoles,
  TEAM_ROLE_INVITE_DB_VALUE,
  type TeamRole,
  uniq,
} from "@/features/crm/server/team-roles.shared";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl() {
  return serverEnv.appUrl();
}

function jsonError(error: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function isManagerRole(roles: readonly string[]) {
  return roles.includes("admin") || roles.includes("manager");
}

export async function POST(request: NextRequest) {
  try {
    const admin = getCrmAdminClient();
    const auth = await getCrmRequestUser(request, admin);
    if (!auth.ok) {
      return jsonError("Unauthorized", 401);
    }

    const body = (await request.json().catch(() => null)) as {
      email?: string;
      roles?: unknown;
      companyId?: string | null;
    } | null;

    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const desiredRoles = uniq(normalizeTeamRoles(body?.roles));
    if (!email || desiredRoles.length === 0) {
      return jsonError("Email and at least one role are required.", 400);
    }

    const teamContext = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request,
    });

    if (!isManagerRole(teamContext.roles)) {
      return jsonError("Forbidden", 403, { callerRoles: teamContext.roles });
    }

    const isAdmin = teamContext.roles.includes("admin");
    const safeRoles: TeamRole[] = uniq(
      isAdmin ? desiredRoles : desiredRoles.filter((role) => role !== "Admin"),
    );
    if (safeRoles.length === 0) {
      return jsonError("Managers cannot grant Admin.", 400);
    }

    const companyId =
      typeof body?.companyId === "string" && body.companyId.trim().length > 0
        ? body.companyId.trim()
        : null;

    const token = randomUUID();
    const inviteRoles = safeRoles.map((role) => TEAM_ROLE_INVITE_DB_VALUE[role]);

    const { data: invite, error: inviteError } = await admin
      .from("team_invites")
      .insert({
        team_id: teamContext.teamId,
        email,
        role: inviteRoles,
        invited_by: auth.userId,
        token,
        company_id: companyId ?? null,
      })
      .select("id, token")
      .single();

    if (inviteError || !invite) {
      console.error("[team-invites] insert error", inviteError);
      return jsonError("Failed to create invite", 500, {
        supabase: {
          message: inviteError?.message,
          details: (inviteError as any)?.details,
          hint: (inviteError as any)?.hint,
          code: (inviteError as any)?.code,
        },
      });
    }

    const inviteId =
      typeof invite.id === "string" && invite.id.trim()
        ? invite.id
        : String(invite.id ?? "").trim();

    if (!inviteId) {
      return jsonError("Failed to create invite", 500);
    }

    if (inviteRoles.length > 0) {
      const { error: rolesError } = await admin
        .from("team_invite_roles")
        .insert(inviteRoles.map((role) => ({ invite_id: inviteId, role })));

      if (rolesError) {
        console.warn("[team-invite-roles] insert error", rolesError);
      }
    }

    const acceptUrl = `${baseUrl()}/invite/accept?inviteId=${encodeURIComponent(inviteId)}`;

    const { data: invitedUser, error: inviteUserError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: acceptUrl,
        data: {
          invite_id: inviteId,
          team_id: teamContext.teamId,
          company_id: companyId ?? null,
          roles: inviteRoles,
        },
      });

    if (inviteUserError) {
      console.error("[team-invites] inviteUserByEmail error", inviteUserError);
      return jsonError("Failed to send invite email.", 500, {
        supabase: {
          message: inviteUserError.message,
          status: (inviteUserError as any).status,
          name: inviteUserError.name,
        },
      });
    }

    const invitedUserId = invitedUser?.user?.id ? String(invitedUser.user.id) : null;
    if (invitedUserId) {
      const { error } = await admin
        .from("team_invites")
        .update({ user_id: invitedUserId })
        .eq("id", inviteId);

      if (error) {
        console.warn("[team-invites] failed to store user_id", error);
      }
    }

    return NextResponse.json({ ok: true, acceptUrl, inviteId });
  } catch (error: any) {
    console.error("[team-invites] unexpected error", error);
    return jsonError("Unexpected error", 500);
  }
}
