import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  role: unknown;
  company_id: string | null;
  created_at: string | null;
  accepted_at: string | null;
  team_invite_roles?: Array<{ role?: unknown }> | null;
};

type TeamRow = {
  organization_id: string | null;
};

type OrganizationRow = {
  name: string | null;
};

const INVITE_TTL_HOURS = 24;

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function isTeamRole(v: unknown): v is TeamRole {
  return (
    typeof v === "string" && (AVAILABLE_ROLES as readonly string[]).includes(v)
  );
}

function normalizeRoles(raw: unknown): TeamRole[] {
  if (Array.isArray(raw)) {
    return raw.filter(isTeamRole);
  }
  if (isTeamRole(raw)) return [raw];
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const inviteId = req.nextUrl.searchParams.get("inviteId");
    if (!inviteId) {
      return NextResponse.json(
        { ok: false, error: "Missing inviteId" },
        { status: 400 },
      );
    }

    const teamInvitesTable = supabaseAdmin.from("team_invites") as any;
    const teamsTable = supabaseAdmin.from("teams") as any;
    const organizationsTable = supabaseAdmin.from("organizations") as any;

    const { data, error: inviteError } = await teamInvitesTable
      .select(
        `
        id,
        email,
        team_id,
        role,
        company_id,
        created_at,
        accepted_at,
        team_invite_roles ( role )
      `,
      )
      .eq("id", inviteId)
      .single();

    const invite = (data ?? null) as TeamInviteRow | null;

    if (inviteError || !invite) {
      console.error("[invite-accept][GET] invite error", inviteError);
      return NextResponse.json(
        { ok: false, error: "Invite not found or no longer valid." },
        { status: 404 },
      );
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { ok: false, error: "Invite has already been accepted." },
        { status: 400 },
      );
    }

    if (invite.created_at) {
      const created = new Date(invite.created_at);
      const expires = new Date(
        created.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000,
      );

      if (Date.now() > expires.getTime()) {
        return NextResponse.json(
          { ok: false, error: "Invite has expired." },
          { status: 410 },
        );
      }
    }

    const joinRows = Array.isArray(invite.team_invite_roles)
      ? invite.team_invite_roles
      : [];

    const rolesFromJoin: TeamRole[] = joinRows
      .map((r) => r?.role)
      .filter(isTeamRole);

    const rolesFromInviteCol: TeamRole[] = normalizeRoles(invite.role);

    const roles: TeamRole[] = uniq(
      rolesFromJoin.length > 0 ? rolesFromJoin : rolesFromInviteCol,
    );

    let organizationName: string | null = null;

    const { data: teamData } = await teamsTable
      .select("organization_id")
      .eq("id", String(invite.team_id))
      .maybeSingle();

    const team = (teamData ?? null) as TeamRow | null;

    if (team?.organization_id) {
      const { data: orgData } = await organizationsTable
        .select("name")
        .eq("id", String(team.organization_id))
        .maybeSingle();

      const org = (orgData ?? null) as OrganizationRow | null;

      if (org?.name) {
        organizationName = String(org.name);
      }
    }

    return NextResponse.json({
      ok: true,
      email: String(invite.email ?? ""),
      teamId: invite.team_id ? String(invite.team_id) : null,
      companyId: invite.company_id ? String(invite.company_id) : null,
      organizationName,
      roles,
    });
  } catch (err) {
    console.error("[invite-accept][GET] unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error loading invite." },
      { status: 500 },
    );
  }
}
