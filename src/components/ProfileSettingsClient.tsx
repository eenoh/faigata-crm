// src/app/(app)/settings/profile/ProfileSettingsClient.tsx
"use client";

/**
 * Simplifications made:
 * • Replaced duplicated “signed URL” logic with one helper: resolveSignedUrl(bucket, value)
 * • Centralized “load user + profile” into one async function to reduce nested try/catch
 * • Centralized admin detection via normalizedRoles(profile.rolesDisplay)
 * • Removed repeated early returns that duplicated state-setting; kept identical outcomes
 * • Kept behavior: roles display unchanged (original strings), admin check case-insensitive,
 *   avatar/org logo upload flows, password/email update flows, organization form admin-only
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PuzzlePieceIcon } from "@heroicons/react/24/outline";

type ProfileState = {
  first_name: string;
  last_name: string;
  roles: string[]; // display/original strings
  avatar_url: string | null; // storage path or legacy URL
  email: string;
};

type OrgState = {
  name: string;
  logo_url: string | null; // path in org-logos bucket (or legacy URL)
  primary_color: string; // hex
};

type Status = "idle" | "loading" | "saving" | "saved" | "error";

const DEFAULT_PRIMARY_COLOR = "#4f46e5";

function normalizeRole(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s ? s : null;
}

function normalizeRoles(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map(normalizeRole).filter((x): x is string => !!x);
  const one = normalizeRole(v);
  return one ? [one] : [];
}

function isHttpUrl(v: string) {
  return v.startsWith("http://") || v.startsWith("https://");
}

async function resolveSignedUrl(
  bucket: "avatars" | "org-logos",
  value: string | null,
): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (isHttpUrl(v)) return v;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(v, 60 * 60 * 24);
  if (error) {
    console.error(`[${bucket}] createSignedUrl error`, error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export default function ProfileSettingsClient() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // --- org state (Admin only) ---
  const [orgId, setOrgId] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgState | null>(null);
  const [orgStatus, setOrgStatus] = useState<Status>("idle");
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgLogoSignedUrl, setOrgLogoSignedUrl] = useState<string | null>(null);
  const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);

  const initials = useMemo(() => {
    if (!profile) return "U";
    const f = profile.first_name?.trim()?.charAt(0).toUpperCase();
    const l = profile.last_name?.trim()?.charAt(0).toUpperCase();
    return (f && l ? `${f}${l}` : f || l || "U") ?? "U";
  }, [profile]);

  // ✅ Case-insensitive admin check; stored roles are display/original strings
  const isAdmin = useMemo(() => {
    return normalizeRoles(profile?.roles ?? []).includes("admin");
  }, [profile?.roles]);

  // ---------- LOAD ----------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes.user) {
          if (!cancelled) {
            setError("Not signed in.");
            setStatus("error");
          }
          return;
        }

        const userId = userRes.user.id;
        const email = userRes.user.email ?? "";

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("first_name, last_name, role, avatar_url, company_id")
          .eq("id", userId)
          .single();

        if (profErr) {
          console.error("[Profile] load error", profErr);
          if (!cancelled) {
            setError("Could not load your profile.");
            setStatus("error");
          }
          return;
        }

        // Display roles: keep original strings (no UI change)
        const rolesArray: string[] = Array.isArray(prof?.role)
          ? (prof.role as unknown[])
              .map((r) => String(r ?? "").trim())
              .filter(Boolean)
          : [];

        const nextProfile: ProfileState = {
          first_name: prof?.first_name ?? "",
          last_name: prof?.last_name ?? "",
          roles: rolesArray,
          avatar_url: prof?.avatar_url ?? null,
          email,
        };

        const companyId: string | null = (prof as any)?.company_id ?? null;

        if (cancelled) return;

        setProfile(nextProfile);
        setOrgId(companyId);
        setStatus("idle");

        // signed avatar
        resolveSignedUrl("avatars", nextProfile.avatar_url).then((url) => {
          if (!cancelled) setAvatarSignedUrl(url);
        });

        // org only for admins
        const rolesNorm = normalizeRoles(prof?.role);
        const userIsAdmin = rolesNorm.includes("admin");

        if (userIsAdmin && companyId) {
          setOrgStatus("loading");

          const { data: orgRow, error: orgErr } = await supabase
            .from("organizations")
            .select("name, logo_url, primary_color")
            .eq("id", companyId)
            .single();

          if (orgErr) {
            console.error("[Org] load error", orgErr);
            if (!cancelled) {
              setOrgError("Could not load your organization.");
              setOrgStatus("error");
            }
            return;
          }

          const nextOrg: OrgState = {
            name: orgRow?.name ?? "",
            logo_url: orgRow?.logo_url ?? null,
            primary_color:
              orgRow?.primary_color && orgRow.primary_color.trim() !== ""
                ? orgRow.primary_color
                : DEFAULT_PRIMARY_COLOR,
          };

          if (cancelled) return;

          setOrg(nextOrg);
          setOrgStatus("idle");

          resolveSignedUrl("org-logos", nextOrg.logo_url).then((url) => {
            if (!cancelled) setOrgLogoSignedUrl(url);
          });
        }
      } catch (err) {
        console.error("[Profile] unexpected error", err);
        if (!cancelled) {
          setError("Something went wrong while loading your profile.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- AVATAR UPLOAD / PROFILE SAVE ----------

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      setError(null);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setError("Not signed in.");
        return;
      }

      const userId = userRes.user.id;
      const fileExt = file.name.split(".").pop() || "png";
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) {
        console.error("[Profile] avatar upload error", uploadErr);
        setError("Could not upload your profile picture.");
        return;
      }

      const signedUrl = await resolveSignedUrl("avatars", filePath);
      if (!signedUrl) {
        setError("Uploaded image, but could not generate a view URL.");
        return;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: filePath })
        .eq("id", userId);

      if (updateErr) {
        console.error("[Profile] avatar url update error", updateErr);
        setError("Uploaded image, but failed to save it to your profile.");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: filePath } : prev));
      setAvatarSignedUrl(signedUrl);
    } catch (err) {
      console.error("[Profile] avatar upload unexpected error", err);
      setError("Something went wrong while uploading your picture.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setStatus("saving");
    setError(null);

    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setError("Not signed in.");
        setStatus("error");
        return;
      }

      const userId = userRes.user.id;
      const currentEmail = userRes.user.email ?? "";

      const { error: updateProfErr } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
        })
        .eq("id", userId);

      if (updateProfErr) {
        console.error("[Profile] update error", updateProfErr);
        setError("Could not save your profile changes.");
        setStatus("error");
        return;
      }

      const updates: { email?: string; password?: string } = {};

      if (profile.email && profile.email !== currentEmail) {
        updates.email = profile.email;
      }

      if (newPassword.trim()) {
        if (newPassword !== confirmPassword) {
          setError("New passwords do not match.");
          setStatus("error");
          return;
        }
        updates.password = newPassword.trim();
      }

      if (updates.email || updates.password) {
        const { error: authErr } = await supabase.auth.updateUser(updates);
        if (authErr) {
          console.error("[Profile] auth update error", authErr);
          setError(
            updates.email && updates.password
              ? "Could not update your email / password."
              : updates.email
                ? "Could not update your email."
                : "Could not update your password.",
          );
          setStatus("error");
          return;
        }
      }

      setStatus("saved");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("[Profile] unexpected save error", err);
      setError("Something went wrong while saving.");
      setStatus("error");
    }
  }

  // ---------- ADMIN-ONLY ORGANIZATION SAVE / LOGO UPLOAD ----------

  async function handleSaveOrganization(e: React.FormEvent) {
    e.preventDefault();
    if (!org || !orgId) return;

    if (!isAdmin) {
      setOrgError("Only admins can update organization settings.");
      setOrgStatus("error");
      return;
    }

    setOrgStatus("saving");
    setOrgError(null);

    try {
      const payload = {
        name: org.name || null,
        logo_url: org.logo_url || null,
        primary_color:
          org.primary_color && org.primary_color.trim() !== ""
            ? org.primary_color
            : DEFAULT_PRIMARY_COLOR,
        updated_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from("organizations")
        .update(payload)
        .eq("id", orgId);

      if (updateErr) {
        console.error("[Org] update error", updateErr);
        setOrgError("Could not save your organization changes.");
        setOrgStatus("error");
        return;
      }

      setOrgStatus("saved");
    } catch (err) {
      console.error("[Org] unexpected save error", err);
      setOrgError("Something went wrong while saving organization settings.");
      setOrgStatus("error");
    }
  }

  async function handleOrgLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;

    try {
      setUploadingOrgLogo(true);
      setOrgError(null);

      if (!orgId) {
        setOrgError("Missing organization id.");
        return;
      }

      const fileExt = file.name.split(".").pop() || "png";
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${orgId}/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from("org-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) {
        console.error("[Org] logo upload error", uploadErr);
        setOrgError("Could not upload your company logo.");
        return;
      }

      const signedUrl = await resolveSignedUrl("org-logos", filePath);
      if (!signedUrl) {
        setOrgError("Uploaded logo, but could not generate a view URL.");
        return;
      }

      const { error: updateErr } = await supabase
        .from("organizations")
        .update({ logo_url: filePath, updated_at: new Date().toISOString() })
        .eq("id", orgId);

      if (updateErr) {
        console.error("[Org] logo url update error", updateErr);
        setOrgError("Uploaded logo, but failed to save it.");
        return;
      }

      setOrg((prev) => (prev ? { ...prev, logo_url: filePath } : prev));
      setOrgLogoSignedUrl(signedUrl);
    } catch (err) {
      console.error("[Org] logo upload unexpected error", err);
      setOrgError("Something went wrong while uploading your logo.");
    } finally {
      setUploadingOrgLogo(false);
    }
  }

  // ---------- RENDER ----------

  if (status === "loading" || !profile) {
    return (
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Loading your profile…
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mt-6 lg:mt-10 ml-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Profile &amp; Organization
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Update your personal account settings and manage your company
              branding.
            </p>
          </div>

          <Link
            href="/profile/integrations"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            title="Manage integrations"
          >
            <PuzzlePieceIcon className="h-4 w-4" />
            Integrations
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      {status === "saved" && !error && (
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
          ✅ Account updated
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.7fr)]">
        {/* LEFT: organization (Admin only) */}
        <div className="space-y-3 flex flex-col h-full">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Organization
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Update your company name, logo, and primary colour used across
              Faigata.
            </p>

            {!isAdmin && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Only <span className="font-semibold">Admins</span> can edit
                organization settings. Your organization owner can update these
                details for you.
              </p>
            )}
          </div>

          {isAdmin && (
            <form
              onSubmit={handleSaveOrganization}
              className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex-1 flex flex-col"
            >
              {orgError && (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {orgError}
                </div>
              )}
              {orgStatus === "saved" && !orgError && (
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-700">
                  ✅ Organization updated
                </div>
              )}

              {/* Company logo */}
              <div className="flex items-center gap-4">
                {orgLogoSignedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={orgLogoSignedUrl}
                    alt="Company logo"
                    className="h-12 w-12 rounded-xl object-cover border border-slate-200 bg-slate-50"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-400">
                    Logo
                  </div>
                )}

                <div className="flex flex-col">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
                    Company logo
                  </span>
                  <span className="text-[11px] text-slate-400">
                    PNG or JPG, square works best.
                  </span>
                  <label className="mt-2 inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    {uploadingOrgLogo ? "Uploading…" : "Upload logo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleOrgLogoChange}
                      disabled={uploadingOrgLogo}
                    />
                  </label>
                </div>
              </div>

              {/* Company name */}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Company name
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={org?.name ?? ""}
                  onChange={(e) =>
                    setOrg((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev,
                    )
                  }
                />
              </div>

              {/* Primary colour */}
              <div className="space-y-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Primary colour
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="h-9 w-9 cursor-pointer rounded-md border border-slate-300 bg-white"
                    value={org?.primary_color || DEFAULT_PRIMARY_COLOR}
                    onChange={(e) =>
                      setOrg((prev) =>
                        prev
                          ? { ...prev, primary_color: e.target.value }
                          : prev,
                      )
                    }
                  />
                  <input
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={org?.primary_color || DEFAULT_PRIMARY_COLOR}
                    onChange={(e) =>
                      setOrg((prev) =>
                        prev
                          ? { ...prev, primary_color: e.target.value }
                          : prev,
                      )
                    }
                    placeholder={DEFAULT_PRIMARY_COLOR}
                  />
                </div>
                <p className="flex items-center gap-2 text-[11px] text-slate-400">
                  This colour is used for buttons and highlights in your
                  workspace.
                  <span
                    className="inline-flex h-4 w-10 items-center justify-center rounded-full text-[9px] font-medium text-white"
                    style={{
                      backgroundColor:
                        org?.primary_color || DEFAULT_PRIMARY_COLOR,
                    }}
                  >
                    Preview
                  </span>
                </p>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={orgStatus === "saving"}
                  className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                >
                  {orgStatus === "saving" ? "Saving…" : "Save organization"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* RIGHT: profile form */}
        <form
          onSubmit={handleSaveProfile}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm h-full flex flex-col"
        >
          <div className="flex items-center gap-4">
            {avatarSignedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSignedUrl}
                alt="Profile avatar"
                className="h-14 w-14 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                {initials}
              </div>
            )}

            <div className="flex flex-col">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
                Profile picture
              </span>
              <span className="text-[11px] text-slate-400">
                PNG or JPG, up to ~5MB.
              </span>
              <label className="mt-2 inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                {uploadingAvatar ? "Uploading…" : "Upload new photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={uploadingAvatar}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                First name
              </label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={profile.first_name}
                onChange={(e) =>
                  setProfile({ ...profile, first_name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                Last name
              </label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={profile.last_name}
                onChange={(e) =>
                  setProfile({ ...profile, last_name: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={profile.email}
              onChange={(e) =>
                setProfile({ ...profile, email: e.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-slate-400">
              This updates the email tied to your login. You may need to verify
              the new address.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
              Roles
            </label>
            <div className="flex flex-wrap gap-2">
              {(profile.roles.length ? profile.roles : ["Member"]).map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                New password
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave blank to keep current"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
                Confirm new password
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Leave blank to keep current"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={status === "saving"}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
            >
              {status === "saving" ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
