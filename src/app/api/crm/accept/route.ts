// src/app/api/auth/accept/route.ts
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

function jsonError(message: string, status = 400, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error: message, ...(extra ?? {}) },
    { status },
  );
}

/** Normalize a possibly-messy role value to a canonical TeamRole (case-insensitive). */
function toTeamRole(v: unknown): TeamRole | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const match = AVAILABLE_ROLES.find((r) => r.toLowerCase() === lower) ?? null;
  return match;
}

/* -------------------- POST: accept invite -------------------- */
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
      return jsonError("Missing required fields.", 400);
    }

    /* 1) Load invite */
    const { data: invite, error: inviteErr } = await supabaseAdmin
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
      `,
      )
      .eq("id", inviteId)
      .single();

    if (inviteErr) {
      // If row truly doesn't exist, Supabase often returns a 406-ish error message.
      // We treat any error as not found here to avoid leaking internals.
      return jsonError("Invite not found.", 404, { code: "invite_not_found" });
    }

    if (!invite) {
      return jsonError("Invite not found.", 404, { code: "invite_not_found" });
    }

    if (invite.accepted_at) {
      return jsonError("Invite already accepted.", 400, {
        code: "invite_already_accepted",
      });
    }

    const createdAt = new Date(String(invite.created_at));
    if (Number.isNaN(createdAt.getTime())) {
      return jsonError("Invite has invalid created_at.", 400, {
        code: "invite_invalid_created_at",
      });
    }

    const expiresAt = new Date(
      createdAt.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000,
    );
    if (Date.now() > expiresAt.getTime()) {
      return jsonError("Invite expired.", 410, { code: "invite_expired" });
    }

    if (
      String(invite.email ?? "")
        .trim()
        .toLowerCase() !== email.toLowerCase()
    ) {
      return jsonError("Email mismatch.", 400, {
        code: "invite_email_mismatch",
      });
    }

    /* 2) Resolve roles → ALWAYS ARRAY */
    const rolesFromJoin: TeamRole[] = Array.isArray(
      (invite as any).team_invite_roles,
    )
      ? (invite as any).team_invite_roles
          .map((r: any) => toTeamRole(r?.role))
          .filter((r: TeamRole | null): r is TeamRole => Boolean(r))
      : [];

    const rolesForProfile: TeamRole[] =
      rolesFromJoin.length > 0 ? uniq(rolesFromJoin) : ["Prospector"];

    /* 3) Ensure auth user */
    let userId: string | null = (invite as any).user_id ?? null;

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
        });
      }

      userId = createdUser.user.id;

      const { error: linkErr } = await supabaseAdmin
        .from("team_invites")
        .update({ user_id: userId })
        .eq("id", inviteId);

      if (linkErr) {
        return jsonError("Failed to link user to invite.", 500, {
          code: "invite_link_user_failed",
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
        });
      }
    }

    const finalUserId = userId;

    /* 4) Resolve company_id */
    let companyId: string | null = (invite as any).company_id ?? null;

    if (!companyId) {
      const { data: team, error: teamErr } = await supabaseAdmin
        .from("teams")
        .select("organization_id")
        .eq("id", (invite as any).team_id)
        .maybeSingle();

      if (teamErr) {
        return jsonError("Failed to resolve team organization.", 500, {
          code: "team_lookup_failed",
        });
      }

      if (team?.organization_id) companyId = String(team.organization_id);
    }

    /* 5) UPSERT profile — role is GUARANTEED text[] */
    const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: finalUserId,
        first_name: firstName,
        last_name: lastName,
        team_id: (invite as any).team_id,
        company_id: companyId,
        role: rolesForProfile, // ✅ ARRAY, ALWAYS
        is_active: true,
      } as any,
      { onConflict: "id" },
    );

    if (profErr) {
      return jsonError("Failed to upsert profile.", 500, {
        code: "profile_upsert_failed",
      });
    }

    /* 6) team_members (one row per role) */
    const memberRows = rolesForProfile.map((r) => ({
      team_id: (invite as any).team_id,
      user_id: finalUserId,
      role: r,
      joined_at: nowIso,
    }));

    const { error: tmErr } = await supabaseAdmin
      .from("team_members")
      .upsert(memberRows as any, { onConflict: "team_id,user_id,role" });

    if (tmErr) {
      return jsonError("Failed to upsert team membership.", 500, {
        code: "team_members_upsert_failed",
      });
    }

    /* 7) Mark invite accepted */
    const { error: acceptErr } = await supabaseAdmin
      .from("team_invites")
      .update({ accepted_at: nowIso })
      .eq("id", inviteId);

    if (acceptErr) {
      return jsonError("Failed to mark invite accepted.", 500, {
        code: "invite_accept_failed",
      });
    }

    return NextResponse.json({ ok: true, teamId: (invite as any).team_id });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error while accepting invite.",
        // You can remove this in production if you don’t want to leak info:
        message: String(e?.message ?? e),
      },
      { status: 500 },
    );
  }
}
