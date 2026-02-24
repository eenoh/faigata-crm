// src/app/api/crm/invite-accept/route.ts (example path — keep your real path)
// NOTE: only changed logic/types; no behavior changes except safer parsing.

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
  // Accept:
  // - "Setter"
  // - ["Setter","Closer"]
  // - null/undefined
  if (Array.isArray(raw)) {
    return raw.filter(isTeamRole);
  }
  if (isTeamRole(raw)) return [raw];
  return [];
}

/* -------------- GET: fetch invite metadata for client page -------------- */
export async function GET(req: NextRequest) {
  try {
    const inviteId = req.nextUrl.searchParams.get("inviteId");
    if (!inviteId) {
      return NextResponse.json(
        { ok: false, error: "Missing inviteId" },
        { status: 400 },
      );
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
      `,
      )
      .eq("id", inviteId)
      .single();

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

    // Roles: prefer join table; fallback to team_invites.role (might be single OR array)
    const joinRows: Array<{ role?: unknown }> = Array.isArray(
      (invite as any).team_invite_roles,
    )
      ? ((invite as any).team_invite_roles as any[])
      : [];

    const rolesFromJoin: TeamRole[] = joinRows
      .map((r) => r?.role)
      .filter(isTeamRole);

    const rolesFromInviteCol: TeamRole[] = normalizeRoles((invite as any).role);

    const roles: TeamRole[] = uniq(
      rolesFromJoin.length > 0 ? rolesFromJoin : rolesFromInviteCol,
    );

    // Optional: organization name from teams -> organizations
    let organizationName: string | null = null;

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("organization_id")
      .eq("id", String(invite.team_id))
      .maybeSingle();

    if (team?.organization_id) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", String(team.organization_id))
        .maybeSingle();

      if (org?.name) organizationName = String(org.name);
    }

    return NextResponse.json({
      ok: true,
      email: String(invite.email ?? ""),
      teamId: String(invite.team_id ?? ""),
      // ✅ avoid redundant `?? null` warnings by using a normal conditional
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
