// src/modules/crm/components/InviteTeamMemberClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "next-themes";

const AVAILABLE_ROLES = [
  "Prospector",
  "Setter",
  "Closer",
  "Manager",
  "Admin",
] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

function normalizeRoles(raw: unknown): TeamRole[] {
  const allowed = new Set<string>(AVAILABLE_ROLES);

  const toRole = (v: unknown): TeamRole | null => {
    const s = String(v ?? "").trim();
    if (!s) return null;

    const canonical = s[0]?.toUpperCase() + s.slice(1).toLowerCase();
    return allowed.has(canonical) ? (canonical as TeamRole) : null;
  };

  const roles = Array.isArray(raw) ? raw : [raw];
  return Array.from(new Set(roles.map(toRole).filter(Boolean) as TeamRole[]));
}

export function InviteTeamMemberClient() {
  const router = useRouter();
  const { loading: workspaceLoading } = useWorkspace();

  // ✅ replicate LeadsClient theme handling
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentRoles, setCurrentRoles] = useState<TeamRole[]>([]);

  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<TeamRole[]>(["Setter"]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = useMemo(() => currentRoles.includes("Admin"), [currentRoles]);
  const isManager = useMemo(
    () => currentRoles.includes("Manager") || isAdmin,
    [currentRoles, isAdmin],
  );

  useEffect(() => {
    if (workspaceLoading) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

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
          console.error("[InviteTeamMember] profile load failed", profErr);
          setError("Failed to load permissions. Please refresh.");
          setCurrentRoles([]);
          setCompanyId(null);
          return;
        }

        setCurrentRoles(normalizeRoles(data?.role));
        setCompanyId(data?.company_id ? String(data.company_id) : null);
      } catch (e) {
        console.error("[InviteTeamMember] Unexpected load error", e);
        if (!cancelled) setError("Failed to load permissions. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, workspaceLoading]);

  // ---------- theme-driven styles (same approach as LeadsClient) ----------
  const shellCard = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const title = isDark ? "text-slate-100" : "text-slate-900";
  const sub = isDark ? "text-slate-400" : "text-slate-600";
  const muted = isDark ? "text-slate-500" : "text-slate-500";

  const inputShell = isDark
    ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400";

  const label = isDark ? "text-slate-400" : "text-slate-500";

  const rolePillBase = isDark
    ? "border-slate-800 bg-slate-900/40 text-slate-200"
    : "border-slate-200 bg-slate-50 text-slate-700";

  const rolePillHover = isDark
    ? "hover:border-indigo-400/60"
    : "hover:border-indigo-300";

  const errorText = isDark ? "text-rose-300" : "text-rose-600";
  const successText = isDark ? "text-emerald-300" : "text-emerald-600";

  const infoText = isDark ? "text-slate-400" : "text-slate-500";
  const noPermText = isDark ? "text-rose-300" : "text-rose-500";

  if (workspaceLoading || loading) {
    return (
      <p className={`text-sm ${infoText}`}>
        Loading workspace and permissions…
      </p>
    );
  }

  if (!isManager) {
    return (
      <p className={`text-sm ${noPermText}`}>
        You don&apos;t have permission to invite team members.
      </p>
    );
  }

  function toggleRole(role: TeamRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || roles.length === 0) {
      setError("Email and at least one role are required.");
      return;
    }

    const safeRoles = isAdmin ? roles : roles.filter((r) => r !== "Admin");

    setSaving(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) {
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
          email: trimmedEmail,
          roles: safeRoles,
          companyId,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("[team-invites] failed", json);
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
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${shellCard}`}>
        <h1 className={`text-xl font-semibold ${title}`}>
          Invite Team Members
        </h1>
        <p className={`mt-1 text-sm ${sub}`}>
          Send an invitation and choose one or more roles.
        </p>
        {!isAdmin && (
          <p className={`mt-1 text-xs ${muted}`}>
            You are a Manager – you can’t grant Admin, only Admins can.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className={`space-y-4 rounded-2xl border p-4 shadow-sm ${shellCard}`}
      >
        <div className="space-y-1">
          <label
            className={`text-xs font-medium uppercase tracking-wide ${label}`}
          >
            Email
          </label>
          <input
            type="email"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${inputShell}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new.member@company.com"
          />
        </div>

        <div className="space-y-2">
          <p className={`text-xs font-medium uppercase tracking-wide ${label}`}>
            Roles
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_ROLES.map((role) => {
              const disabled = role === "Admin" && !isAdmin;

              return (
                <label
                  key={role}
                  className={[
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    rolePillBase,
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : `cursor-pointer ${rolePillHover}`,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className={[
                      "h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500",
                      isDark ? "bg-slate-950" : "bg-white",
                    ].join(" ")}
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

        {error && <p className={`text-xs font-medium ${errorText}`}>{error}</p>}
        {success && (
          <p className={`text-xs font-medium ${successText}`}>{success}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
