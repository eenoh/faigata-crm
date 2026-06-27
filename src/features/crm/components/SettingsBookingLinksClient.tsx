"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { bookingLinkUrl } from "@/lib/publicUrl";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import { localeFetch } from "@/lib/http/request";

function formatCreated(value: string, locale: string) {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }),
    time: d.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

type BookingLinkRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  primary_color: string;
  booking_type: "one_on_one" | "group" | "round_robin";
  created_at: string;
  deleted_at?: string | null;
};

type LoadingStage = "workspace" | "auth" | "links" | "idle";

function LoadingCard({
  stage,
  isDark,
  t,
}: {
  stage: LoadingStage;
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"SchedulePagesSettingsPage">>;
}) {
  const title =
    stage === "workspace"
      ? t("loading.workspace.title")
      : stage === "auth"
        ? t("loading.auth.title")
        : stage === "links"
          ? t("loading.links.title")
          : t("loading.idle.title");

  const subtitle =
    stage === "workspace"
      ? t("loading.workspace.subtitle")
      : stage === "auth"
        ? t("loading.auth.subtitle")
        : stage === "links"
          ? t("loading.links.subtitle")
          : t("loading.idle.subtitle");

  const shell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const strong = isDark ? "text-slate-200" : "text-slate-700";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const skel = isDark ? "bg-slate-900" : "bg-slate-100";

  return (
    <div className="max-w-4xl space-y-4">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${shell}`}>
        <p className={`text-sm font-medium ${strong}`}>{title}</p>
        <p className={`mt-1 text-xs ${muted}`}>{subtitle}</p>

        <div className="mt-4 space-y-3">
          <div className={`h-10 w-full animate-pulse rounded-xl ${skel}`} />
          <div className={`h-10 w-full animate-pulse rounded-xl ${skel}`} />
          <div className={`h-10 w-full animate-pulse rounded-xl ${skel}`} />
        </div>

        <div className="mt-4 flex gap-2">
          <div className={`h-9 w-32 animate-pulse rounded-lg ${skel}`} />
          <div className={`h-9 w-40 animate-pulse rounded-lg ${skel}`} />
        </div>
      </div>
    </div>
  );
}

function typeClasses(t: BookingLinkRow["booking_type"], isDark: boolean) {
  switch (t) {
    case "one_on_one":
      return isDark
        ? "bg-indigo-500/15 text-indigo-200 ring-indigo-400/30"
        : "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "group":
      return isDark
        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "round_robin":
      return isDark
        ? "bg-amber-500/15 text-amber-200 ring-amber-400/30"
        : "bg-amber-50 text-amber-800 ring-amber-200";
    default:
      return isDark
        ? "bg-slate-500/15 text-slate-200 ring-slate-400/30"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function formatTypeLabel(
  type: BookingLinkRow["booking_type"],
  t: ReturnType<typeof useTranslations<"SchedulePagesSettingsPage">>,
): string {
  switch (type) {
    case "one_on_one":
      return t("badges.oneOnOne");
    case "group":
      return t("badges.group");
    case "round_robin":
      return t("badges.roundRobin");
    default:
      return type;
  }
}

type TypeOptionProps = {
  label: string;
  description: string;
  iconSrc: string;
  onClick: () => void;
  isDark: boolean;
};

function TypeOption({
  label,
  description,
  iconSrc,
  onClick,
  isDark,
}: TypeOptionProps) {
  const shell = isDark
    ? "border-slate-800 bg-slate-950 hover:border-indigo-400/60"
    : "border-slate-200 bg-white hover:border-indigo-300";

  const iconWrap = isDark
    ? "border-indigo-400/30 bg-slate-900"
    : "border-indigo-100 bg-slate-50";

  const title = isDark ? "text-slate-100" : "text-slate-900";
  const text = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full flex-col items-center rounded-2xl border px-4 py-5 text-center shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer ${shell}`}
    >
      <div
        className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 overflow-hidden ${iconWrap}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt={label} className="h-14 w-14 object-contain" />
      </div>

      <div className={`text-sm font-semibold ${title}`}>{label}</div>
      <p className={`mt-2 text-xs leading-snug ${text}`}>{description}</p>
    </button>
  );
}

export default function SettingsBookingLinksClient() {
  const t = useTranslations("SchedulePagesSettingsPage");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [userId, setUserId] = useState<string | null>(null);

  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");
  const [authLoading, setAuthLoading] = useState(true);
  const [linksLoading, setLinksLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<BookingLinkRow[]>([]);
  const [showTypeDialog, setShowTypeDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!cancelled) {
          setAuthLoading(true);
          setLoadingStage("auth");
          setErrorMessage(null);
        }

        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          router.replace("/login");
          return;
        }

        if (!cancelled) setUserId(userRes.user.id);
      } catch (err) {
        console.error("[Schedule] Failed to load user", err);
        if (!cancelled) setErrorMessage(t("errors.verifySessionFailed"));
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, t]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) {
        if (!cancelled) setLoadingStage("workspace");
        return;
      }
      if (authLoading) {
        if (!cancelled) setLoadingStage("auth");
        return;
      }

      if (!teamId || !userId) {
        if (!cancelled) {
          setLinks([]);
          setLinksLoading(false);
          setLoadingStage("idle");
          setErrorMessage(
            !teamId ? t("errors.noTeam") : t("errors.noUserFound"),
          );
        }
        return;
      }

      try {
        if (!cancelled) {
          setLinksLoading(true);
          setLoadingStage("links");
          setErrorMessage(null);
        }

        const response = await localeFetch(
          `/api/crm/booking-link?teamId=${encodeURIComponent(teamId)}&ownerUserId=${encodeURIComponent(userId)}`,
          { cache: "no-store", locale },
        );

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          links?: BookingLinkRow[];
          error?: string;
        } | null;

        if (!response.ok) {
          console.error("[Schedule] Failed to load booking_links", payload);
          if (!cancelled) setErrorMessage(t("errors.loadFailed"));
          return;
        }

        if (!cancelled) {
          const rows: BookingLinkRow[] = ((payload?.links ?? []) as any[]).map(
            (row: any) => ({
              id: String(row.id),
              name: String(row.name ?? ""),
              slug: String(row.slug ?? ""),
              description: row.description ?? null,
              primary_color: String(row.primary_color ?? "#4f46e5"),
              booking_type: (row.booking_type ??
                "one_on_one") as BookingLinkRow["booking_type"],
              created_at: String(row.created_at ?? ""),
              deleted_at: row.deleted_at ?? null,
            }),
          );
          setLinks(rows);
        }
      } catch (err) {
        console.error("[Schedule] Unexpected error", err);
        if (!cancelled) setErrorMessage(t("errors.loadUnexpected"));
      } finally {
        if (!cancelled) {
          setLinksLoading(false);
          setLoadingStage("idle");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, userId, workspaceLoading, authLoading, locale, t]);

  const isLoading = workspaceLoading || authLoading || linksLoading;

  const headerSubtitle = useMemo(() => {
    if (workspaceLoading) return t("loading.workspace.title");
    if (authLoading) return t("loading.auth.title");
    return t("page.description");
  }, [workspaceLoading, authLoading, t]);

  if (isLoading) {
    return <LoadingCard stage={loadingStage} isDark={isDark} t={t} />;
  }

  const headerTitle = isDark ? "text-slate-100" : "text-slate-900";
  const headerSub = isDark ? "text-slate-400" : "text-slate-500";

  const errorBox = isDark
    ? "border-rose-900/40 bg-rose-950/40 text-rose-200"
    : "border-rose-100 bg-rose-50 text-rose-700";

  const emptyBox = isDark
    ? "border-slate-800 bg-slate-950 text-slate-400"
    : "border-slate-300 bg-slate-50 text-slate-500";

  const emptyTitle = isDark ? "text-slate-200" : "text-slate-700";

  const tableShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const theadBg = isDark ? "bg-slate-950" : "bg-slate-100";
  const headBorder = isDark ? "border-slate-800" : "border-slate-200";
  const rowBorder = isDark ? "border-slate-900" : "border-slate-100";
  const rowHover = isDark ? "hover:bg-slate-900/40" : "hover:bg-slate-50/70";
  const headText = isDark ? "text-slate-200" : "text-slate-700";
  const cellTextStrong = isDark ? "text-slate-100" : "text-slate-900";
  const cellMuted = isDark ? "text-slate-400" : "text-slate-500";
  const cellMuted2 = isDark ? "text-slate-500" : "text-slate-400";

  const linkCls = isDark
    ? "text-indigo-300 hover:text-indigo-200"
    : "text-indigo-600 hover:text-indigo-700";

  const trashCls = isDark
    ? "!text-rose-300 hover:!text-rose-200"
    : "!text-rose-500 hover:!text-rose-600";

  if (!teamId || !userId) {
    const shell = isDark
      ? "border-slate-800 bg-slate-950"
      : "border-slate-200 bg-white";
    const text = isDark ? "text-slate-400" : "text-slate-600";

    return (
      <div className="max-w-4xl space-y-4">
        <div className={`rounded-2xl border px-5 py-4 shadow-sm ${shell}`}>
          <h1 className={`text-2xl font-semibold ${headerTitle}`}>
            {t("page.title")}
          </h1>
          <p className={`mt-1 text-sm ${text}`}>
            {errorMessage || t("empty.unavailable")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full max-w-4xl flex-col gap-4 overflow-hidden">
      {showTypeDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div
            className={`w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl ${tableShell}`}
          >
            <div className="flex items-center justify-between bg-indigo-600 px-6 py-4 text-white">
              <div>
                <h2 className="text-lg font-semibold">{t("dialog.title")}</h2>
                <p className="mt-1 text-xs text-indigo-100">
                  {t("dialog.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTypeDialog(false)}
                className="rounded-full p-1 text-indigo-100 hover:bg-indigo-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
              >
                <span className="sr-only">{common("actions.close")}</span>✕
              </button>
            </div>

            <div
              className={`${isDark ? "bg-slate-900/40" : "bg-slate-50"} space-y-5 px-6 pb-5 pt-6`}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <TypeOption
                  isDark={isDark}
                  label={t("types.oneOnOne.label")}
                  description={t("types.oneOnOne.description")}
                  iconSrc="/icons/one-on-one.svg"
                  onClick={() => {
                    setShowTypeDialog(false);
                    router.push("/settings/booking-links/new?type=one_on_one");
                  }}
                />

                <TypeOption
                  isDark={isDark}
                  label={t("types.group.label")}
                  description={t("types.group.description")}
                  iconSrc="/icons/group.svg"
                  onClick={() => {
                    setShowTypeDialog(false);
                    router.push("/settings/booking-links/new?type=group");
                  }}
                />

                <TypeOption
                  isDark={isDark}
                  label={t("types.roundRobin.label")}
                  description={t("types.roundRobin.description")}
                  iconSrc="/icons/round_robin.svg"
                  onClick={() => {
                    setShowTypeDialog(false);
                    router.push("/settings/booking-links/new?type=round_robin");
                  }}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTypeDialog(false)}
                  className={`rounded-lg border px-4 py-2 text-xs font-semibold shadow-sm cursor-pointer ${
                    isDark
                      ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {common("actions.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--background)] pb-2 pt-1">
        <div>
          <h1 className={`text-2xl font-semibold ${headerTitle}`}>
            {t("page.title")}
          </h1>
          <p className={`text-sm ${headerSub}`}>{headerSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowTypeDialog(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
        >
          {t("actions.createSchedulePage")}
        </button>
      </div>

      {errorMessage ? (
        <div className={`rounded-xl border p-4 text-sm ${errorBox}`}>
          {errorMessage}
        </div>
      ) : links.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed p-6 text-sm ${emptyBox}`}
        >
          <p className={`font-semibold ${emptyTitle}`}>
            {t("empty.noPages.title")}
          </p>
          <p className="mt-1">
            {t.rich("empty.noPages.description", {
              strong: (chunks) => (
                <span className="font-semibold">{chunks}</span>
              ),
            })}
          </p>
        </div>
      ) : (
        <div className={`flex-1 rounded-xl border shadow-sm ${tableShell}`}>
          <div className="max-h-[800px] overflow-y-auto overflow-x-auto rounded-xl">
            <table className="w-full border-collapse text-sm">
              <thead className={`sticky top-0 z-10 ${theadBg}`}>
                <tr className="text-left">
                  <th
                    className={`border-b px-4 py-2 font-semibold ${headBorder} ${headText}`}
                  >
                    {t("table.schedulePage")}
                  </th>
                  <th
                    className={`border-b px-4 py-2 font-semibold ${headBorder} ${headText}`}
                  >
                    {t("table.publicLink")}
                  </th>
                  <th
                    className={`border-b px-4 py-2 font-semibold ${headBorder} ${headText}`}
                  >
                    {t("table.color")}
                  </th>
                  <th
                    className={`border-b px-4 py-2 text-right font-semibold ${headBorder} ${headText}`}
                  >
                    {t("table.actions")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {links.map((link) => {
                  const publicUrl = bookingLinkUrl(link.slug);
                  const created = formatCreated(link.created_at, locale);

                  return (
                    <tr
                      key={link.id}
                      className={`group border-b ${rowBorder} ${rowHover}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 h-9 w-9 shrink-0 rounded-xl border shadow-sm ${
                              isDark
                                ? "border-slate-800 bg-slate-950"
                                : "border-slate-200 bg-white"
                            }`}
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${link.primary_color}22, ${link.primary_color}AA)`,
                            }}
                            title={t("table.createdAtTitle", {
                              date: created.date,
                              time: created.time,
                            })}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div
                                className={`truncate font-semibold ${cellTextStrong}`}
                              >
                                {link.name}
                              </div>
                              <span
                                className={[
                                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                                  typeClasses(link.booking_type, isDark),
                                ].join(" ")}
                              >
                                {formatTypeLabel(link.booking_type, t)}
                              </span>
                            </div>

                            {link.description ? (
                              <div
                                className={`mt-0.5 line-clamp-1 text-xs ${cellMuted}`}
                              >
                                {link.description}
                              </div>
                            ) : (
                              <div className={`mt-0.5 text-xs ${cellMuted2}`}>
                                {t("table.noDescription")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`block truncate text-xs font-medium hover:underline ${linkCls}`}
                            title={publicUrl}
                          >
                            {publicUrl}
                          </a>
                          <div className={`mt-0.5 text-[11px] ${cellMuted}`}>
                            {t("table.publicBookingPage")}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-4 w-4 rounded-full border shadow-sm ${
                              isDark ? "border-slate-800" : "border-slate-200"
                            }`}
                            style={{ backgroundColor: link.primary_color }}
                          />
                          <span
                            className={`font-mono text-[11px] ${
                              isDark ? "text-slate-300" : "text-slate-600"
                            }`}
                          >
                            {link.primary_color}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Link
                            href={`/settings/booking-links/${link.id}/delete`}
                            className={`p-1 transition-colors ${trashCls}`}
                            title={t("actions.deleteSchedulePage")}
                          >
                            <TrashIcon className="h-5 w-5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
