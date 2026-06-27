"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAppLocale } from "@/context/LocaleContext";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

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

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

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

function toTeamRole(v: unknown): TeamRole | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return ROLE_CANONICAL[s] ?? ROLE_CANONICAL[s.toLowerCase()] ?? null;
}

function normalizeRoles(raw: unknown): TeamRole[] {
  if (Array.isArray(raw)) {
    return uniq(raw.map(toTeamRole).filter((r): r is TeamRole => Boolean(r)));
  }
  const single = toTeamRole(raw);
  return single ? [single] : [];
}

function getRoleLabel(
  common: ReturnType<typeof useTranslations<"Common">>,
  role: TeamRole,
) {
  switch (role) {
    case "Admin":
      return common("roles.admin");
    case "Manager":
      return common("roles.manager");
    case "Prospector":
      return common("roles.prospector");
    case "Setter":
      return common("roles.setter");
    case "Closer":
      return common("roles.closer");
    default:
      return common("roles.member");
  }
}

function normalizeMemberRow(raw: any): MemberRow {
  return {
    user_id: String(raw?.user_id ?? ""),
    email: raw?.email ?? null,
    first_name: raw?.first_name ?? null,
    last_name: raw?.last_name ?? null,
    roles: normalizeRoles(raw?.roles),
  };
}

function LoadingSkeleton({ isDark }: { isDark: boolean }) {
  const t = useTranslations("ManageTeamRolesPage");

  const shell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const head = isDark
    ? "border-slate-900 bg-slate-950"
    : "border-slate-200 bg-white";
  const sub = isDark ? "text-slate-400" : "text-slate-600";

  const skelStrong = isDark ? "bg-slate-800/80" : "bg-slate-200/80";
  const skelSoft = isDark ? "bg-slate-800/60" : "bg-slate-100";

  const divider = isDark
    ? "border-slate-900 divide-slate-900"
    : "border-slate-100 divide-slate-100";
  const sectionLabel = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${head}`}>
        <div className={`h-6 w-48 animate-pulse rounded ${skelStrong}`} />
        <div className={`mt-2 h-4 w-96 animate-pulse rounded ${skelSoft}`} />
        <div className={`mt-2 h-3 w-64 animate-pulse rounded ${skelSoft}`} />
        <p className={`sr-only ${sub}`}>{t("states.loading")}</p>
      </div>

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${shell}`}>
        <div
          className={`border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide ${divider} ${sectionLabel}`}
        >
          {t("table.sectionTitle")}
        </div>

        <div className={`divide-y ${divider}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 space-y-2">
                <div
                  className={`h-4 w-40 animate-pulse rounded ${skelStrong}`}
                />
                <div className={`h-3 w-56 animate-pulse rounded ${skelSoft}`} />
              </div>

              <div className="flex gap-3">
                {AVAILABLE_ROLES.map((r) => (
                  <div
                    key={r}
                    className={`h-4 w-4 animate-pulse rounded ${skelStrong}`}
                  />
                ))}
              </div>

              <div className={`h-8 w-8 animate-pulse rounded ${skelStrong}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function withAuthAndLocaleHeaders(
  locale: string,
  accessToken?: string | null,
  headers?: HeadersInit,
) {
  return withLocaleHeader(
    {
      ...headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    locale,
  );
}

export function ManageTeamRolesClient() {
  const t = useTranslations("ManageTeamRolesPage");
  const common = useTranslations("Common");
  const { teamId, loading: workspaceLoading } = useWorkspace();
  const router = useRouter();
  const { locale } = useAppLocale();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [callerRoles, setCallerRoles] = useState<TeamRole[]>([]);
  const [callerRolesLoaded, setCallerRolesLoaded] = useState(false);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  const isAdmin = useMemo(() => callerRoles.includes("Admin"), [callerRoles]);
  const isManager = useMemo(
    () => callerRoles.includes("Manager") || isAdmin,
    [callerRoles, isAdmin],
  );

  const pageLoading =
    workspaceLoading || loading || (Boolean(teamId) && !callerRolesLoaded);

  useLayoutEffect(() => {
    if (workspaceLoading) return;

    if (teamId) {
      setLoading(true);
      setCallerRolesLoaded(false);
      setLoadError(null);
      setMembers([]);
    } else {
      setLoading(false);
      setCallerRolesLoaded(false);
      setMembers([]);
    }
  }, [teamId, workspaceLoading, locale]);

  const fetchMembers = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
      if (!teamId) return;

      const silent = Boolean(opts?.silent);
      const signal = opts?.signal;

      if (silent) setRefreshing(true);
      else setLoading(true);

      setLoadError(null);

      try {
        if (signal?.aborted) return;

        const { data: sessionRes } = await supabase.auth.getSession();
        const token = sessionRes.session?.access_token;
        if (!token) {
          router.replace("/login");
          return;
        }

        const res = await fetch(
          `/api/crm/team-roles?teamId=${encodeURIComponent(teamId)}`,
          {
            headers: withAuthAndLocaleHeaders(locale, token),
            signal,
          },
        );

        if (signal?.aborted) return;

        const ct = res.headers.get("content-type") ?? "";
        const json = ct.includes("application/json")
          ? await res.json().catch(() => null)
          : null;

        setCallerRolesLoaded(true);

        if (!res.ok || !json?.ok) {
          if (!silent) setMembers([]);
          setCallerRoles(normalizeRoles(json?.callerRoles));
          setLoadError(
            json?.error ??
              t("errors.loadMembersHttp", { status: String(res.status) }),
          );
          return;
        }

        setCallerRoles(normalizeRoles(json.callerRoles));
        const normalizedMembers = Array.isArray(json.members)
          ? (json.members as any[]).map(normalizeMemberRow)
          : [];
        setMembers(normalizedMembers);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (!silent) setMembers([]);
        setCallerRolesLoaded(true);
        setLoadError(t("errors.loadMembers"));
      } finally {
        if (opts?.signal?.aborted) return;
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [locale, router, teamId, t],
  );

  useEffect(() => {
    if (workspaceLoading || !teamId) return;

    const controller = new AbortController();
    fetchMembers({ silent: false, signal: controller.signal });

    return () => controller.abort();
  }, [fetchMembers, teamId, workspaceLoading]);

  const cardShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const titleCls = isDark ? "text-slate-100" : "text-slate-900";
  const subCls = isDark ? "text-slate-400" : "text-slate-600";
  const toastCls = isDark ? "text-slate-300" : "text-slate-700";

  const tableShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const tableSection = isDark
    ? "border-slate-900 text-slate-400"
    : "border-slate-100 text-slate-500";

  const theadBg = isDark ? "bg-slate-950" : "bg-slate-50";
  const theadText = isDark ? "text-slate-300" : "text-slate-600";
  const rowHover = isDark ? "hover:bg-slate-900/40" : "hover:bg-slate-50";
  const divider = isDark ? "divide-slate-900" : "divide-slate-100";
  const memberName = isDark ? "text-slate-100" : "text-slate-900";
  const memberEmail = isDark ? "text-slate-400" : "text-slate-500";

  const checkboxBase = "h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500";
  const checkboxTheme = isDark
    ? "border-slate-700 bg-slate-950"
    : "border-slate-300 bg-white";

  const dangerBtn = isDark
    ? "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
    : "text-rose-600 hover:bg-rose-50 hover:text-rose-700";

  const errorText = isDark ? "text-rose-300" : "text-rose-500";
  const refreshingText = isDark ? "text-slate-400" : "text-slate-500";

  if (pageLoading) {
    return <LoadingSkeleton isDark={isDark} />;
  }

  if (!teamId) {
    return (
      <p className={`text-sm ${errorText}`}>{t("errors.noWorkspaceTeam")}</p>
    );
  }

  if (loadError) return <p className={`text-sm ${errorText}`}>{loadError}</p>;

  if (!callerRolesLoaded) {
    return <LoadingSkeleton isDark={isDark} />;
  }

  if (!isManager) {
    return <p className={`text-sm ${errorText}`}>{t("errors.noPermission")}</p>;
  }

  function setSaving(userId: string, v: boolean) {
    setSavingMap((prev) => ({ ...prev, [userId]: v }));
  }

  function updateLocalRoles(userId: string, nextRoles: TeamRole[]) {
    setMembers((prev) =>
      prev.map((m) => (m.user_id === userId ? { ...m, roles: nextRoles } : m)),
    );
  }

  async function applyRolesImmediately(
    userId: string,
    nextRolesRaw: TeamRole[],
  ) {
    const prev = members.find((m) => m.user_id === userId);
    if (!prev) return;

    const nextRoles = uniq(
      isAdmin ? nextRolesRaw : nextRolesRaw.filter((r) => r !== "Admin"),
    );
    if (nextRoles.length === 0) {
      setToast(t("errors.atLeastOneRole"));
      window.setTimeout(() => setToast(null), 1500);
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
        headers: withAuthAndLocaleHeaders(locale, token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ teamId, userId, roles: nextRoles }),
      });

      const ct = res.headers.get("content-type") ?? "";
      const json = ct.includes("application/json")
        ? await res.json().catch(() => null)
        : null;

      if (!res.ok || !json?.ok) {
        updateLocalRoles(userId, prevRoles);
        setToast(
          json?.error ?? t("errors.saveHttp", { status: String(res.status) }),
        );
        if (json?.details) {
          console.error("[team-roles][PATCH] details:", json.details);
        }
        window.setTimeout(() => setToast(null), 2500);
        return;
      }

      const savedRoles = normalizeRoles(json.roles);
      updateLocalRoles(userId, savedRoles);

      if (json?.callerRoles) setCallerRoles(normalizeRoles(json.callerRoles));

      setToast(t("states.saved"));
      window.setTimeout(() => setToast(null), 1200);
    } finally {
      setSaving(userId, false);
    }
  }

  function onToggle(userId: string, role: TeamRole, checked: boolean) {
    const member = members.find((m) => m.user_id === userId);
    if (!member) return;

    const next = checked
      ? uniq([...member.roles, role])
      : member.roles.filter((r) => r !== role);
    applyRolesImmediately(userId, next);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${cardShell}`}>
        <h1 className={`text-xl font-semibold ${titleCls}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${subCls}`}>{t("page.description")}</p>
        {toast && (
          <p className={`mt-2 text-xs font-medium ${toastCls}`}>{toast}</p>
        )}
      </div>

      <div
        className={`overflow-hidden rounded-2xl border shadow-sm ${tableShell}`}
      >
        <div
          className={`border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide ${tableSection}`}
        >
          {t("table.sectionTitle")}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={`${theadBg} text-xs ${theadText}`}>
              <tr>
                <th className="px-4 py-2 text-left font-semibold">
                  {t("table.columns.member")}
                </th>
                {AVAILABLE_ROLES.map((r) => (
                  <th key={r} className="px-3 py-2 text-center font-semibold">
                    {getRoleLabel(common, r)}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-semibold">
                  {t("table.columns.action")}
                </th>
              </tr>
            </thead>

            <tbody className={`divide-y ${divider}`}>
              {refreshing && (
                <tr>
                  <td
                    className={`px-4 py-3 text-xs ${refreshingText}`}
                    colSpan={AVAILABLE_ROLES.length + 2}
                  >
                    {t("states.refreshing")}
                  </td>
                </tr>
              )}

              {members.map((m) => {
                const name =
                  `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
                  m.email ||
                  t("table.userFallback");
                const saving = Boolean(savingMap[m.user_id]);

                return (
                  <tr key={m.user_id} className={rowHover}>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${memberName}`}>{name}</p>
                      {m.email && (
                        <p className={`text-xs ${memberEmail}`}>{m.email}</p>
                      )}
                    </td>

                    {AVAILABLE_ROLES.map((role) => {
                      const disabled = (role === "Admin" && !isAdmin) || saving;

                      return (
                        <td key={role} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            className={[
                              checkboxBase,
                              checkboxTheme,
                              disabled
                                ? "cursor-not-allowed opacity-60"
                                : "cursor-pointer",
                            ].join(" ")}
                            disabled={disabled}
                            checked={m.roles.includes(role)}
                            onChange={(e) =>
                              onToggle(m.user_id, role, e.target.checked)
                            }
                            title={
                              role === "Admin" && !isAdmin
                                ? t("table.adminOnlyTitle")
                                : saving
                                  ? t("table.savingTitle")
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
                          router.push(
                            `/settings/team/members/${m.user_id}/delete`,
                          )
                        }
                        title={t("table.removeTitle")}
                        className={`inline-flex cursor-pointer items-center justify-center rounded-lg p-2 transition-colors ${dangerBtn}`}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!refreshing && members.length === 0 && (
                <tr>
                  <td
                    className={`px-4 py-6 text-sm ${refreshingText}`}
                    colSpan={AVAILABLE_ROLES.length + 2}
                  >
                    {t("states.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
