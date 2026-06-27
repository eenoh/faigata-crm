"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useTheme } from "@/components/providers/ThemeProvider";
import { resolveClientRequestLocale } from "@/features/i18n/client/requestLocale";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getErrorKey(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "delete_failed";
}

function getSafeMemberName(firstName: unknown, lastName: unknown) {
  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";
  return `${first} ${last}`.trim();
}

function getSafeUserId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "—";
}

export function DeleteTeamMemberClient() {
  const t = useTranslations("DeleteTeamMemberPage");
  const common = useTranslations("Common");
  const router = useRouter();
  const { loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const params = useParams<{ userId?: string }>();
  const userId = String(params?.userId ?? "").trim();

  const [memberName, setMemberName] = useState("");
  const [loadingName, setLoadingName] = useState(true);

  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locale = resolveClientRequestLocale();

  const pageText = isDark ? "text-slate-200" : "text-slate-700";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const card = cn(
    "rounded-2xl border p-6 shadow-sm",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );

  const dangerCard = cn(
    "rounded-2xl border p-6 shadow-sm",
    isDark ? "border-rose-900/40 bg-slate-950" : "border-rose-200 bg-white",
  );

  const dangerIconWrap = cn(
    "flex h-10 w-10 items-center justify-center rounded-full",
    isDark ? "bg-rose-950/40 text-rose-300" : "bg-rose-100 text-rose-600",
  );

  const previewBox = cn(
    "mt-4 rounded-xl border px-4 py-3",
    isDark
      ? "border-slate-800 bg-slate-900/40"
      : "border-slate-200 bg-slate-50",
  );

  const previewCard = cn(
    "rounded-xl border px-3 py-2",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-100 bg-white",
  );

  const btn = cn(
    "rounded-lg border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-60 cursor-pointer",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  );

  const dangerBtn = cn(
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 cursor-pointer",
    isDark ? "bg-rose-600 hover:bg-rose-500" : "bg-rose-600 hover:bg-rose-700",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMemberName() {
      setLoadingName(true);

      if (!userId) {
        setLoadingName(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled || error || !data) return;

        setMemberName(getSafeMemberName(data.first_name, data.last_name));
      } catch {
        // display-only lookup; ignore failures and fall back in UI
      } finally {
        if (!cancelled) setLoadingName(false);
      }
    }

    void loadMemberName();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function confirmDelete() {
    if (!userId) {
      setError("missing_user_id");
      return;
    }

    if (removing) return;

    setRemoving(true);
    setError(null);

    const controller = new AbortController();

    try {
      const { data: sessionRes, error: sessionErr } =
        await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;

      if (sessionErr || !token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/crm/team-members/delete", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-faigata-locale": locale,
        },
        body: JSON.stringify({ userId }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json?.ok) {
        setError(getErrorKey(json?.error ?? `failed_${res.status}`));
        return;
      }

      router.replace("/settings/team/members");
      router.refresh();
    } catch (e: unknown) {
      setError(getErrorKey(e instanceof Error ? e.message : e));
    } finally {
      controller.abort();
      setRemoving(false);
    }
  }

  const resolvedError =
    error === "missing_user_id"
      ? t("errors.missingUserId")
      : error === "unauthorized"
        ? t("errors.unauthorized")
        : error === "delete_failed"
          ? t("errors.deleteFailed")
          : error;

  const displayName = useMemo(() => {
    if (loadingName) return "…";
    return memberName || t("fallback.thisUser");
  }, [loadingName, memberName, t]);

  const displayUserId = useMemo(() => getSafeUserId(userId), [userId]);

  if (workspaceLoading) {
    return (
      <div className="mx-auto max-w-lg pt-16">
        <div className={card}>
          <p className={cn("text-sm", mutedText)}>
            {t("states.loadingWorkspace")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pt-16">
      <div className={dangerCard}>
        <div className="flex items-center gap-3">
          <div className={dangerIconWrap}>
            <TrashIcon className="h-5 w-5" />
          </div>
          <h1
            className={cn(
              "text-lg font-semibold",
              isDark ? "text-slate-100" : "text-slate-900",
            )}
          >
            {t("page.title")}
          </h1>
        </div>

        <p className={cn("mt-4 text-sm", pageText)}>
          {t.rich("page.description", {
            name: displayName,
            strong: (chunks) => (
              <span
                className={cn(
                  "font-semibold",
                  isDark ? "text-slate-50" : "text-slate-900",
                )}
              >
                {chunks}
              </span>
            ),
          })}
        </p>

        <div className={previewBox}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={previewCard}>
              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  mutedText,
                )}
              >
                {t("preview.name")}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-sm break-words font-medium",
                  isDark ? "text-slate-100" : "text-slate-900",
                )}
              >
                {displayName}
              </p>
            </div>

            <div className={previewCard}>
              <p
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  mutedText,
                )}
              >
                {t("preview.userId")}
              </p>
              <p className={cn("mt-0.5 text-sm break-all", pageText)}>
                {displayUserId}
              </p>
            </div>
          </div>
        </div>

        <p className={cn("mt-3 text-xs", mutedText)}>{t("page.warning")}</p>

        {error && (
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              isDark ? "text-rose-300" : "text-rose-600",
            )}
          >
            {resolvedError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={removing}
            className={btn}
          >
            {common("actions.cancel")}
          </button>

          <button
            type="button"
            onClick={confirmDelete}
            disabled={removing}
            className={dangerBtn}
          >
            <TrashIcon className="h-4 w-4" />
            {removing ? t("actions.removing") : t("actions.removeUser")}
          </button>
        </div>
      </div>
    </div>
  );
}
