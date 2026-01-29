"use client";

import { useEffect, useState } from "react";
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

function normalizeRoleList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function bestRole(raw: unknown): string | null {
  const roles = normalizeRoleList(raw);
  if (!roles.length) return null;

  // pick the role with the highest rank
  let best = roles[0];
  let bestRank = ROLE_RANK[best.toLowerCase()] ?? 0;

  for (const r of roles) {
    const rank = ROLE_RANK[r.toLowerCase()] ?? 0;
    if (rank > bestRank) {
      best = r;
      bestRank = rank;
    }
  }

  // normalize casing to your preferred display (lowercase)
  const key = best.toLowerCase();
  if (key === "admin") return "admin";
  if (key === "manager") return "manager";
  if (key === "closer") return "closer";
  if (key === "setter") return "setter";
  if (key === "prospector") return "prospector";
  return best;
}

function rankOf(role: string | null): number {
  if (!role) return 0;
  return ROLE_RANK[role.toLowerCase()] ?? 0;
}

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
          console.error("[ProductSuite] failed to load team_members", memberError);
        }

        let rows: TeamRow[] = [];

        if (memberships && memberships.length > 0) {
          // Collapse to ONE row per team, with the HIGHEST role THIS USER has on that team.
          const byTeam = new Map<string, TeamRow>();

          for (const m of memberships as any[]) {
            if (!m?.teams?.id) continue;

            const teamId = String(m.teams.id);
            const incoming: TeamRow = {
              id: teamId,
              name: String(m.teams.name ?? ""),
              role: bestRole(m.role), // <- role(s) for THIS user membership row
            };

            const existing = byTeam.get(teamId);
            if (!existing) {
              byTeam.set(teamId, incoming);
              continue;
            }

            // keep whichever has higher role rank
            if (rankOf(incoming.role) > rankOf(existing.role)) {
              byTeam.set(teamId, incoming);
            }
          }

          rows = Array.from(byTeam.values());

          // (optional) sort by role desc then name
          rows.sort((a, b) => {
            const d = rankOf(b.role) - rankOf(a.role);
            if (d !== 0) return d;
            return a.name.localeCompare(b.name);
          });
        } else {
          // ---- 2) fallback: legacy single team via profiles.team_id ----
          // IMPORTANT: role should come from CURRENT USER's profile.role (text[]) NOT hardcoded admin
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("team_id, role")
            .eq("id", user.id)
            .single();

          if (profileError && (profileError as any).code !== "PGRST116") {
            console.error("[ProductSuite] failed to load profile", profileError);
          }

          if (profile?.team_id) {
            const { data: team, error: teamError } = await supabase
              .from("teams")
              .select("id, name")
              .eq("id", profile.team_id)
              .single();

            if (teamError) {
              console.error("[ProductSuite] failed to load team by profile", teamError);
            } else if (team) {
              rows = [
                {
                  id: team.id,
                  name: team.name,
                  role: bestRole(profile.role), // ✅ highest role the CURRENT USER possesses
                },
              ];
            }
          }
        }

        if (cancelled) return;

        setTeams(rows);

        const hasAdminRole = rows.some((t) => (t.role ?? "").toLowerCase() === "admin");
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
            <p className="text-xs text-slate-500">Select a team to open its CRM workspace.</p>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading your teams…</div>
        ) : totalCount === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            You’re not in any CRM team yet.
            {canCreateTeam && (
              <>
                {" "}
                Click <span className="font-semibold">Add team</span> to create your first one.
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
                        {team.role
                          ? team.role.charAt(0).toUpperCase() + team.role.slice(1)
                          : "Member"}
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
