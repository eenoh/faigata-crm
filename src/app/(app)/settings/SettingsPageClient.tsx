// src/app/(app)/settings/SettingsPageClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "./LogoutButton";


type Profile = {
  role: string[] | null; // now an array
  team_id: string | null;
};

export default function SettingsPageClient() {
  const router = useRouter();

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
          .select("role, team_id")
          .eq("id", uid)
          .single();

        if (cancelled) return;

        if (profileError) {
          console.error("[Settings] Failed to load profile", profileError);
          setProfile({ role: null, team_id: null });
        } else {
          // role is now text[]
          setProfile({
            role: (data?.role as string[] | null) ?? null,
            team_id: data?.team_id ?? null,
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

  if (!profile || !profile.team_id || !userId) {
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

  const teamId = profile.team_id;
  const roles = profile.role ?? [];

  // For display you can pick a "primary" role if you want
  const primaryRole =
    roles.includes("Admin") ? "Admin" :
    roles.includes("Manager") ? "Manager" :
    roles[0] ?? "Member";

  // Permissions: anyone with Manager OR Admin in their roles
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
            href={`/settings/lead-fields?team=${encodeURIComponent(teamId)}`}
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

        {/* Profile / user settings card */}
        <Link
          href={`/settings/profile?user=${encodeURIComponent(
            userId
          )}&team=${encodeURIComponent(teamId)}`}
          className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Profile &amp; Account
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Edit your name, avatar, and other account details.
          </p>
        </Link>

        {/* NEW: Invite team members (Manager + Admin only) */}
        {isManagerOrAdmin && (
          <Link
            href={`/settings/team/invite?team=${encodeURIComponent(teamId)}`}
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

        {/* NEW: Manage team roles (Manager + Admin only) */}
        {isManagerOrAdmin && (
          <Link
            href={`/settings/team/members?team=${encodeURIComponent(teamId)}`}
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
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
