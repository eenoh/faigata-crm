// src/app/(app)/settings/profile/ProfileSettingsClient.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProfileState = {
  first_name: string;
  last_name: string;
  role: string | null;
  avatar_url: string | null; // path or legacy URL
  email: string;
};

type Status = "idle" | "loading" | "saving" | "saved" | "error";

export default function ProfileSettingsClient() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

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

        const email = userRes.user.email ?? "";

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("first_name, last_name, role, avatar_url")
          .eq("id", userRes.user.id)
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
          const nextProfile: ProfileState = {
            first_name: prof?.first_name ?? "",
            last_name: prof?.last_name ?? "",
            role: prof?.role ?? null,
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

      // Upload to private bucket
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) {
        console.error("[Profile] avatar upload error", uploadErr);
        setError("Could not upload your profile picture.");
        setUploadingAvatar(false);
        return;
      }

      // Create signed URL for immediate display
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

      // Store the *path* in DB, not the signed URL
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: filePath })
        .eq("id", userId);

      if (updateErr) {
        console.error("[Profile] avatar url update error", updateErr);
        setError("Uploaded image, but failed to save it to your profile.");
        setUploadingAvatar(false);
        return;
      }

      // Update local state
      setProfile((prev) =>
        prev ? { ...prev, avatar_url: filePath } : prev
      );
      setAvatarSignedUrl(signedUrl); // show immediately
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
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) {
        setError("Not signed in.");
        setStatus("error");
        return;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          role: profile.role || null,
          avatar_url: profile.avatar_url || null, // path or legacy
        })
        .eq("id", userId);

      if (updateErr) {
        console.error("[Profile] update error", updateErr);
        setError("Could not save your changes.");
        setStatus("error");
        return;
      }

      setStatus("saved");
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
          Update your personal details. These are also used for your avatar
          and user role.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      {status === "saved" && !error && (
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
          ✅ Profile updated
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* Avatar upload */}
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

        {/* Email */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Email
          </label>
          <input
            className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            value={profile.email}
            readOnly
          />
        </div>

        {/* Role */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600">
            Role
          </label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={profile.role ?? ""} 
            onChange={(e) =>
              setProfile({ ...profile, role: e.target.value || null })
            }
          >
            <option value="">Select role…</option>
            <option value="Prospector">Prospector</option>
            <option value="Setter">Setter</option>
            <option value="Closer">Closer</option>
            <option value="Manager">Manager</option>
            <option value="Admin">Admin</option>
          </select>
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
