"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import { localeFetch } from "@/lib/http/request";

type BookingLinkRow = {
  id: string;
  name: string;
  slug: string;
  deleted_at?: string | null;
};

function getErrorKey(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "load_failed";
}

function getSafeDisplayName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getSafeDisplaySlug(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

export default function DeleteSchedulePageClient() {
  const t = useTranslations("DeleteSchedulePage");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const id = String(params?.id ?? "").trim();

  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [row, setRow] = useState<BookingLinkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      router.replace("/login");
      return null;
    }

    return data.user;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) return;

      try {
        setLoading(true);
        setErr(null);

        const user = await requireUser();
        if (!user || cancelled) return;

        if (!teamId || !id) {
          throw new Error("missing_team_or_id");
        }

        const response = await localeFetch(
          `/api/crm/booking-link?id=${encodeURIComponent(id)}&teamId=${encodeURIComponent(teamId)}&ownerUserId=${encodeURIComponent(user.id)}`,
          {
            cache: "no-store",
            locale,
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          link?: BookingLinkRow | null;
        } | null;

        if (!response.ok || !payload?.link) {
          throw new Error(payload?.error ?? "not_found");
        }

        if (cancelled) return;

        const typedRow: BookingLinkRow = {
          id: String(payload.link.id ?? ""),
          name: String(payload.link.name ?? ""),
          slug: String(payload.link.slug ?? ""),
          deleted_at:
            typeof payload.link.deleted_at === "string"
              ? payload.link.deleted_at
              : null,
        };

        setRow(typedRow);
      } catch (e: unknown) {
        if (!cancelled) {
          setRow(null);
          setErr(getErrorKey(e instanceof Error ? e.message : e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, locale, teamId, workspaceLoading, router]);

  async function onDelete() {
    if (!teamId || !id || deleting || alreadyDeleted) return;

    setDeleting(true);
    setErr(null);

    try {
      const user = await requireUser();
      if (!user) return;

      const response = await localeFetch("/api/crm/booking-link", {
        method: "DELETE",
        locale,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          team_id: teamId,
          owner_user_id: user.id,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "delete_failed");
      }

      router.push("/settings/booking-links?deleted=1");
      router.refresh();
    } catch (e: unknown) {
      setErr(
        getErrorKey(e instanceof Error ? e.message : e) || "delete_failed",
      );
    } finally {
      setDeleting(false);
    }
  }

  const alreadyDeleted = Boolean(row?.deleted_at);

  const pageTitle = isDark ? "text-slate-100" : "text-slate-900";
  const pageSub = isDark ? "text-slate-400" : "text-slate-600";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const btn = isDark
    ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  const warnBox = isDark
    ? "border-rose-900/40 bg-rose-950/40 text-rose-200"
    : "border-rose-200 bg-rose-50 text-rose-800";

  const infoBox = isDark
    ? "border-slate-800 bg-slate-900/40 text-slate-200"
    : "border-slate-200 bg-slate-50 text-slate-700";

  const previewBox = isDark
    ? "border-slate-800 bg-slate-900/30"
    : "border-slate-200 bg-slate-50";

  const previewCard = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const errText = isDark ? "text-rose-300" : "text-rose-700";
  const bodyText = isDark ? "text-slate-200" : "text-slate-700";
  const strongText = isDark ? "text-slate-100" : "text-slate-900";
  const metaText = isDark ? "text-slate-400" : "text-slate-500";

  const resolvedError =
    err === "not_found"
      ? t("errors.notFound")
      : err === "missing_team_or_id"
        ? t("errors.missingTeamOrId")
        : err === "load_failed"
          ? t("errors.loadFailed")
          : err === "delete_failed"
            ? t("errors.deleteFailed")
            : err;

  const displayName = useMemo(
    () => getSafeDisplayName(row?.name, t("fallback.thisSchedulePage")),
    [row?.name, t],
  );

  const displaySlug = useMemo(() => getSafeDisplaySlug(row?.slug), [row?.slug]);

  return (
    <div className="max-w-2xl space-y-4">
      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        <h1 className={`text-xl font-semibold ${pageTitle}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${pageSub}`}>{t("page.description")}</p>
      </div>

      <div className={`rounded-2xl border px-6 py-5 shadow-sm ${card}`}>
        {workspaceLoading || loading ? (
          <div className={`text-sm ${metaText}`}>{t("states.loading")}</div>
        ) : err ? (
          <div className={`text-sm ${errText}`}>{resolvedError}</div>
        ) : (
          <>
            <div className={`text-sm ${bodyText}`}>
              {t.rich("confirm.message", {
                name: displayName,
                strong: (chunks) => (
                  <span className={`font-semibold ${strongText}`}>
                    {chunks}
                  </span>
                ),
              })}
            </div>

            <div className={`mt-4 rounded-xl border px-4 py-3 ${previewBox}`}>
              <div className="mb-2">
                <h2
                  className={`text-[11px] font-semibold uppercase tracking-wide ${metaText}`}
                >
                  {t("preview.title")}
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`rounded-xl border px-3 py-2 ${previewCard}`}>
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${metaText}`}
                  >
                    {t("preview.name")}
                  </p>
                  <p className={`mt-0.5 text-sm break-words ${strongText}`}>
                    {displayName}
                  </p>
                </div>

                <div className={`rounded-xl border px-3 py-2 ${previewCard}`}>
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${metaText}`}
                  >
                    {t("preview.slug")}
                  </p>
                  <p className={`mt-0.5 text-sm break-words ${strongText}`}>
                    /b/{displaySlug}
                  </p>
                </div>
              </div>
            </div>

            {alreadyDeleted ? (
              <div
                className={`mt-3 rounded-xl border px-4 py-3 text-xs ${infoBox}`}
              >
                {t("states.alreadyDeleted")}
              </div>
            ) : (
              <div
                className={`mt-3 rounded-xl border px-4 py-3 text-xs ${warnBox}`}
              >
                {t.rich("confirm.warning", {
                  strong: (chunks) => (
                    <span className="font-semibold">{chunks}</span>
                  ),
                })}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push("/settings/booking-links")}
                disabled={deleting}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 cursor-pointer ${btn}`}
              >
                {common("actions.cancel")}
              </button>

              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || alreadyDeleted}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {deleting ? t("actions.deleting") : t("actions.delete")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
