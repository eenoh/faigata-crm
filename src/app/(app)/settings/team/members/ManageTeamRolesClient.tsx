"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const AVAILABLE_ROLES = [
  "Prospector",
  "Setter",
  "Closer",
  "Manager",
  "Admin",
] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

type MemberRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  roles: TeamRole[];
};

export function ManageTeamRolesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teamId = searchParams.get("team");

  const [currentUserRoles, setCurrentUserRoles] = useState<TeamRole[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;

    async function load() {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes.user) {
          router.replace("/login");
          return;
        }

        // load current user's roles
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userRes.user.id)
          .single();

        if (!cancelled && profile?.role) {
          setCurrentUserRoles(profile.role as TeamRole[]);
        }

        // load team members (simplified: join profiles + team_members)
        const { data: rows, error } = await supabase
          .from("team_members")
          .select(
            `
            user_id,
            role,
            profiles:profiles!team_members_user_id_fkey (
              email,
              first_name,
              last_name
            )
          `
          )
          .eq("team_id", teamId);

        if (!cancelled && !error && rows) {
          const mapped: MemberRow[] = rows.map((r: any) => ({
            user_id: r.user_id,
            roles: (r.role as TeamRole[]) ?? [],
            email: r.profiles?.email ?? null,
            first_name: r.profiles?.first_name ?? null,
            last_name: r.profiles?.last_name ?? null,
          }));
          setMembers(mapped);
        }
      } catch (err) {
        console.error("[ManageRoles] load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, teamId]);

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        Missing <code>?team=TEAM_ID</code> in URL.
      </p>
    );
  }

  const isAdmin = currentUserRoles.includes("Admin");
  const isManager = currentUserRoles.includes("Manager") || isAdmin;

  if (!loading && !isManager) {
    return (
      <p className="text-sm text-rose-500">
        You don&apos;t have permission to manage roles.
      </p>
    );
  }

  function toggleRole(userId: string, role: TeamRole) {
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === userId
          ? {
              ...m,
              roles: m.roles.includes(role)
                ? m.roles.filter((r) => r !== role)
                : [...m.roles, role],
            }
          : m
      )
    );
  }

  async function saveRoles(userId: string) {
    const member = members.find((m) => m.user_id === userId);
    if (!member) return;

    setSavingUserId(userId);
    try {
      let nextRoles = member.roles;

      // Managers can't give Admin; ensure it on client as well
      if (!isAdmin) {
        nextRoles = nextRoles.filter((r) => r !== "Admin");
      }

      const { error } = await supabase
        .from("team_members")
        .update({ role: nextRoles })
        .eq("team_id", teamId)
        .eq("user_id", userId);

      if (error) {
        console.error("[ManageRoles] save error", error);
      }
    } catch (err) {
      console.error("[ManageRoles] save error", err);
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Manage team roles
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign Prospector, Setter, Closer, Manager and Admin roles to your
          team. Managers can&apos;t grant Admin; only Admins can.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Team members
        </div>

        {loading ? (
          <p className="px-4 py-3 text-xs text-slate-500">
            Loading members…
          </p>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            {members.map((m) => {
              const name =
                `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
                m.email ||
                "User";

              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {name}
                    </p>
                    {m.email && (
                      <p className="truncate text-xs text-slate-500">
                        {m.email}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-1 justify-end gap-4">
                    {AVAILABLE_ROLES.map((role) => {
                      const disabled =
                        role === "Admin" && !isAdmin; // managers can't toggle admin

                      return (
                        <label
                          key={role}
                          className={`flex items-center gap-2 text-xs ${
                            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            disabled={disabled}
                            checked={m.roles.includes(role)}
                            onChange={() => !disabled && toggleRole(m.user_id, role)}
                          />
                          <span>{role}</span>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => saveRoles(m.user_id)}
                    disabled={savingUserId === m.user_id}
                    className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingUserId === m.user_id ? "Saving…" : "Save"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
