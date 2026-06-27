import "server-only";

import { getRequestUser } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamMembership } from "@/features/organizations/server/team-membership.service";
import type { WorkspaceRole } from "@/features/organizations/server/team-membership.service";

type AuthedBillingContext = {
  userId: string;
  teamId: string;
  orgId: string;
  livemode: boolean;
  stripeAccountId: string;
  role: WorkspaceRole;
  roles: WorkspaceRole[];
};

type AuthReason =
  | "no_user"
  | "profile_missing"
  | "missing_org"
  | "missing_privilege"
  | "missing_stripe_account"
  | "internal_error";

type BillingAuthResult =
  | { ok: true; ctx: AuthedBillingContext }
  | { ok: false; reason: AuthReason; details?: unknown };

const PRIVILEGED_ROLES = new Set<WorkspaceRole>([
  "closer",
  "manager",
  "admin",
]);

function parseLivemode(request: Request): boolean {
  const url = new URL(request.url);
  const mode = String(url.searchParams.get("mode") ?? "")
    .trim()
    .toLowerCase();

  if (mode === "live") return true;
  if (mode === "test") return false;

  const livemode = String(url.searchParams.get("livemode") ?? "")
    .trim()
    .toLowerCase();

  if (livemode === "1" || livemode === "true") return true;
  if (livemode === "0" || livemode === "false") return false;

  return false;
}

export async function getAuthedBillingContextWithReason(
  request: Request,
): Promise<BillingAuthResult> {
  try {
    const auth = await getRequestUser(request);
    if (!auth.ok) return { ok: false, reason: "no_user" };

    const supabase = getSupabaseAdminClient();
    const membership = await resolveUserTeamMembership({
      admin: supabase,
      userId: auth.user.id,
      request,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "profile_lookup_failed") {
        return null;
      }
      throw error;
    });

    if (!membership) {
      return { ok: false, reason: "profile_missing" };
    }

    const isPrivileged = membership.roles.some((role) =>
      PRIVILEGED_ROLES.has(role),
    );
    if (!isPrivileged) {
      return {
        ok: false,
        reason: "missing_privilege",
        details: { roles: membership.roles },
      };
    }

    if (!membership.orgId) {
      return {
        ok: false,
        reason: "missing_org",
        details: { teamId: membership.teamId },
      };
    }

    const livemode = parseLivemode(request);
    const { data: account, error: accountError } = await supabase
      .from("organization_stripe_accounts")
      .select("stripe_account_id")
      .eq("org_id", membership.orgId)
      .eq("livemode", livemode)
      .maybeSingle();

    if (accountError) {
      return { ok: false, reason: "internal_error", details: accountError };
    }

    const stripeAccountId = (
      account as { stripe_account_id?: string | null } | null
    )?.stripe_account_id;

    if (!stripeAccountId) {
      return {
        ok: false,
        reason: "missing_stripe_account",
        details: { orgId: membership.orgId, livemode },
      };
    }

    return {
      ok: true,
      ctx: {
        userId: auth.user.id,
        teamId: membership.teamId,
        orgId: membership.orgId,
        livemode,
        stripeAccountId,
        role: membership.highestRole,
        roles: membership.roles,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "internal_error",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getAuthedBillingContext(request: Request) {
  const result = await getAuthedBillingContextWithReason(request);
  return result.ok ? result.ctx : null;
}
