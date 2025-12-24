// src/app/(app)/settings/SettingsPageClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "../../../app/(app)/settings/LogoutButton";
import { useWorkspace } from "@/context/WorkspaceContext";

type Profile = {
  role: string[] | null;
};

export default function SettingsPageClient() {
  const router = useRouter();
  const { teamId } = useWorkspace(); // <-- team comes from workspace context

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          router.replace("/login");
          return;
        }

        const uid = userRes.user.id;
        if (cancelled) return;

        setUserId(uid);

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
          setProfile({
            role: (data?.role as string[] | null) ?? null,
          });
        }
      } catch (err) {
        console.error("[Settings] Unexpected error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-16 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-24 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse" />
          <div className="h-24 rounded-2xl border border-slate-200 bg-white shadow-sm animate-pulse" />
        </div>
      </div>
    );
  }

  // ✅ use teamId from context, not from profile
  if (!profile || !teamId || !userId) {
    return (
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">
          We couldn’t find a team or profile for your account. Please contact
          support.
        </p>
      </div>
    );
  }

  const roles = profile.role ?? [];

  const primaryRole =
    roles.includes("Admin")
      ? "Admin"
      : roles.includes("Manager")
      ? "Manager"
      : roles[0] ?? "Member";

  const isManagerOrAdmin =
    roles.includes("Manager") || roles.includes("Admin");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure how FaigataCRM works for your team and manage your account.
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

        {/* Calendar Connections */}
        <Link
          href="/settings/integrations"
          className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Add Integrations
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Connect your Google Calendar to power booking links and keep meetings in sync.
          </p>
        </Link>

        {/* Schedule / Meeting Links */}
        <Link
          href="/settings/booking-links"
          className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Schedule Pages
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Create and manage your booking links that leads use to schedule calls.
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
