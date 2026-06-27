import { NextResponse } from "next/server";
import { getCrmRequestUser } from "@/features/crm/server/auth";
import { resolveRequestLocale } from "@/features/i18n/server/requestLocale";
import { getCrmAdminClient } from "@/features/crm/server/supabase";
import { resolveCrmTeamContext } from "@/features/crm/server/team-context";
import {
  createReusableNiche,
  getLeadFormNichesData,
  getTeamNichesSettingsData,
  saveTeamNicheSelection,
} from "@/features/crm/server/niches.service";

function jsonError(error: string, status = 500) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function resolveNicheContext(request: Request) {
  const admin = getCrmAdminClient();
  const auth = await getCrmRequestUser(request, admin);

  if (!auth.ok) {
    return {
      ok: false as const,
      response: jsonError(
        auth.reason === "missing_auth" ? "missing_auth" : "invalid_session",
        401,
      ),
    };
  }

  try {
    const teamContext = await resolveCrmTeamContext({
      admin,
      userId: auth.userId,
      request,
    });

    return {
      ok: true as const,
      admin,
      userId: auth.userId,
      teamId: teamContext.teamId,
      isManagerOrAdmin: teamContext.isManagerOrAdmin,
    };
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (message === "not_a_member_of_team") {
      return {
        ok: false as const,
        response: jsonError("forbidden", 403),
      };
    }

    if (message === "missing_team") {
      return {
        ok: false as const,
        response: jsonError("missing_team", 400),
      };
    }

    return {
      ok: false as const,
      response: jsonError(message, 500),
    };
  }
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveNicheContext(request);
    if (!resolved.ok) return resolved.response;

    const requestedLocale = await resolveRequestLocale({
      request,
      admin: resolved.admin,
      userId: resolved.userId,
    });

    const url = new URL(request.url);
    const view = url.searchParams.get("view")?.trim() || "settings";
    const includeArchivedNicheId =
      url.searchParams.get("includeArchivedNicheId")?.trim() || null;

    if (view === "lead-form") {
      const data = await getLeadFormNichesData({
        admin: resolved.admin,
        teamId: resolved.teamId,
        includeArchivedNicheId,
        requestedLocale,
      });

      return NextResponse.json({ ok: true, ...data });
    }

    const data = await getTeamNichesSettingsData({
      admin: resolved.admin,
      teamId: resolved.teamId,
      requestedLocale,
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    console.error("[niches][GET] failed", error);
    return jsonError(error?.message ?? "niche_fetch_failed", 500);
  }
}

export async function POST(request: Request) {
  try {
    const resolved = await resolveNicheContext(request);
    if (!resolved.ok) return resolved.response;
    if (!resolved.isManagerOrAdmin) return jsonError("forbidden", 403);
    const requestedLocale = await resolveRequestLocale({
      request,
      admin: resolved.admin,
      userId: resolved.userId,
    });

    const body = (await request.json().catch(() => null)) as {
      name?: string;
    } | null;

    const niche = await createReusableNiche({
      admin: resolved.admin,
      teamId: resolved.teamId,
      userId: resolved.userId,
      name: String(body?.name ?? ""),
      sourceLocale: requestedLocale,
    });

    return NextResponse.json({ ok: true, niche }, { status: 201 });
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (message === "missing_name") {
      return jsonError(message, 400);
    }

    if (message === "duplicate_niche") {
      return jsonError("A niche with that name already exists.", 409);
    }

    console.error("[niches][POST] failed", error);
    return jsonError(message || "niche_create_failed", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const resolved = await resolveNicheContext(request);
    if (!resolved.ok) return resolved.response;
    if (!resolved.isManagerOrAdmin) return jsonError("forbidden", 403);

    const body = (await request.json().catch(() => null)) as {
      nicheIds?: string[];
    } | null;

    const nicheIds = Array.isArray(body?.nicheIds) ? body.nicheIds : [];
    const data = await saveTeamNicheSelection({
      admin: resolved.admin,
      teamId: resolved.teamId,
      nicheIds,
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    const message = String(error?.message ?? error);

    if (message === "invalid_niche_selection") {
      return jsonError(message, 400);
    }

    console.error("[niches][PUT] failed", error);
    return jsonError(message || "niche_save_failed", 500);
  }
}
