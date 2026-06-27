import type { User } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getBearerToken } from "@/features/crm/server/request";
import { getCrmAdminClient } from "@/features/crm/server/supabase";

export type CrmRequestUserResult =
  | {
      ok: true;
      token: string;
      user: User;
      userId: string;
    }
  | {
      ok: false;
      reason: "missing_auth" | "invalid_session";
      detail?: string;
    };

export async function getCrmRequestUser(
  request: Request | { headers: Headers },
  admin: AppSupabaseClient = getCrmAdminClient(),
): Promise<CrmRequestUserResult> {
  const token = getBearerToken(request);

  if (!token) {
    return { ok: false, reason: "missing_auth" };
  }

  const { data, error } = await admin.auth.getUser(token);
  const user = data.user ?? null;

  if (error || !user?.id) {
    return {
      ok: false,
      reason: "invalid_session",
      detail: error?.message,
    };
  }

  return {
    ok: true,
    token,
    user,
    userId: String(user.id),
  };
}
