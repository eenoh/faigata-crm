"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProfileState = {
  first_name: string;
  last_name: string;
  roles: string[];             // ARRAY of roles from profiles.role
  avatar_url: string | null;   // path or legacy URL
  email: string;
};

type Status = "idle" | "loading" | "saving" | "saved" | "error";

export default function ProfileSettingsClient() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function refreshSignedAvatar(avatarValue: string | null) {
    if (!avatarValue) {
      setAvatarSignedUrl(null);
      return;
    }

    // Legacy full URL
    if (
      avatarValue.startsWith("http://") ||
      avatarValue.startsWith("https://")
    ) {
      setAvatarSignedUrl(avatarValue);
      return;
    }

    // Stored path in avatars bucket
    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(avatarValue, 60 * 60 * 24); // 24h

    if (error) {
      console.error("[Profile] createSignedUrl error", error);
      setAvatarSignedUrl(null);
      return;
    }

    setAvatarSignedUrl(data?.signedUrl ?? null);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userErr } =
          await supabase.auth.getUser();
        if (userErr || !userRes.user) {
          if (!cancelled) {
            setError("Not signed in.");
            setStatus("error");
          }
          return;
        }

        const userId = userRes.user.id;
        const email = userRes.user.email ?? "";

        // load base profile (role is text[])
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("first_name, last_name, role, avatar_url")
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

        if (!cancelled) {
          const rolesArray: string[] = Array.isArray(prof?.role)
            ? (prof.role as string[]).filter((r) => typeof r === "string" && r.trim() !== "")
            : [];

          const nextProfile: ProfileState = {
            first_name: prof?.first_name ?? "",
            last_name: prof?.last_name ?? "",
            roles: rolesArray,
            avatar_url: prof?.avatar_url ?? null,
            email,
          };

          setProfile(nextProfile);
          setStatus("idle");

          if (nextProfile.avatar_url) {
            refreshSignedAvatar(nextProfile.avatar_url);
          }
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

  const initials = (() => {
    if (!profile) return "U";
    const f = profile.first_name?.trim()?.charAt(0).toUpperCase();
    const l = profile.last_name?.trim()?.charAt(0).toUpperCase();
    if (f && l) return `${f}${l}`;
    if (f) return f;
    if (l) return l;
    return "U";
  })();

  async function handleAvatarChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      setError(null);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setError("Not signed in.");
        setUploadingAvatar(false);
        return;
      }

      const userId = userRes.user.id;
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // upload to private bucket
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) {
        console.error("[Profile] avatar upload error", uploadErr);
        setError("Could not upload your profile picture.");
        setUploadingAvatar(false);
        return;
      }

      // generate signed URL for preview
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days

      if (signedErr || !signedData?.signedUrl) {
        console.error("[Profile] createSignedUrl error", signedErr);
        setError("Uploaded image, but could not generate a view URL.");
        setUploadingAvatar(false);
        return;
      }

      const signedUrl = signedData.signedUrl;

      // store *path* in DB
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: filePath })
        .eq("id", userRes.user.id);

      if (updateErr) {
        console.error("[Profile] avatar url update error", updateErr);
        setError("Uploaded image, but failed to save it to your profile.");
        setUploadingAvatar(false);
        return;
      }

      // update local state
      setProfile((prev) =>
        prev ? { ...prev, avatar_url: filePath } : prev
      );
      setAvatarSignedUrl(signedUrl);
    } catch (err) {
      console.error("[Profile] avatar upload unexpected error", err);
      setError("Something went wrong while uploading your picture.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setStatus("saving");
    setError(null);

    try {
      const { data: userRes, error: userErr } =
        await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setError("Not signed in.");
        setStatus("error");
        return;
      }

      const userId = userRes.user.id;
      const currentEmail = userRes.user.email ?? "";

      // 1) update profile names (roles not edited here)
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

      // 2) update email / password
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
              : "Could not update your password."
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

  if (status === "loading" || !profile) {
    return (
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Loading your profile…
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Profile &amp; account
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          View your roles and update your personal details, email, and password.
        </p>
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

      <form
        onSubmit={handleSave}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* Avatar (editable) */}
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

        {/* Name */}
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

        {/* Email (auth email; editable) */}
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
            This updates the email tied to your login.
            You may need to verify the new address.
          </p>
        </div>

        {/* Roles (read-only, from ARRAY column) */}
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

        {/* Password change */}
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
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {status === "saving" ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
