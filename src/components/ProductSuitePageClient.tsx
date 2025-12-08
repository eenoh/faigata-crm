"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TeamRow = {
  id: string;
  name: string;
  role: string | null;
};

export default function ProductSuitePageClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [canCreateTeam, setCanCreateTeam] = useState(false);
  const [openingTeamId, setOpeningTeamId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes.user ?? null;

        if (!user) {
          router.replace("/login");
          return;
        }

        // ---- 1) primary source: team_members (multi-team future) ----
        const { data: memberships, error: memberError } = await supabase
          .from("team_members")
          .select("team_id, role, teams(id, name)")
          .eq("user_id", user.id);

        if (memberError) {
          console.error(
            "[ProductSuite] failed to load team_members",
            memberError
          );
        }

        let rows: TeamRow[] = [];

        if (memberships && memberships.length > 0) {
          rows = memberships
            .filter((m: any) => m.teams)
            .map((m: any) => ({
              id: m.teams.id as string,
              name: m.teams.name as string,
              role: (m.role as string | null) ?? null,
            }));
        } else {
          // ---- 2) fallback: legacy single team via profiles.team_id ----
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("team_id")
            .eq("id", user.id)
            .single();

          if (profileError && profileError.code !== "PGRST116") {
            console.error("[ProductSuite] failed to load profile", profileError);
          }

          if (profile?.team_id) {
            const { data: team, error: teamError } = await supabase
              .from("teams")
              .select("id, name")
              .eq("id", profile.team_id)
              .single();

            if (teamError) {
              console.error(
                "[ProductSuite] failed to load team by profile",
                teamError
              );
            } else if (team) {
              rows = [
                {
                  id: team.id,
                  name: team.name,
                  role: "Owner",
                },
              ];
            }
          }
        }

        if (cancelled) return;

        setTeams(rows);

        const hasAdminRole = rows.some((t) =>
          (t.role ?? "").toLowerCase().includes("owner") ||
          (t.role ?? "").toLowerCase().includes("admin")
        );

        setCanCreateTeam(hasAdminRole || rows.length === 0);
      } catch (err) {
        console.error("[ProductSuite] unexpected error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleOpenTeam(teamId: string) {
    try {
      setOpeningTeamId(teamId);

      const res = await fetch("/api/select-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });

      if (!res.ok) {
        console.error("[ProductSuite] select-team failed", await res.text());
        setOpeningTeamId(null);
        return;
      }

      // Team is now stored server-side (e.g. in profile/cookie)
      router.push("/dashboard");
    } catch (err) {
      console.error("[ProductSuite] select-team error", err);
    } finally {
      setOpeningTeamId(null);
    }
  }

  function handleAddTeam() {
    router.push("/onboarding");
  }

  const totalCount = teams.length;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* header area for the card */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 mt-5">
            FaigataCRM
          </h2>
          <p className="text-sm text-slate-500">
            {totalCount === 0
              ? "You don’t have any CRM teams yet."
              : `You’re a member of ${totalCount} CRM team${
                  totalCount === 1 ? "" : "s"
                }.`}
          </p>
        </div>

        {canCreateTeam && (
          <button
            type="button"
            onClick={handleAddTeam}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
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
                        {team.role || "Member"}
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
