"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  resolveClientRequestLocale,
  withLocaleHeader,
} from "@/features/i18n/client/requestLocale";

const AVAILABLE_ROLES = [
  "prospector",
  "setter",
  "closer",
  "manager",
  "admin",
] as const;

type TeamRole = (typeof AVAILABLE_ROLES)[number];

type ProfileLike = {
  role?: unknown;
  company_id?: string | null;
};

type TeamInviteResponse = {
  ok?: boolean;
  error?: string;
  acceptUrl?: string;
};

function normalizeRoles(raw: unknown): TeamRole[] {
  const allowed = new Set<string>(AVAILABLE_ROLES);

  const toRole = (v: unknown): TeamRole | null => {
    const s = String(v ?? "")
      .trim()
      .toLowerCase();
    if (!s) return null;

    return allowed.has(s) ? (s as TeamRole) : null;
  };

  const roles = Array.isArray(raw) ? raw : [raw];
  return Array.from(new Set(roles.map(toRole).filter(Boolean) as TeamRole[]));
}

export function InviteTeamMemberClient() {
  const t = useTranslations("InviteTeamMembersPage");
  const common = useTranslations("Common");
  const router = useRouter();
  const { loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const locale = resolveClientRequestLocale();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentRoles, setCurrentRoles] = useState<TeamRole[]>([]);

  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<TeamRole[]>(["setter"]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isAdmin = useMemo(() => currentRoles.includes("admin"), [currentRoles]);
  const isManager = useMemo(
    () => currentRoles.includes("manager") || isAdmin,
    [currentRoles, isAdmin],
  );

  function getRoleLabel(role: TeamRole) {
    switch (role) {
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

  useEffect(() => {
    if (workspaceLoading) return;

    let cancelled = false;

    async function loadProfile() {
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
          .select("*")
          .eq("id", userRes.user.id)
          .maybeSingle();

        if (cancelled) return;

        if (profErr) {
          console.error("[InviteTeamMember] profile load failed", profErr);
          setError(t("errors.loadPermissions"));
          setCurrentRoles([]);
          setCompanyId(null);
          return;
        }

        const profile = (data ?? null) as ProfileLike | null;

        setCurrentRoles(normalizeRoles(profile?.role));
        setCompanyId(profile?.company_id ? String(profile.company_id) : null);
      } catch (e) {
        console.error("[InviteTeamMember] unexpected load error", e);
        if (!cancelled) {
          setError(t("errors.loadPermissions"));
          setCurrentRoles([]);
          setCompanyId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router, workspaceLoading, t]);

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

  function toggleRole(role: TeamRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || roles.length === 0) {
      setError(t("errors.emailAndRoleRequired"));
      return;
    }

    const safeRoles = isAdmin ? roles : roles.filter((r) => r !== "admin");

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
        headers: withLocaleHeader(
          {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          locale,
        ),
        body: JSON.stringify({
          email: trimmedEmail,
          roles: safeRoles,
          companyId,
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as TeamInviteResponse | null;

      if (!res.ok || !json?.ok) {
        console.error("[team-invites] failed", json);
        setError(json?.error ?? t("errors.sendInviteFailed"));
        return;
      }

      setEmail("");
      setRoles(["setter"]);
      setSuccess(t("states.inviteSent"));
      console.log("Invite accept URL:", json.acceptUrl);
    } catch (err) {
      console.error("[team-invites] error", err);
      setError(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  if (workspaceLoading || loading) {
    return <p className={`text-sm ${infoText}`}>{t("states.loading")}</p>;
  }

  if (!isManager) {
    return (
      <p className={`text-sm ${noPermText}`}>{t("states.noPermission")}</p>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${shellCard}`}>
        <h1 className={`text-xl font-semibold ${title}`}>{t("page.title")}</h1>
        <p className={`mt-1 text-sm ${sub}`}>{t("page.description")}</p>
        {!isAdmin && (
          <p className={`mt-1 text-xs ${muted}`}>{t("page.managerNote")}</p>
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
            {common("fields.email")}
          </label>
          <input
            type="email"
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${inputShell}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("placeholders.email")}
          />
        </div>

        <div className="space-y-2">
          <p className={`text-xs font-medium uppercase tracking-wide ${label}`}>
            {common("fields.roles")}
          </p>
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_ROLES.map((role) => {
              const disabled = role === "admin" && !isAdmin;

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
                      disabled ? "cursor-not-allowed" : "cursor-pointer",
                    ].join(" ")}
                    disabled={disabled}
                    checked={roles.includes(role)}
                    onChange={() => !disabled && toggleRole(role)}
                  />
                  <span
                    className={
                      disabled ? "cursor-not-allowed" : "cursor-pointer"
                    }
                  >
                    {getRoleLabel(role)}
                  </span>
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
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {saving ? t("actions.sending") : t("actions.sendInvite")}
          </button>
        </div>
      </form>
    </div>
  );
}
