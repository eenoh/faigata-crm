// src/modules/crm/components/SettingsPageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "./LogoutButton";
import { useWorkspace } from "@/context/WorkspaceContext";

type Profile = {
  role: unknown; // tolerant: string | string[] | null
};

type LoadingStage = "workspace" | "auth" | "profile" | "idle";

function LoadingCard({ stage }: { stage: LoadingStage }) {
  const title =
    stage === "workspace"
      ? "Loading workspace…"
      : stage === "auth"
        ? "Checking your session…"
        : stage === "profile"
          ? "Loading settings…"
          : "Loading…";

  const subtitle =
    stage === "workspace"
      ? "Finding your team context."
      : stage === "auth"
        ? "Verifying your account."
        : stage === "profile"
          ? "Fetching your profile and permissions."
          : "Please wait.";

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>

        <div className="mt-4 space-y-3">
          <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
            <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeRoles(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw))
    return raw.map((r) => String(r).trim()).filter(Boolean);

  const s = String(raw).trim();
  if (!s) return [];
  if (s.includes(","))
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  return [s];
}

export default function SettingsPageClient() {
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("workspace");

  // ✅ ALWAYS call hooks before any return
  const roles = useMemo(() => {
    const raw = profile?.role ?? null;
    return normalizeRoles(raw).map((r) => r.toLowerCase());
  }, [profile?.role]);

  const isManagerOrAdmin = useMemo(() => {
    return roles.includes("manager") || roles.includes("admin");
  }, [roles]);

  const isLoading = workspaceLoading || authLoading || profileLoading;

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
          .select("role")
          .eq("id", uid)
          .single();

        if (cancelled) return;

        if (profileError) {
          console.error("[Settings] Failed to load profile", profileError);
          setProfile({ role: null });
        } else {
          setProfile({ role: data?.role ?? null });
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
    // keep stage label accurate
    if (workspaceLoading) setLoadingStage("workspace");
    else if (authLoading) setLoadingStage("auth");
    else if (profileLoading) setLoadingStage("profile");
    else setLoadingStage("idle");
  }, [workspaceLoading, authLoading, profileLoading]);

  // ✅ safe early returns AFTER hooks
  if (isLoading) {
    return <LoadingCard stage={loadingStage} />;
  }

  if (!profile || !teamId || !userId) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <p className="font-medium">Settings unavailable</p>
          <p className="mt-1">
            We couldn’t find a team or profile for your account. Please open
            this page from your workspace or contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure how Lumo works for your team.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Lead fields card — only for Manager + Admin */}
        {isManagerOrAdmin && (
          <Link
            href="/settings/lead-fields"
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Lead Fields
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose which custom fields your team tracks on every lead.
            </p>
          </Link>
        )}

        {/* Lead Scoring */}
        {isManagerOrAdmin && (
          <Link
            href="/settings/lead-scoring"
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Lead Scoring
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Configure how fields and behaviors turn into a lead score.
            </p>
          </Link>
        )}

        {/* Pipeline Stages */}
        {isManagerOrAdmin && (
          <Link
            href="/settings/pipeline-stages"
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Pipeline Stages
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Define and reorder your pipeline stages used for all leads.
            </p>
          </Link>
        )}

        {/* Pipeline Conversion Rates */}
        {isManagerOrAdmin && (
          <Link
            href="/settings/conversion-metrics"
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Conversion Metrics
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Define named conversion metrics like reply rate or booking rate.
            </p>
          </Link>
        )}

        {/* Schedule / Meeting Links */}
        <Link
          href="/settings/booking-links"
          className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Schedule Pages
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Create and manage your booking links that leads use to schedule
            calls.
          </p>
        </Link>

        {/* Invite team members (Manager + Admin only) */}
        {isManagerOrAdmin && (
          <Link
            href="/settings/team/invite"
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Invite Team Members
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Send invitations and assign roles like Prospector, Setter or
              Closer.
            </p>
          </Link>
        )}

        {/* Manage team roles (Manager + Admin only) */}
        {isManagerOrAdmin && (
          <Link
            href="/settings/team/members"
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <h2 className="text-sm font-semibold text-slate-900">
              Manage Team Roles
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Update roles for existing members. Managers can’t promote admins.
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
