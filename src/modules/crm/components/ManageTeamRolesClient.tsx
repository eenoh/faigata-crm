"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TrashIcon } from "@heroicons/react/24/outline";

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

type MemberRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  roles: TeamRole[];
};

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

export function ManageTeamRolesClient() {
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const router = useRouter();

  const [currentUserRoles, setCurrentUserRoles] = useState<TeamRole[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  const isAdmin = useMemo(() => currentUserRoles.includes("Admin"), [currentUserRoles]);
  const isManager = useMemo(() => currentUserRoles.includes("Manager") || isAdmin, [currentUserRoles, isAdmin]);
  const pageLoading = workspaceLoading || loading;

  useEffect(() => {
    if (workspaceLoading || !teamId) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes.user) {
          router.replace("/login");
          return;
        }

        // Caller roles from profiles.role (array)
        const { data: myProfile, error: myProfErr } = await supabase
          .from("profiles")
          .select("role, team_id")
          .eq("id", userRes.user.id)
          .maybeSingle();

        if (!cancelled) {
          const roles = Array.isArray(myProfile?.role) ? (myProfile!.role as TeamRole[]) : [];
          setCurrentUserRoles(roles);

          // extra safety: if their profile team doesn't match workspace team
          if (myProfile?.team_id && myProfile.team_id !== teamId) {
            setLoadError("Workspace/team mismatch. Please re-select your team.");
          }
        }

        const { data: sessionRes } = await supabase.auth.getSession();
        const token = sessionRes.session?.access_token;
        if (!token) {
          router.replace("/login");
          return;
        }

        // teamId is taken server-side (cookie/workspace fallback), but send it too for safety
        const res = await fetch(`/api/crm/team-roles?teamId=${encodeURIComponent(teamId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }

        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setMembers([]);
          setLoadError(json?.error ?? `Failed to load members (HTTP ${res.status}).`);
          return;
        }

        setMembers((json.members as MemberRow[]) ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, teamId, workspaceLoading]);

  if (pageLoading) {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-slate-100" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Team members
        </div>

        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
              </div>

              <div className="flex gap-3">
                {AVAILABLE_ROLES.map((r) => (
                  <div
                    key={r}
                    className="h-4 w-4 animate-pulse rounded bg-slate-200"
                  />
                ))}
              </div>

              <div className="h-8 w-8 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

  if (!teamId) return <p className="text-sm text-rose-500">Could not determine your workspace team.</p>;

  if (!loading && !isManager) {
    return <p className="text-sm text-rose-500">You don&apos;t have permission to manage roles.</p>;
  }

  function setSaving(userId: string, v: boolean) {
    setSavingMap((prev) => ({ ...prev, [userId]: v }));
  }

  function updateLocalRoles(userId: string, nextRoles: TeamRole[]) {
    setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, roles: nextRoles } : m)));
  }

  async function applyRolesImmediately(userId: string, nextRolesRaw: TeamRole[]) {
    const prev = members.find((m) => m.user_id === userId);
    if (!prev) return;

    const nextRoles = uniq(isAdmin ? nextRolesRaw : nextRolesRaw.filter((r) => r !== "Admin"));

    if (nextRoles.length === 0) {
      setToast("At least one role is required.");
      setTimeout(() => setToast(null), 1500);
      return;
    }

    const prevRoles = prev.roles;
    updateLocalRoles(userId, nextRoles);

    setSaving(userId, true);
    setToast(null);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/crm/team-roles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId,
          userId,
          roles: nextRoles,
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        updateLocalRoles(userId, prevRoles);
        setToast(json?.error ?? `Failed to save (HTTP ${res.status}).`);
        setTimeout(() => setToast(null), 2000);
        return;
      }

      setToast("Saved ✅");
      setTimeout(() => setToast(null), 1200);
    } finally {
      setSaving(userId, false);
    }
  }

  function onToggle(userId: string, role: TeamRole, checked: boolean) {
    const member = members.find((m) => m.user_id === userId);
    if (!member) return;

    const next = checked ? uniq([...member.roles, role]) : member.roles.filter((r) => r !== role);
    applyRolesImmediately(userId, next);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Manage team roles</h1>
        <p className="mt-1 text-sm text-slate-600">
          Toggle roles to update immediately. Managers can&apos;t grant Admin; only Admins can.
        </p>
        {toast && <p className="mt-2 text-xs font-medium text-slate-700">{toast}</p>}
        {loadError && <p className="mt-2 text-xs font-medium text-rose-600">{loadError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Team members
        </div>

        {loading ? (
          <p className="px-4 py-3 text-xs text-slate-500">Loading members…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Member</th>
                  {AVAILABLE_ROLES.map((r) => (
                    <th key={r} className="px-3 py-2 text-center font-semibold">
                      {r}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const name =
                    `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
                    m.email ||
                    "User";

                  const saving = Boolean(savingMap[m.user_id]);

                  return (
                    <tr key={m.user_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{name}</p>
                        {m.email && <p className="text-xs text-slate-500">{m.email}</p>}
                      </td>

                      {AVAILABLE_ROLES.map((role) => {
                        const disabled = (role === "Admin" && !isAdmin) || saving;
                        return (
                          <td key={role} className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              className={`h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                              }`}
                              disabled={disabled}
                              checked={m.roles.includes(role)}
                              onChange={(e) => onToggle(m.user_id, role, e.target.checked)}
                              title={
                                role === "Admin" && !isAdmin
                                  ? "Only Admins can grant Admin."
                                  : saving
                                  ? "Saving…"
                                  : ""
                              }
                            />
                          </td>
                        );
                      })}

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/settings/team/members/${m.user_id}/delete`)
                          }
                          title="Remove team member"
                          className="inline-flex items-center justify-center rounded-lg p-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {members.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-500" colSpan={AVAILABLE_ROLES.length + 2}>
                      No members found for this team.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
