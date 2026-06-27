"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";

type TeamRow = {
  id: string;
  name: string;
  role: string | null;
};

const ROLE_RANK: Record<string, number> = {
  admin: 5,
  manager: 4,
  closer: 3,
  setter: 2,
  prospector: 1,
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getLocaleHeaders(locale: string) {
  return {
    "Content-Type": "application/json",
    "x-faigata-locale": locale,
  };
}

function normalizeRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter(Boolean);
  }

  if (typeof raw === "string") {
    const value = raw.trim();
    return value ? [value] : [];
  }

  return [];
}

function rankOf(role: string | null | undefined): number {
  if (!role) return 0;
  return ROLE_RANK[String(role).toLowerCase()] ?? 0;
}

function pickHighestRole(raw: unknown): string | null {
  const roles = normalizeRoles(raw);
  if (!roles.length) return null;

  let best = roles[0];
  let bestRank = rankOf(best);

  for (const role of roles) {
    const nextRank = rankOf(role);
    if (nextRank > bestRank) {
      best = role;
      bestRank = nextRank;
    }
  }

  const key = best.toLowerCase();
  return ROLE_RANK[key] ? key : best;
}

function getRoleLabel(
  common: ReturnType<typeof useTranslations<"Common">>,
  role: unknown,
) {
  switch (String(role ?? "").trim().toLowerCase()) {
    case "admin":
      return common("roles.admin");
    case "manager":
      return common("roles.manager");
    case "prospector":
      return common("roles.prospector");
    case "setter":
      return common("roles.setter");
    case "closer":
      return common("roles.closer");
    default:
      return common("roles.member");
  }
}

export default function ProductSuitePageClient() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("ProductSuite");
  const common = useTranslations("Common");

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [canCreateTeam, setCanCreateTeam] = useState(false);
  const [openingTeamId, setOpeningTeamId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadTeamsForUser = useCallback(
    async (userId: string): Promise<TeamRow[]> => {
      const { data: memberships, error: memberError } = await supabase
        .from("team_members")
        .select("team_id, role, teams(id, name)")
        .eq("user_id", userId);

      if (memberError) {
        console.error(
          "[ProductSuite] failed to load team_members",
          memberError,
        );
      }

      if (memberships && memberships.length > 0) {
        const byTeam = new Map<string, TeamRow>();

        for (const membership of memberships as Array<{
          role?: unknown;
          teams?: { id?: unknown; name?: unknown } | null;
        }>) {
          const teamId =
            membership?.teams?.id !== null &&
            membership?.teams?.id !== undefined
              ? String(membership.teams.id)
              : null;

          if (!teamId) continue;

          const incoming: TeamRow = {
            id: teamId,
            name: String(membership.teams?.name ?? ""),
            role: pickHighestRole(membership.role),
          };

          const existing = byTeam.get(teamId);
          if (!existing || rankOf(incoming.role) > rankOf(existing.role)) {
            byTeam.set(teamId, incoming);
          }
        }

        const rows = Array.from(byTeam.values());
        rows.sort((a, b) => {
          const diff = rankOf(b.role) - rankOf(a.role);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        });

        return rows;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("team_id, role")
        .eq("id", userId)
        .single();

      if (
        profileError &&
        (profileError as { code?: string }).code !== "PGRST116"
      ) {
        console.error("[ProductSuite] failed to load profile", profileError);
      }

      if (!profile?.team_id) return [];

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("id", profile.team_id)
        .single();

      if (teamError) {
        console.error(
          "[ProductSuite] failed to load team by profile",
          teamError,
        );
        return [];
      }

      return team
        ? [
            {
              id: String((team as { id?: unknown }).id ?? ""),
              name: String((team as { name?: unknown }).name ?? ""),
              role: pickHighestRole(profile.role),
            },
          ]
        : [];
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatusMessage(null);

        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user ?? null;

        if (!user) {
          router.replace("/login");
          return;
        }

        const rows = await loadTeamsForUser(user.id);
        if (cancelled) return;

        setTeams(rows);

        const hasAdminRole = rows.some(
          (team) => (team.role ?? "").toLowerCase() === "admin",
        );
        setCanCreateTeam(hasAdminRole || rows.length === 0);
      } catch (error) {
        console.error("[ProductSuite] unexpected error", error);
        if (!cancelled) {
          setStatusMessage(t("errors.loadTeams"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, loadTeamsForUser, t]);

  const handleOpenTeam = useCallback(
    async (teamId: string) => {
      if (openingTeamId) return;

      try {
        setStatusMessage(null);
        setOpeningTeamId(teamId);

        const response = await fetch("/api/select-team", {
          method: "POST",
          headers: getLocaleHeaders(locale),
          body: JSON.stringify({ teamId }),
        });

        if (!response.ok) {
          console.error(
            "[ProductSuite] select-team failed",
            await response.text().catch(() => ""),
          );
          setStatusMessage(t("errors.openTeam"));
          return;
        }

        router.push("/dashboard");
      } catch (error) {
        console.error("[ProductSuite] select-team error", error);
        setStatusMessage(t("errors.openTeam"));
      } finally {
        setOpeningTeamId(null);
      }
    },
    [router, openingTeamId, t, locale],
  );

  const handleAddTeam = useCallback(() => {
    router.push("/onboarding");
  }, [router]);

  const totalCount = teams.length;

  const pageTitle = cn(
    "mt-5 text-2xl font-semibold",
    isDark ? "text-slate-100" : "text-slate-900",
  );
  const pageSub = cn("text-sm", isDark ? "text-slate-400" : "text-slate-500");

  const shellCard = cn(
    "flex-1 rounded-xl border shadow-sm",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );

  const cardHeader = cn(
    "flex items-center justify-between border-b px-4 py-3",
    isDark ? "border-slate-800" : "border-slate-200",
  );

  const thBase = cn(
    "border-b px-3 py-2 text-left font-semibold",
    isDark
      ? "border-slate-800 text-slate-200"
      : "border-slate-200 text-slate-700",
  );

  const thRight = cn(
    "border-b px-3 py-2 text-right font-semibold",
    isDark
      ? "border-slate-800 text-slate-200"
      : "border-slate-200 text-slate-700",
  );

  const theadBg = isDark ? "bg-slate-900/60" : "bg-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/40" : "hover:bg-slate-50";

  const tdName = cn(
    "border-b px-3 py-2 align-top",
    isDark
      ? "border-slate-900 text-slate-200"
      : "border-slate-100 text-slate-800",
  );

  const tdRole = cn(
    "border-b px-3 py-2 align-top text-xs",
    isDark
      ? "border-slate-900 text-slate-400"
      : "border-slate-100 text-slate-500",
  );

  const badge = (active: boolean) =>
    cn(
      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
      active
        ? isDark
          ? "bg-indigo-500/10 text-indigo-200"
          : "bg-indigo-50 text-indigo-700"
        : isDark
          ? "bg-slate-900/50 text-slate-200"
          : "bg-slate-100 text-slate-700",
    );

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={pageTitle}>{t("title")}</h2>
          <p className={pageSub}>
            {totalCount === 0
              ? t("emptySummary")
              : t("memberSummary", { count: totalCount })}
          </p>
        </div>

        {canCreateTeam && (
          <button
            type="button"
            onClick={handleAddTeam}
            className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {t("addTeam")}
          </button>
        )}
      </div>

      {statusMessage ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            isDark
              ? "border-rose-900/60 bg-rose-950/30 text-rose-200"
              : "border-rose-200 bg-rose-50 text-rose-700",
          )}
        >
          {statusMessage}
        </div>
      ) : null}

      <div className={shellCard}>
        <div className={cardHeader}>
          <div>
            <h3
              className={cn(
                "text-sm font-semibold",
                isDark ? "text-slate-100" : "text-slate-800",
              )}
            >
              {t("table.title")}
            </h3>
            <p
              className={cn(
                "text-xs",
                isDark ? "text-slate-400" : "text-slate-500",
              )}
            >
              {t("table.description")}
            </p>
          </div>
        </div>

        {loading ? (
          <div
            className={cn(
              "px-4 py-6 text-sm",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {t("loading")}
          </div>
        ) : totalCount === 0 ? (
          <div
            className={cn(
              "px-4 py-6 text-sm",
              isDark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {t("noTeams")}
            {canCreateTeam && (
              <>
                {" "}
                {t("noTeamsCtaPrefix")}{" "}
                <span
                  className={cn(
                    "font-semibold",
                    isDark ? "text-slate-200" : "text-slate-700",
                  )}
                >
                  {t("addTeamLabel")}
                </span>{" "}
                {t("noTeamsCtaSuffix")}
              </>
            )}
          </div>
        ) : (
          <div className="max-h-[800px] overflow-x-auto overflow-y-auto rounded-b-xl">
            <table className="w-full border-collapse text-sm">
              <thead className={cn("sticky top-0 z-10", theadBg)}>
                <tr>
                  <th className={thBase}>{t("table.columns.teamName")}</th>
                  <th className={thBase}>{t("table.columns.role")}</th>
                  <th className={thRight}>{t("table.columns.open")}</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const isOpening = openingTeamId === team.id;

                  return (
                    <tr
                      key={team.id}
                      className={cn("cursor-pointer", rowHover)}
                      onClick={() => handleOpenTeam(team.id)}
                    >
                      <td className={tdName}>{team.name}</td>
                      <td className={tdRole}>
                        {team.role
                          ? getRoleLabel(common, team.role)
                          : common("roles.member")}
                      </td>
                      <td
                        className={cn(
                          "border-b px-3 py-2 text-right align-top",
                          isDark ? "border-slate-900" : "border-slate-100",
                        )}
                      >
                        <span className={badge(true)}>
                          {isOpening ? t("opening") : t("openDashboard")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
