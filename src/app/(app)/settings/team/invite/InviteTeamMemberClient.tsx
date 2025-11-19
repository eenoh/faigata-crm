// src/app/(app)/settings/team/invite/InviteTeamMemberClient.tsx
"use client";

import { useState, useEffect } from "react";
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

export function InviteTeamMemberClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const teamId = searchParams.get("team");

  const [currentRoles, setCurrentRoles] = useState<TeamRole[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<TeamRole[]>(["Setter"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user || !teamId) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role, company_id")
        .eq("id", userRes.user.id)
        .single();

      if (!cancelled && !error && data) {
        if (data.role) {
          setCurrentRoles(data.role as TeamRole[]);
        }
        if (data.company_id) {
          setCompanyId(data.company_id as string);
        }
      }
    })();

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
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || roles.length === 0) {
      setError("Email and at least one role are required.");
      return;
    }

    let safeRoles = roles;
    // Managers can't assign Admin
    if (!isAdmin) {
      safeRoles = roles.filter((r) => r !== "Admin");
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/team-invites?teamId=${teamId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          roles: safeRoles,
          companyId, // <- pass companyId from inviter
        }),
      });

      if (!res.ok) {
        console.error("[invite] failed", await res.text());
        setError("Failed to send invite.");
      } else {
        const json = await res.json();
        console.log("Invite accept URL:", json.acceptUrl); // handy for debugging

        setEmail("");
        setRoles(["Setter"]);
        setSuccess("Invite sent!");
      }
    } catch (err) {
      console.error("[invite] error", err);
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Invite team members
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Send an invitation and choose one or more roles.
        </p>
        {!isAdmin && (
          <p className="mt-1 text-xs text-slate-500">
            You are a Manager – you can’t grant Admin, only Admins can.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Email
          </label>
          <input
            type="email"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new.member@company.com"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Roles
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_ROLES.map((role) => {
              const disabled = role === "Admin" && !isAdmin;
              return (
                <label
                  key={role}
                  className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 ${
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:border-indigo-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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

        {error && (
          <p className="text-xs font-medium text-rose-600">{error}</p>
        )}
        {success && (
          <p className="text-xs font-medium text-emerald-600">{success}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Sending…" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
