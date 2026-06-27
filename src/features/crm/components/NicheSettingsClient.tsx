"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAppLocale } from "@/context/LocaleContext";
import {
  createCustomNiche,
  getTeamNicheSettings,
  saveTeamNicheSelections,
} from "@/features/crm/data/niches";
import {
  normalizeNicheName,
  toNormalizedNicheName,
  type NicheRecord,
} from "@/features/crm/server/niches.shared";
import { useTranslations } from "next-intl";

type LoadState = "loading" | "ready" | "error";

function humanizeNicheSettingsError(
  raw: unknown,
  t: ReturnType<typeof useTranslations>,
  fallback: string,
) {
  const code = String(raw ?? "").trim();

  if (!code) return fallback;
  if (code === "missing_team") return t("errors.noTeam");
  if (
    code === "missing_auth" ||
    code === "invalid_session" ||
    code === "no_session"
  ) {
    return "Your session expired. Please sign in again and reload this page.";
  }
  if (code === "forbidden") {
    return "You don't have permission to manage niches in this workspace.";
  }
  if (code === "invalid_niche_selection") {
    return "One or more selected niches are no longer available. Refresh the page and try again.";
  }
  if (code === "missing_name") return t("errors.enterName");
  if (/^[a-z0-9_]+$/i.test(code)) return fallback;

  return code;
}

export function NicheSettingsClient() {
  const t = useTranslations("NicheSettingsPage");
  const common = useTranslations("Common");
  const { locale } = useAppLocale();

  const searchParams = useSearchParams();
  const { teamId, teamName, loading: workspaceLoading } = useWorkspace();
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<NicheRecord[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newNicheName, setNewNicheName] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const borderSoft = isDark ? "border-slate-800" : "border-slate-100";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const bodyText = isDark ? "text-slate-300" : "text-slate-700";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const inputBase = isDark
    ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (workspaceLoading) return;

      if (!teamId) {
        if (!cancelled) {
          setLoadState("error");
          setError(t("errors.noTeam"));
          setCatalog([]);
          setEnabledIds([]);
          setSavedIds([]);
        }
        return;
      }

      try {
        if (!cancelled) {
          setLoadState("loading");
          setError(null);
          setFeedback(null);
          setCatalog([]);
          setEnabledIds([]);
          setSavedIds([]);
        }

        const data = await getTeamNicheSettings(locale);
        if (cancelled) return;

        setCatalog(data.catalog);
        setEnabledIds(data.enabledNicheIds);
        setSavedIds(data.enabledNicheIds);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[NicheSettings] load failed", err);
        setError(
          humanizeNicheSettingsError(
            err instanceof Error ? err.message : err,
            t,
            t("errors.loadFailed"),
          ),
        );
        setCatalog([]);
        setEnabledIds([]);
        setSavedIds([]);
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, workspaceLoading, t, locale]);

  const search = searchParams.get("q") ?? "";
  const query = search.trim().toLowerCase();

  const filteredCatalog = useMemo(() => {
    return catalog.filter((niche) => {
      if (!query) return true;
      const orgName = niche.organization_name?.toLowerCase() ?? "";
      return (
        niche.name.toLowerCase().includes(query) || orgName.includes(query)
      );
    });
  }, [catalog, query]);

  const enabledNiches = useMemo(() => {
    return enabledIds
      .map((id) => catalog.find((niche) => niche.id === id))
      .filter((row): row is NicheRecord => Boolean(row));
  }, [enabledIds, catalog]);

  const isDirty = useMemo(() => {
    if (enabledIds.length !== savedIds.length) return true;
    const a = [...enabledIds].sort().join("|");
    const b = [...savedIds].sort().join("|");
    return a !== b;
  }, [enabledIds, savedIds]);

  function toggleNiche(id: string) {
    setEnabledIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
    setFeedback(null);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    setError(null);

    try {
      await saveTeamNicheSelections(enabledIds, locale);
      setSavedIds(enabledIds);
      setFeedback(t("feedback.saved"));
    } catch (err) {
      console.error("[NicheSettings] save failed", err);
      setError(
        humanizeNicheSettingsError(
          err instanceof Error ? err.message : err,
          t,
          t("errors.saveFailed"),
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    const cleaned = normalizeNicheName(newNicheName);
    if (!cleaned) {
      setError(t("errors.enterName"));
      return;
    }

    setCreating(true);
    setFeedback(null);
    setError(null);

    try {
      const normalized = toNormalizedNicheName(cleaned);
      const existing = catalog.find(
        (niche) => niche.normalized_name.trim().toLowerCase() === normalized,
      );

      if (existing) {
        setEnabledIds((prev) =>
          prev.includes(existing.id) ? prev : [...prev, existing.id],
        );
        setFeedback(
          t("feedback.alreadyExistsSelected", { name: existing.name }),
        );
        setNewNicheName("");
        return;
      }

      const result = await createCustomNiche(cleaned, locale);
      const data = await getTeamNicheSettings(locale);

      setCatalog(data.catalog);
      setEnabledIds(data.enabledNicheIds);
      setSavedIds(data.enabledNicheIds);
      setNewNicheName("");

      if (result?.created === false) {
        setFeedback(t("feedback.alreadyExistedEnabled", { name: cleaned }));
      } else {
        setFeedback(t("feedback.createdAndAdded", { name: cleaned }));
      }
    } catch (err) {
      console.error("[NicheSettings] create failed", err);
      setError(
        humanizeNicheSettingsError(
          err instanceof Error ? err.message : err,
          t,
          t("errors.createFailed"),
        ),
      );
    } finally {
      setCreating(false);
    }
  }

  function SkeletonBlock({
    className = "",
    isDark,
  }: {
    className?: string;
    isDark: boolean;
  }) {
    return (
      <div
        className={[
          "animate-pulse rounded-lg",
          isDark ? "bg-slate-800/70" : "bg-slate-200",
          className,
        ].join(" ")}
        aria-hidden="true"
      />
    );
  }

  function LoadingSkeleton({ isDark }: { isDark: boolean }) {
    const card = isDark
      ? "border-slate-800 bg-slate-950"
      : "border-slate-200 bg-white";

    const borderSoft = isDark ? "border-slate-800" : "border-slate-100";

    const softFill = isDark ? "bg-slate-800/70" : "bg-slate-200";

    return (
      <div className="max-w-6xl space-y-6">
        <div className={`rounded-2xl border p-6 shadow-sm ${card}`}>
          <SkeletonBlock isDark={isDark} className="h-7 w-40" />
          <SkeletonBlock
            isDark={isDark}
            className="mt-3 h-4 w-[34rem] max-w-full"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SkeletonBlock isDark={isDark} className="h-7 w-44 rounded-full" />
            <SkeletonBlock isDark={isDark} className="h-7 w-56 rounded-full" />
          </div>
        </div>

        <div className={`rounded-2xl border p-5 shadow-sm ${card}`}>
          <SkeletonBlock isDark={isDark} className="h-5 w-32" />
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`rounded-xl border p-4 ${borderSoft}`}>
                <SkeletonBlock isDark={isDark} className="h-4 w-24" />
                <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-full" />
                <SkeletonBlock isDark={isDark} className="mt-2 h-3 w-5/6" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <section className={`rounded-2xl border p-5 shadow-sm ${card}`}>
              <div className="mb-4">
                <SkeletonBlock isDark={isDark} className="h-5 w-28" />
                <SkeletonBlock
                  isDark={isDark}
                  className="mt-2 h-4 w-[30rem] max-w-full"
                />
              </div>

              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${borderSoft}`}
                  >
                    <div
                      className={`mt-1 h-4 w-4 shrink-0 rounded ${softFill}`}
                    />
                    <div className="min-w-0 flex-1">
                      <SkeletonBlock
                        isDark={isDark}
                        className="h-4 w-40 max-w-full"
                      />
                      <SkeletonBlock
                        isDark={isDark}
                        className="mt-2 h-3 w-56 max-w-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <aside className={`rounded-2xl border p-5 shadow-sm ${card}`}>
              <SkeletonBlock isDark={isDark} className="h-5 w-40" />
              <SkeletonBlock
                isDark={isDark}
                className="mt-2 h-4 w-56 max-w-full"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonBlock
                    key={i}
                    isDark={isDark}
                    className="h-7 w-24 rounded-full"
                  />
                ))}
              </div>

              <SkeletonBlock
                isDark={isDark}
                className="mt-5 h-10 w-full rounded-xl"
              />
            </aside>

            <div className={`rounded-2xl border p-5 shadow-sm ${card}`}>
              <SkeletonBlock isDark={isDark} className="h-5 w-32" />
              <SkeletonBlock isDark={isDark} className="mt-2 h-4 w-full" />
              <SkeletonBlock isDark={isDark} className="mt-1 h-4 w-5/6" />

              <div className="mt-4">
                <SkeletonBlock isDark={isDark} className="mb-2 h-4 w-24" />
                <SkeletonBlock
                  isDark={isDark}
                  className="h-10 w-full rounded-xl"
                />
              </div>

              <SkeletonBlock
                isDark={isDark}
                className="mt-5 h-10 w-full rounded-xl"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (workspaceLoading || loadState === "loading") {
    return <LoadingSkeleton isDark={isDark} />;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className={`rounded-2xl border p-6 shadow-sm ${card}`}>
        <h1 className={`text-2xl font-semibold ${titleText}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-2 text-sm ${mutedText}`}>{t("page.description")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
              isDark
                ? "border-slate-800 text-slate-300"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {t("page.currentTeam", {
              teamName: teamName ?? t("page.unnamedTeam"),
            })}
          </div>

          {query ? (
            <div
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
                isDark
                  ? "border-slate-800 text-slate-300"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {t("page.searchSummary", {
                search,
                count: filteredCatalog.length,
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`rounded-2xl border p-5 shadow-sm ${card}`}>
        <h2 className={`text-base font-semibold ${titleText}`}>
          {t("howItWorks.title")}
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className={`rounded-xl border p-4 ${borderSoft}`}>
            <p className={`text-sm font-semibold ${bodyText}`}>
              {t("howItWorks.step1.title")}
            </p>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {t("howItWorks.step1.description")}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${borderSoft}`}>
            <p className={`text-sm font-semibold ${bodyText}`}>
              {t("howItWorks.step2.title")}
            </p>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {t("howItWorks.step2.description")}
            </p>
          </div>
          <div className={`rounded-xl border p-4 ${borderSoft}`}>
            <p className={`text-sm font-semibold ${bodyText}`}>
              {t("howItWorks.step3.title")}
            </p>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {t("howItWorks.step3.description")}
            </p>
          </div>
        </div>
      </div>

      {(error || feedback) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? isDark
                ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
                : "border-rose-100 bg-rose-50 text-rose-700"
              : isDark
                ? "border-emerald-900/40 bg-emerald-950/30 text-emerald-200"
                : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? feedback}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className={`rounded-2xl border p-5 shadow-sm ${card}`}>
            <div className="mb-4">
              <h2 className={`text-base font-semibold ${titleText}`}>
                {t("catalog.title")}
              </h2>
              <p className={`mt-1 text-sm ${mutedText}`}>
                {t("catalog.description")}
              </p>
            </div>

            {filteredCatalog.length === 0 ? (
              <div
                className={`rounded-xl border border-dashed px-4 py-5 text-sm ${isDark ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-500"}`}
              >
                {query ? t("catalog.noSearchResults") : t("catalog.empty")}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCatalog.map((niche) => {
                  const checked = enabledIds.includes(niche.id);
                  const helperText = niche.organization_name
                    ? t("catalog.createdBy", {
                        organizationName: niche.organization_name,
                      })
                    : t("catalog.sharedNiche");

                  return (
                    <label
                      key={niche.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                        checked
                          ? isDark
                            ? "border-indigo-500/40 bg-indigo-950/20"
                            : "border-indigo-200 bg-indigo-50/70"
                          : `${borderSoft} hover:border-indigo-200`
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleNiche(niche.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />

                      <div className="min-w-0 flex-1">
                        <span className={`text-sm font-medium ${bodyText}`}>
                          {niche.name}
                        </span>
                        <p className={`mt-1 text-xs ${mutedText}`}>
                          {helperText}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <aside className={`rounded-2xl border p-5 shadow-sm ${card}`}>
            <h2 className={`text-base font-semibold ${titleText}`}>
              {t("enabled.title")}
            </h2>
            <p className={`mt-1 text-sm ${mutedText}`}>
              {t("enabled.description")}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {enabledNiches.length === 0 ? (
                <p className={`text-sm ${mutedText}`}>{t("enabled.empty")}</p>
              ) : (
                enabledNiches.map((niche) => (
                  <span
                    key={niche.id}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      isDark
                        ? "bg-slate-800 text-slate-200"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {niche.name}
                  </span>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {saving
                ? common("actions.saving")
                : isDirty
                  ? t("actions.saveChanges")
                  : t("actions.everythingSaved")}
            </button>
          </aside>

          <form
            onSubmit={handleCreate}
            className={`rounded-2xl border p-5 shadow-sm ${card}`}
          >
            <h2 className={`text-base font-semibold ${titleText}`}>
              {t("create.title")}
            </h2>
            <p className={`mt-1 text-sm ${mutedText}`}>
              {t("create.description")}
            </p>

            <div className="mt-4">
              <label className={`mb-1 block text-sm font-medium ${bodyText}`}>
                {t("create.fieldLabel")}
              </label>
              <input
                value={newNicheName}
                onChange={(event) => setNewNicheName(event.target.value)}
                placeholder={t("create.placeholder")}
                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${inputBase}`}
                disabled={creating}
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-transparent bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 cursor-pointer"
            >
              {creating ? t("actions.creating") : t("actions.createNiche")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
