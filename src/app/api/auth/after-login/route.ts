// src/app/api/auth/after-login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = {
  userId?: string;
  inviteId?: string | null;
  teamId?: string | null;
};
type JsonRes =
  | { needsOnboarding: boolean; teamId: string | null }
  | { error: string };

const bad = (error: string, status = 400) =>
  NextResponse.json({ error } satisfies JsonRes, { status });
const ok = (needsOnboarding: boolean, teamId: string | null) =>
  NextResponse.json({ needsOnboarding, teamId } satisfies JsonRes);

export async function POST(req: NextRequest) {
  try {
    const { userId, inviteId, teamId } = (await req.json()) as Body;
    if (!userId) return bad("Missing userId");

    // 1) auth user (email + metadata)
    const { data: userRes, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    const user = userRes?.user;
    if (authError || !user) {
      console.error("[after-login] auth lookup error", authError);
      return bad("User not found");
    }

    const email = user.email;
    if (!email) return bad("User has no email");

    const meta = (user.user_metadata ?? {}) as any;
    const firstName = meta.first_name ?? null;
    const lastName = meta.last_name ?? null;

    // 2) profile (ensure exists)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError)
      console.error("[after-login] profile select error", profileError);

    if (!profile) {
      const { error } = await supabaseAdmin.from("profiles").insert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        team_id: null,
        company_id: null,
      });
      if (error) console.error("[after-login] profile insert error", error);
    }

    let primaryTeamId: string | null = profile?.team_id ?? null;
    let derivedCompanyId: string | null = profile?.company_id ?? null;

    // 3) pending invites for email (optionally scoped)
    let q = supabaseAdmin
      .from("team_invites")
      .select("id, team_id, role, invited_by")
      .eq("email", email)
      .is("accepted_at", null);

    if (inviteId) q = q.eq("id", inviteId);
    if (teamId) q = q.eq("team_id", teamId);

    const { data: invites, error: invitesError } = await q;
    if (invitesError)
      console.error("[after-login] invites lookup error", invitesError);

    if (invites?.length) {
      for (const inv of invites) {
        const currentTeamId = String(inv.team_id);

        // roles from team_invite_roles OR fallback to inv.role
        const { data: inviteRoles, error: rolesError } = await supabaseAdmin
          .from("team_invite_roles")
          .select("role")
          .eq("invite_id", inv.id);

        if (rolesError)
          console.error("[after-login] invite roles lookup error", rolesError);

        const memberRoles = inviteRoles?.length
          ? inviteRoles.map((r: any) => String(r.role))
          : inv.role
            ? [String(inv.role)]
            : [];

        const { error: tmError } = await supabaseAdmin
          .from("team_members")
          .upsert(
            { team_id: currentTeamId, user_id: userId, role: memberRoles },
            { onConflict: "team_id,user_id" },
          );

        if (tmError)
          console.error("[after-login] team_members upsert error", tmError);

        // derive company_id from inviter once
        if (!derivedCompanyId && inv.invited_by) {
          const { data: inviter, error } = await supabaseAdmin
            .from("profiles")
            .select("company_id")
            .eq("id", inv.invited_by)
            .single();

          if (error)
            console.error("[after-login] inviter profile error", error);
          else derivedCompanyId = inviter?.company_id ?? null;
        }

        // mark accepted (best-effort)
        const { error: acceptErr } = await supabaseAdmin
          .from("team_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", inv.id);

        if (acceptErr)
          console.error("[after-login] invite accept update error", acceptErr);

        if (!primaryTeamId) primaryTeamId = currentTeamId;
      }

      // update profile with team/company (best-effort)
      if (primaryTeamId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            first_name: profile?.first_name ?? firstName,
            last_name: profile?.last_name ?? lastName,
            team_id: primaryTeamId,
            company_id: profile?.company_id ?? derivedCompanyId,
          })
          .eq("id", userId);

        if (error) console.error("[after-login] profile update error", error);
      }
    }

    // 4) onboarding decision
    return primaryTeamId ? ok(false, primaryTeamId) : ok(true, null);
  } catch (err) {
    console.error("[after-login] unexpected error", err);
    return bad("Unexpected error", 500);
  }
}
