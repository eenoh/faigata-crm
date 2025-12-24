import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

const INVITE_TTL_HOURS = 24;

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/* -------------------- POST: accept invite -------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      inviteId?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
    };

    const { inviteId, email, firstName, lastName, password } = body;

    if (!inviteId || !email || !firstName || !lastName || !password) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    /* 1) Load invite */
    const { data: invite } = await supabaseAdmin
      .from("team_invites")
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
      `
      )
      .eq("id", inviteId)
      .single();

    if (!invite) {
      return NextResponse.json({ ok: false, error: "Invite not found." }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({ ok: false, error: "Invite already accepted." }, { status: 400 });
    }

    const created = new Date(invite.created_at);
    const expires = new Date(created.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    if (Date.now() > expires.getTime()) {
      return NextResponse.json({ ok: false, error: "Invite expired." }, { status: 410 });
    }

    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Email mismatch." }, { status: 400 });
    }

    /* 2) Resolve roles → ALWAYS ARRAY */
    const rolesFromJoin: TeamRole[] = Array.isArray(invite.team_invite_roles)
      ? invite.team_invite_roles
          .map((r: any) => r?.role)
          .filter((r: any): r is TeamRole => AVAILABLE_ROLES.includes(r))
      : [];

    const rolesForProfile: TeamRole[] =
      rolesFromJoin.length > 0 ? uniq(rolesFromJoin) : ["Prospector"];

    /* 3) Ensure auth user */
    let userId: string | null = invite.user_id ?? null;

    if (!userId) {
      const { data: createdUser } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });

      if (!createdUser?.user) {
        return NextResponse.json({ ok: false, error: "User creation failed." }, { status: 500 });
      }

      userId = createdUser.user.id;

      await supabaseAdmin
        .from("team_invites")
        .update({ user_id: userId })
        .eq("id", inviteId);
    } else {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });
    }

    const finalUserId = userId;

    /* 4) Resolve company_id */
    let companyId: string | null = invite.company_id ?? null;

    if (!companyId) {
      const { data: team } = await supabaseAdmin
        .from("teams")
        .select("organization_id")
        .eq("id", invite.team_id)
        .maybeSingle();

      if (team?.organization_id) companyId = team.organization_id;
    }

    /* 5) UPSERT profile — role is GUARANTEED text[] */
    await supabaseAdmin.from("profiles").upsert(
      {
        id: finalUserId,
        first_name: firstName,
        last_name: lastName,
        team_id: invite.team_id,
        company_id: companyId,
        role: rolesForProfile, // ✅ ARRAY, ALWAYS
        is_active: true,
      },
      { onConflict: "id" }
    );

    /* 6) team_members (one row per role) */
    const memberRows = rolesForProfile.map((r) => ({
      team_id: invite.team_id,
      user_id: finalUserId,
      role: r,
      joined_at: new Date().toISOString(),
    }));

    await supabaseAdmin
      .from("team_members")
      .upsert(memberRows, { onConflict: "team_id,user_id,role" });

    /* 7) Mark invite accepted */
    await supabaseAdmin
      .from("team_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inviteId);

    return NextResponse.json({ ok: true, teamId: invite.team_id });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected error while accepting invite." },
      { status: 500 }
    );
  }
}
  