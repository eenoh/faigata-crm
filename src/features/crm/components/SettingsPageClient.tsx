"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "./LogoutButton";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useTranslations } from "next-intl";

type Profile = {
  role: unknown;
};

type ProfileRowLike = {
  role?: unknown;
};

type LoadingStage = "workspace" | "auth" | "profile" | "idle";

function LoadingCard({
  stage,
  isDark,
  t,
}: {
  stage: LoadingStage;
  isDark: boolean;
  t: ReturnType<typeof useTranslations<"SettingsPage">>;
}) {
  const title =
    stage === "workspace"
      ? t("loading.workspace.title")
      : stage === "auth"
        ? t("loading.auth.title")
        : stage === "profile"
          ? t("loading.profile.title")
          : t("loading.idle.title");

  const subtitle =
    stage === "workspace"
      ? t("loading.workspace.subtitle")
      : stage === "auth"
        ? t("loading.auth.subtitle")
        : stage === "profile"
          ? t("loading.profile.subtitle")
          : t("loading.idle.subtitle");

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const titleCls = isDark ? "text-slate-200" : "text-slate-700";
  const subCls = isDark ? "text-slate-400" : "text-slate-500";
  const skel = isDark ? "bg-slate-800/70" : "bg-slate-100";

  return (
    <div className="max-w-3xl space-y-4">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <p className={`text-sm font-medium ${titleCls}`}>{title}</p>
        <p className={`mt-1 text-xs ${subCls}`}>{subtitle}</p>

        <div className="mt-4 space-y-3">
          <div className={`h-16 w-full animate-pulse rounded-2xl ${skel}`} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`h-24 rounded-2xl animate-pulse ${skel}`} />
            <div className={`h-24 rounded-2xl animate-pulse ${skel}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeRoles(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];

  if (Array.isArray(raw)) {
    return raw.map((r) => String(r).trim()).filter(Boolean);
  }

  const s = String(raw).trim();
  if (!s) return [];

  if (s.includes(",")) {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [s];
}

export default function SettingsPageClient() {
  const t = useTranslations("SettingsPage");

  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");

  const roles = useMemo(() => {
    const raw = profile?.role ?? null;
    return normalizeRoles(raw).map((r) => r.toLowerCase());
  }, [profile?.role]);

  const isManagerOrAdmin = useMemo(() => {
    return roles.includes("manager") || roles.includes("admin");
  }, [roles]);

  const isLoading = workspaceLoading || authLoading || profileLoading;

  const shellText = isDark ? "text-slate-200" : "text-slate-900";
  const subText = isDark ? "text-slate-400" : "text-slate-600";

  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const cardHover = isDark
    ? "hover:border-indigo-500/40 hover:bg-slate-900/30 hover:shadow-md"
    : "hover:border-indigo-200 hover:shadow-md";

  const linkTitle = isDark ? "text-slate-100" : "text-slate-900";
  const linkSub = isDark ? "text-slate-400" : "text-slate-500";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!cancelled) {
          setAuthLoading(true);
          setProfileLoading(true);
          setLoadingStage("auth");
        }

        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          router.replace("/login");
          return;
        }

        const uid = userRes.user.id;
        if (cancelled) return;

        setUserId(uid);
        setAuthLoading(false);

        if (!cancelled) setLoadingStage("profile");

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .maybeSingle();

        if (cancelled) return;

        if (profileError) {
          console.error("[Settings] Failed to load profile", profileError);
          setProfile({ role: null });
        } else {
          const profileRow = (data ?? null) as ProfileRowLike | null;
          setProfile({ role: profileRow?.role ?? null });
        }
      } catch (err) {
        console.error("[Settings] Unexpected error", err);
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
          setProfileLoading(false);
          setLoadingStage("idle");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (workspaceLoading) setLoadingStage("workspace");
    else if (authLoading) setLoadingStage("auth");
    else if (profileLoading) setLoadingStage("profile");
    else setLoadingStage("idle");
  }, [workspaceLoading, authLoading, profileLoading]);

  if (isLoading) {
    return <LoadingCard stage={loadingStage} isDark={isDark} t={t} />;
  }

  if (!profile || !teamId || !userId) {
    return (
      <div className="max-w-3xl space-y-6">
        <div
          className={`rounded-2xl border px-5 py-4 text-sm shadow-sm ${
            isDark
              ? "border-rose-900/40 bg-rose-950/30 text-rose-200"
              : "border-rose-100 bg-rose-50 text-rose-700"
          }`}
        >
          <p className="font-medium">{t("unavailable.title")}</p>
          <p className="mt-1">{t("unavailable.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className={`rounded-2xl border px-5 py-4 shadow-sm ${card}`}>
        <h1 className={`text-2xl font-semibold ${shellText}`}>
          {t("page.title")}
        </h1>
        <p className={`mt-1 text-sm ${subText}`}>{t("page.description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isManagerOrAdmin && (
          <Link
            href="/settings/lead-fields"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.leadFields.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.leadFields.description")}
            </p>
          </Link>
        )}

        {isManagerOrAdmin && (
          <Link
            href="/settings/lead-scoring"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.leadScoring.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.leadScoring.description")}
            </p>
          </Link>
        )}

        {isManagerOrAdmin && (
          <Link
            href="/settings/niches"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.niches.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.niches.description")}
            </p>
          </Link>
        )}

        {isManagerOrAdmin && (
          <Link
            href="/settings/pipeline-stages"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.pipelineStages.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.pipelineStages.description")}
            </p>
          </Link>
        )}

        {isManagerOrAdmin && (
          <Link
            href="/settings/conversion-metrics"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.conversionMetrics.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.conversionMetrics.description")}
            </p>
          </Link>
        )}

        <Link
          href="/settings/booking-links"
          className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
        >
          <h2 className={`text-sm font-semibold ${linkTitle}`}>
            {t("cards.schedulePages.title")}
          </h2>
          <p className={`mt-1 text-xs ${linkSub}`}>
            {t("cards.schedulePages.description")}
          </p>
        </Link>

        {isManagerOrAdmin && (
          <Link
            href="/settings/team/invite"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.inviteTeamMembers.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.inviteTeamMembers.description")}
            </p>
          </Link>
        )}

        {isManagerOrAdmin && (
          <Link
            href="/settings/team/members"
            className={`block rounded-2xl border p-4 shadow-sm transition ${card} ${cardHover}`}
          >
            <h2 className={`text-sm font-semibold ${linkTitle}`}>
              {t("cards.manageTeamRoles.title")}
            </h2>
            <p className={`mt-1 text-xs ${linkSub}`}>
              {t("cards.manageTeamRoles.description")}
            </p>
          </Link>
        )}
      </div>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </div>
  );
}
