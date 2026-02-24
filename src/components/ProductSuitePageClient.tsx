"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TeamRow = {
  id: string;
  name: string;
  role: string | null;
};

/** ---------- role ranking helpers ---------- */

const ROLE_RANK: Record<string, number> = {
  admin: 5,
  manager: 4,
  closer: 3,
  setter: 2,
  prospector: 1,
};

function normalizeRoles(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter(Boolean);
  if (typeof raw === "string") {
    const v = raw.trim();
    return v ? [v] : [];
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

  for (const r of roles) {
    const rr = rankOf(r);
    if (rr > bestRank) {
      best = r;
      bestRank = rr;
    }
  }

  const key = best.toLowerCase();
  return ROLE_RANK[key] ? key : best;
}

function titleCaseRole(role: string | null) {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function ProductSuitePageClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [canCreateTeam, setCanCreateTeam] = useState(false);
  const [openingTeamId, setOpeningTeamId] = useState<string | null>(null);

  const loadTeamsForUser = useCallback(
    async (userId: string): Promise<TeamRow[]> => {
      // 1) primary source: team_members
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

        for (const m of memberships as any[]) {
          const teamId = m?.teams?.id ? String(m.teams.id) : null;
          if (!teamId) continue;

          const incoming: TeamRow = {
            id: teamId,
            name: String(m.teams.name ?? ""),
            role: pickHighestRole(m.role),
          };

          const existing = byTeam.get(teamId);
          if (!existing || rankOf(incoming.role) > rankOf(existing.role)) {
            byTeam.set(teamId, incoming);
          }
        }

        const rows = Array.from(byTeam.values());
        rows.sort((a, b) => {
          const d = rankOf(b.role) - rankOf(a.role);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        });

        return rows;
      }

      // 2) fallback: profiles.team_id
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("team_id, role")
        .eq("id", userId)
        .single();

      if (profileError && (profileError as any).code !== "PGRST116") {
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
              id: team.id,
              name: team.name,
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
          (t) => (t.role ?? "").toLowerCase() === "admin",
        );
        setCanCreateTeam(hasAdminRole || rows.length === 0);
      } catch (err) {
        console.error("[ProductSuite] unexpected error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, loadTeamsForUser]);

  const handleOpenTeam = useCallback(
    async (teamId: string) => {
      if (openingTeamId) return; // prevent double clicks while opening
      try {
        setOpeningTeamId(teamId);

        const res = await fetch("/api/select-team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId }),
        });

        if (!res.ok) {
          console.error(
            "[ProductSuite] select-team failed",
            await res.text().catch(() => ""),
          );
          return;
        }

        router.push("/dashboard");
      } catch (err) {
        console.error("[ProductSuite] select-team error", err);
      } finally {
        setOpeningTeamId(null);
      }
    },
    [router, openingTeamId],
  );

  const handleAddTeam = useCallback(() => {
    router.push("/onboarding");
  }, [router]);

  const totalCount = teams.length;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mt-5">Lumo</h2>
          <p className="text-sm text-slate-500">
            {totalCount === 0
              ? "You don’t have any CRM teams yet."
              : `You’re a member of ${totalCount} CRM team${totalCount === 1 ? "" : "s"}.`}
          </p>
        </div>

        {canCreateTeam && (
          <button
            type="button"
            onClick={handleAddTeam}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
          >
            + Add Team
          </button>
        )}
      </div>

      <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">CRM Teams</h3>
            <p className="text-xs text-slate-500">
              Select a team to open its CRM workspace.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            Loading your teams…
          </div>
        ) : totalCount === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            You’re not in any CRM team yet.
            {canCreateTeam && (
              <>
                {" "}
                Click <span className="font-semibold">Add team</span> to create
                your first one.
              </>
            )}
          </div>
        ) : (
          <div className="max-h-[800px] overflow-y-auto overflow-x-auto rounded-b-xl">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="text-left">
                  <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                    Team Name
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                    Role
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const isOpening = openingTeamId === team.id;

                  return (
                    <tr
                      key={team.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => handleOpenTeam(team.id)}
                    >
                      <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-800">
                        {team.name}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-500 text-xs">
                        {titleCaseRole(team.role)}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-top text-right">
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                          {isOpening ? "Opening…" : "Open Dashboard"}
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
