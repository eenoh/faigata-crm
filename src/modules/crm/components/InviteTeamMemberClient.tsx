// src/modules/crm/components/InviteTeamMemberClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";

const AVAILABLE_ROLES = ["Prospector", "Setter", "Closer", "Manager", "Admin"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

const ROLE_CANONICAL: Record<string, TeamRole> = {
  prospector: "Prospector",
  setter: "Setter",
  closer: "Closer",
  manager: "Manager",
  admin: "Admin",

  Prospector: "Prospector",
  Setter: "Setter",
  Closer: "Closer",
  Manager: "Manager",
  Admin: "Admin",
};

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function toTeamRole(v: unknown): TeamRole | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return ROLE_CANONICAL[s] ?? ROLE_CANONICAL[s.toLowerCase()] ?? null;
}

function normalizeRoles(raw: unknown): TeamRole[] {
  if (Array.isArray(raw)) return uniq(raw.map(toTeamRole).filter((r): r is TeamRole => Boolean(r)));
  const single = toTeamRole(raw);
  return single ? [single] : [];
}

export function InviteTeamMemberClient() {
  const router = useRouter();
  const { loading: workspaceLoading } = useWorkspace(); // teamId not needed on client for the invite itself

  const [currentRoles, setCurrentRoles] = useState<TeamRole[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<TeamRole[]>(["Setter"]);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (workspaceLoading) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes.user) {
          router.replace("/login");
          return;
        }

        const { data, error: profErr } = await supabase
          .from("profiles")
          .select("role, company_id")
          .eq("id", userRes.user.id)
          .single();

        if (cancelled) return;

        if (profErr) {
          console.error("[InviteTeamMember] Failed to load profile roles", profErr);
          setCurrentRoles([]);
          setCompanyId(null);
          setError("Failed to load permissions. Please refresh.");
          setLoading(false);
          return;
        }

        // ✅ normalize roles regardless of casing/type in DB
        setCurrentRoles(normalizeRoles(data?.role));

        if (data?.company_id) setCompanyId(String(data.company_id));
        setLoading(false);
      } catch (e) {
        console.error("[InviteTeamMember] Unexpected load error", e);
        if (!cancelled) {
          setCurrentRoles([]);
          setCompanyId(null);
          setError("Failed to load permissions. Please refresh.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, workspaceLoading]);

  if (workspaceLoading || loading) {
    return <p className="text-sm text-slate-500">Loading workspace and permissions…</p>;
  }

  const isAdmin = currentRoles.includes("Admin");
  const isManager = currentRoles.includes("Manager") || isAdmin;

  if (!isManager) {
    return (
      <p className="text-sm text-rose-500">
        You don&apos;t have permission to invite team members.
      </p>
    );
  }

  function toggleRole(role: TeamRole) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || roles.length === 0) {
      setError("Email and at least one role are required.");
      return;
    }

    // Managers can’t assign Admin
    const safeRoles = isAdmin ? roles : roles.filter((r) => r !== "Admin");

    setSaving(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;

      if (!token) {
        setError("You are not logged in. Please log in again.");
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/crm/team-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          roles: safeRoles,
          companyId,
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
        console.error("[team-invites] failed", json ?? text);
        setError(json?.error ?? "Failed to send invite.");
        return;
      }

      setEmail("");
      setRoles(["Setter"]);
      setSuccess("Invite sent!");
      console.log("Invite accept URL:", json.acceptUrl);
    } catch (err) {
      console.error("[team-invites] error", err);
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Invite team members</h1>
        <p className="mt-1 text-sm text-slate-600">Send an invitation and choose one or more roles.</p>
        {!isAdmin && (
          <p className="mt-1 text-xs text-slate-500">
            You are a Manager – you can’t grant Admin, only Admins can.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
          <input
            type="email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new.member@company.com"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Roles</p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_ROLES.map((role) => {
              const disabled = role === "Admin" && !isAdmin;
              return (
                <label
                  key={role}
                  className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 ${
                    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-indigo-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    disabled={disabled}
                    checked={roles.includes(role)}
                    onChange={() => !disabled && toggleRole(role)}
                  />
                  <span>{role}</span>
                </label>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {success && <p className="text-xs font-medium text-emerald-600">{success}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {saving ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
