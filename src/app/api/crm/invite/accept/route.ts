import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

const INVITE_TTL_HOURS = 24;

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeRoles(raw: unknown): TeamRole[] {
  // Accept:
  // - "Setter"
  // - ["Setter","Closer"]
  // - null/undefined
  if (Array.isArray(raw)) {
    return raw.filter((r): r is TeamRole => AVAILABLE_ROLES.includes(r as TeamRole));
  }
  if (typeof raw === "string" && AVAILABLE_ROLES.includes(raw as TeamRole)) {
    return [raw as TeamRole];
  }
  return [];
}

/* -------------- GET: fetch invite metadata for client page -------------- */
export async function GET(req: NextRequest) {
  try {
    const inviteId = req.nextUrl.searchParams.get("inviteId");
    if (!inviteId) {
      return NextResponse.json({ ok: false, error: "Missing inviteId" }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("team_invites")
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
      `
      )
      .eq("id", inviteId)
      .single();

    if (inviteError || !invite) {
      console.error("[invite-accept][GET] invite error", inviteError);
      return NextResponse.json(
        { ok: false, error: "Invite not found or no longer valid." },
        { status: 404 }
      );
    }

    if (invite.accepted_at) {
      return NextResponse.json({ ok: false, error: "Invite has already been accepted." }, { status: 400 });
    }

    if (invite.created_at) {
      const created = new Date(invite.created_at);
      const expires = new Date(created.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
      if (Date.now() > expires.getTime()) {
        return NextResponse.json({ ok: false, error: "Invite has expired." }, { status: 410 });
      }
    }

    // Roles: prefer join table; fallback to team_invites.role (might be single OR array)
    const rolesFromJoin: TeamRole[] = Array.isArray(invite.team_invite_roles)
      ? invite.team_invite_roles
          .map((r: any) => r?.role)
          .filter((r: any): r is TeamRole => AVAILABLE_ROLES.includes(r))
      : [];

    const rolesFromInviteCol: TeamRole[] = normalizeRoles(invite.role);

    const roles: TeamRole[] = uniq(
      rolesFromJoin.length > 0 ? rolesFromJoin : rolesFromInviteCol
    );

    // Optional: organization name from teams -> organizations
    let organizationName: string | null = null;

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("organization_id")
      .eq("id", invite.team_id)
      .maybeSingle();

    if (team?.organization_id) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", team.organization_id)
        .maybeSingle();

      if (org?.name) organizationName = org.name as string;
    }

    return NextResponse.json({
      ok: true,
      email: invite.email as string,
      teamId: invite.team_id as string,
      companyId: (invite.company_id as string | null) ?? null,
      organizationName,
      roles,
    });
  } catch (err) {
    console.error("[invite-accept][GET] unexpected error", err);
    return NextResponse.json({ ok: false, error: "Unexpected error loading invite." }, { status: 500 });
  }
}
