"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PuzzlePieceIcon } from "@heroicons/react/24/outline";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useAppLocale } from "@/context/LocaleContext";
import {
  SUPPORTED_LOCALES,
  getLocaleLabel,
  type AppLocale,
  normalizeLocale,
} from "@/i18n/config";

type ProfileState = {
  first_name: string;
  last_name: string;
  roles: string[];
  avatar_url: string | null;
  email: string;
  preferred_language: AppLocale;
};

type OrgState = {
  name: string;
  logo_url: string | null;
  primary_color: string;
};

type Status = "idle" | "loading" | "saving" | "saved" | "error";

type ProfileErrorKey =
  | "notSignedIn"
  | "loadProfile"
  | "loadProfileUnexpected"
  | "uploadAvatar"
  | "uploadAvatarSignedUrl"
  | "uploadAvatarSave"
  | "uploadAvatarUnexpected"
  | "saveProfile"
  | "passwordMismatch"
  | "saveAuthEmailPassword"
  | "saveAuthEmail"
  | "saveAuthPassword"
  | "saveProfileUnexpected";

type OrgErrorKey =
  | "orgAdminOnly"
  | "loadOrganization"
  | "saveOrganization"
  | "saveOrganizationUnexpected"
  | "missingOrganizationId"
  | "uploadLogo"
  | "uploadLogoSignedUrl"
  | "uploadLogoSave"
  | "uploadLogoUnexpected";

const DEFAULT_PRIMARY_COLOR = "#4f46e5";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeRole(value: unknown): string | null {
  const nextValue = String(value ?? "")
    .trim()
    .toLowerCase();
  return nextValue || null;
}

function normalizeRoles(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(normalizeRole).filter((item): item is string => !!item);
  }

  const role = normalizeRole(value);
  return role ? [role] : [];
}

function getRoleLabel(
  common: ReturnType<typeof useTranslations<"Common">>,
  role: unknown,
) {
  switch (String(role ?? "").trim().toLowerCase()) {
    case "admin":
      return common("roles.admin");
    case "manager":
      return common("roles.manager");
    case "prospector":
      return common("roles.prospector");
    case "setter":
      return common("roles.setter");
    case "closer":
      return common("roles.closer");
    default:
      return common("roles.member");
  }
}

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

async function resolveSignedUrl(
  bucket: "avatars" | "org-logos",
  value: string | null,
): Promise<string | null> {
  const nextValue = (value ?? "").trim();
  if (!nextValue) return null;
  if (isHttpUrl(nextValue)) return nextValue;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(nextValue, 60 * 60 * 24);

  if (error) {
    console.error(`[${bucket}] createSignedUrl error`, error);
    return null;
  }

  return data?.signedUrl ?? null;
}

export default function ProfileSettingsClient() {
  const activeLocale = useLocale();
  const t = useTranslations("ProfileSettings");
  const common = useTranslations("Common");
  const { resolvedTheme } = useTheme();
  const { setLocale } = useAppLocale();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [orgId, setOrgId] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgState | null>(null);
  const [orgStatus, setOrgStatus] = useState<Status>("idle");
  const [orgError, setOrgError] = useState<OrgErrorKey | null>(null);
  const [orgLogoSignedUrl, setOrgLogoSignedUrl] = useState<string | null>(null);
  const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);

  const initials = useMemo(() => {
    if (!profile) return t("profile.avatarFallback");
    const firstName = profile.first_name.trim().charAt(0).toUpperCase();
    const lastName = profile.last_name.trim().charAt(0).toUpperCase();
    return firstName && lastName
      ? `${firstName}${lastName}`
      : firstName || lastName || t("profile.avatarFallback");
  }, [profile, t]);

  const isAdmin = useMemo(
    () => normalizeRoles(profile?.roles ?? []).includes("admin"),
    [profile?.roles],
  );

  const localeOptions = useMemo(
    () =>
      SUPPORTED_LOCALES.map((code) => [
        code,
        getLocaleLabel(code, activeLocale),
      ]) as Array<[AppLocale, string]>,
    [activeLocale],
  );

  const cardBase = cn(
    "rounded-2xl border shadow-sm",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );

  const softCard = cn(
    "rounded-xl border",
    isDark
      ? "border-slate-800 bg-slate-900/30"
      : "border-slate-200 bg-slate-50",
  );

  const labelClass = cn(
    "mb-1 block text-xs font-medium uppercase tracking-wide",
    isDark ? "text-slate-400" : "text-slate-600",
  );

  const inputClass = cn(
    "w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-500 focus:ring-indigo-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-indigo-500",
  );

  const buttonOutline = cn(
    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/30"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes.user) {
          if (!cancelled) {
            setError("notSignedIn");
            setStatus("error");
          }
          return;
        }

        const userId = userRes.user.id;
        const email = userRes.user.email ?? "";

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select(
            "first_name, last_name, role, avatar_url, company_id, preferred_language",
          )
          .eq("id", userId)
          .single();

        if (profErr) {
          console.error("[Profile] load error", profErr);
          if (!cancelled) {
            setError("loadProfile");
            setStatus("error");
          }
          return;
        }

        const rolesArray = normalizeRoles(prof?.role);

        const nextProfile: ProfileState = {
          first_name: prof?.first_name ?? "",
          last_name: prof?.last_name ?? "",
          roles: rolesArray,
          avatar_url: prof?.avatar_url ?? null,
          email,
          preferred_language:
            normalizeLocale(
              (prof as { preferred_language?: string | null })
                .preferred_language,
            ) ?? "en",
        };

        const companyId =
          (prof as { company_id?: string | null } | null)?.company_id ?? null;

        if (cancelled) return;

        setProfile(nextProfile);
        setOrgId(companyId);
        setStatus("idle");

        void resolveSignedUrl("avatars", nextProfile.avatar_url).then((url) => {
          if (!cancelled) setAvatarSignedUrl(url);
        });

        const userIsAdmin = rolesArray.includes("admin");

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
              setOrgError("loadOrganization");
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

          void resolveSignedUrl("org-logos", nextOrg.logo_url).then((url) => {
            if (!cancelled) setOrgLogoSignedUrl(url);
          });
        }
      } catch (nextError) {
        console.error("[Profile] unexpected error", nextError);
        if (!cancelled) {
          setError("loadProfileUnexpected");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      setError(null);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setError("notSignedIn");
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
        setError("uploadAvatar");
        return;
      }

      const signedUrl = await resolveSignedUrl("avatars", filePath);
      if (!signedUrl) {
        setError("uploadAvatarSignedUrl");
        return;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: filePath })
        .eq("id", userId);

      if (updateErr) {
        console.error("[Profile] avatar url update error", updateErr);
        setError("uploadAvatarSave");
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: filePath } : prev));
      setAvatarSignedUrl(signedUrl);
    } catch (nextError) {
      console.error("[Profile] avatar upload unexpected error", nextError);
      setError("uploadAvatarUnexpected");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;

    setStatus("saving");
    setError(null);

    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) {
        setError("notSignedIn");
        setStatus("error");
        return;
      }

      const userId = userRes.user.id;
      const currentEmail = userRes.user.email ?? "";
      const nextLocale = normalizeLocale(profile.preferred_language) ?? "en";

      const { error: updateProfErr } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          preferred_language: nextLocale,
        })
        .eq("id", userId);

      if (updateProfErr) {
        console.error("[Profile] update error", updateProfErr);
        setError("saveProfile");
        setStatus("error");
        return;
      }

      const updates: { email?: string; password?: string } = {};

      if (profile.email && profile.email !== currentEmail) {
        updates.email = profile.email;
      }

      if (newPassword.trim()) {
        if (newPassword !== confirmPassword) {
          setError("passwordMismatch");
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
              ? "saveAuthEmailPassword"
              : updates.email
                ? "saveAuthEmail"
                : "saveAuthPassword",
          );
          setStatus("error");
          return;
        }
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              email: updates.email ?? prev.email,
              preferred_language: nextLocale,
            }
          : prev,
      );

      setNewPassword("");
      setConfirmPassword("");
      setLocale(nextLocale);
      setStatus("saved");
    } catch (nextError) {
      console.error("[Profile] unexpected save error", nextError);
      setError("saveProfileUnexpected");
      setStatus("error");
    }
  }

  async function handleSaveOrganization(event: FormEvent) {
    event.preventDefault();
    if (!org || !orgId) return;

    if (!isAdmin) {
      setOrgError("orgAdminOnly");
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
        setOrgError("saveOrganization");
        setOrgStatus("error");
        return;
      }

      setOrgStatus("saved");
    } catch (nextError) {
      console.error("[Org] unexpected save error", nextError);
      setOrgError("saveOrganizationUnexpected");
      setOrgStatus("error");
    }
  }

  async function handleOrgLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !isAdmin) return;

    try {
      setUploadingOrgLogo(true);
      setOrgError(null);

      if (!orgId) {
        setOrgError("missingOrganizationId");
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
        setOrgError("uploadLogo");
        return;
      }

      const signedUrl = await resolveSignedUrl("org-logos", filePath);
      if (!signedUrl) {
        setOrgError("uploadLogoSignedUrl");
        return;
      }

      const { error: updateErr } = await supabase
        .from("organizations")
        .update({ logo_url: filePath, updated_at: new Date().toISOString() })
        .eq("id", orgId);

      if (updateErr) {
        console.error("[Org] logo url update error", updateErr);
        setOrgError("uploadLogoSave");
        return;
      }

      setOrg((prev) => (prev ? { ...prev, logo_url: filePath } : prev));
      setOrgLogoSignedUrl(signedUrl);
    } catch (nextError) {
      console.error("[Org] logo upload unexpected error", nextError);
      setOrgError("uploadLogoUnexpected");
    } finally {
      setUploadingOrgLogo(false);
      event.target.value = "";
    }
  }

  if (status === "loading" || !profile) {
    return (
      <div className="min-h-screen w-full bg-[var(--background)]">
        <div className="ml-4 mt-6 w-full max-w-6xl lg:mt-10">
          <div
            className={cn(
              "max-w-xl rounded-2xl border p-6 text-sm shadow-sm",
              isDark
                ? "border-slate-800 bg-slate-950 text-slate-400"
                : "border-slate-200 bg-white text-slate-500",
            )}
          >
            {t("loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <div className="ml-4 mt-6 w-full max-w-6xl space-y-4 lg:mt-10">
        <div className={cn(cardBase, "px-5 py-4")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className={cn(
                  "text-xl font-semibold",
                  isDark ? "text-slate-100" : "text-slate-900",
                )}
              >
                {t("title")}
              </h1>
              <p
                className={cn(
                  "mt-1 text-sm",
                  isDark ? "text-slate-400" : "text-slate-600",
                )}
              >
                {t("description")}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/profile/integrations"
                className={buttonOutline}
                title={t("integrations")}
                aria-label={t("integrations")}
              >
                <PuzzlePieceIcon className="h-4 w-4" />
                {t("integrations")}
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div
            className={cn(
              "rounded-xl border px-4 py-2 text-xs",
              isDark
                ? "border-rose-900/40 bg-rose-500/10 text-rose-200"
                : "border-rose-100 bg-rose-50 text-rose-700",
            )}
          >
            {t(`errors.${error}`)}
          </div>
        )}

        {status === "saved" && !error && (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
              isDark
                ? "border-emerald-900/40 bg-emerald-500/10 text-emerald-200"
                : "border-emerald-100 bg-emerald-50 text-emerald-700",
            )}
          >
            {t("accountUpdated")}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.7fr)]">
          <div className="flex h-full flex-col space-y-3">
            <div className={cn(cardBase, "p-5")}>
              <h2
                className={cn(
                  "text-sm font-semibold",
                  isDark ? "text-slate-100" : "text-slate-900",
                )}
              >
                {t("organization.title")}
              </h2>
              <p
                className={cn(
                  "mt-1 text-xs",
                  isDark ? "text-slate-400" : "text-slate-500",
                )}
              >
                {t("organization.description")}
              </p>

              {!isAdmin && (
                <div className={cn(softCard, "mt-3 px-3 py-2")}>
                  <p
                    className={cn(
                      "text-[11px]",
                      isDark ? "text-slate-400" : "text-slate-500",
                    )}
                  >
                    {t("organization.adminOnly")}
                  </p>
                </div>
              )}
            </div>

            {isAdmin && (
              <form
                onSubmit={handleSaveOrganization}
                className={cn(cardBase, "flex flex-1 flex-col space-y-5 p-5")}
              >
                {orgError && (
                  <div
                    className={cn(
                      "rounded-xl border px-3 py-2 text-[11px]",
                      isDark
                        ? "border-rose-900/40 bg-rose-500/10 text-rose-200"
                        : "border-rose-100 bg-rose-50 text-rose-700",
                    )}
                  >
                    {t(`errors.${orgError}`)}
                  </div>
                )}

                {orgStatus === "saved" && !orgError && (
                  <div
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]",
                      isDark
                        ? "border-emerald-900/40 bg-emerald-500/10 text-emerald-200"
                        : "border-emerald-100 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {t("organization.updated")}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  {orgLogoSignedUrl ? (
                    <img
                      src={orgLogoSignedUrl}
                      alt={t("organization.companyLogo")}
                      className={cn(
                        "h-12 w-12 rounded-xl border object-cover",
                        isDark
                          ? "border-slate-800 bg-slate-950"
                          : "border-slate-200 bg-slate-50",
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl border border-dashed text-xs font-semibold",
                        isDark
                          ? "border-slate-700 bg-slate-950 text-slate-500"
                          : "border-slate-300 bg-slate-50 text-slate-400",
                      )}
                    >
                      {t("organization.logoFallback")}
                    </div>
                  )}

                  <div className="flex flex-col">
                    <span className={labelClass}>
                      {t("organization.companyLogo")}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-500" : "text-slate-400",
                      )}
                    >
                      {t("organization.logoHelp")}
                    </span>
                    <label
                      className={cn(
                        buttonOutline,
                        "mt-2 w-fit cursor-pointer px-3 py-1.5",
                      )}
                      title={t("organization.companyLogo")}
                    >
                      {uploadingOrgLogo
                        ? t("organization.uploadingLogo")
                        : t("organization.uploadLogo")}
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

                <div>
                  <label className={labelClass}>
                    {t("organization.companyName")}
                  </label>
                  <input
                    className={inputClass}
                    value={org?.name ?? ""}
                    onChange={(event) =>
                      setOrg((prev) =>
                        prev ? { ...prev, name: event.target.value } : prev,
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className={labelClass}>
                    {t("organization.primaryColor")}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className={cn(
                        "h-9 w-9 cursor-pointer rounded-md border",
                        isDark
                          ? "border-slate-800 bg-slate-950"
                          : "border-slate-300 bg-white",
                      )}
                      value={org?.primary_color || DEFAULT_PRIMARY_COLOR}
                      onChange={(event) =>
                        setOrg((prev) =>
                          prev
                            ? { ...prev, primary_color: event.target.value }
                            : prev,
                        )
                      }
                    />
                    <input
                      className={cn(inputClass, "font-mono")}
                      value={org?.primary_color || DEFAULT_PRIMARY_COLOR}
                      onChange={(event) =>
                        setOrg((prev) =>
                          prev
                            ? { ...prev, primary_color: event.target.value }
                            : prev,
                        )
                      }
                      placeholder={DEFAULT_PRIMARY_COLOR}
                    />
                  </div>

                  <div className={cn(softCard, "px-3 py-2")}>
                    <p
                      className={cn(
                        "flex items-center gap-2 text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("organization.colorHelp")}
                      <span
                        className="inline-flex min-h-5 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none text-white whitespace-nowrap"
                        style={{
                          backgroundColor:
                            org?.primary_color || DEFAULT_PRIMARY_COLOR,
                        }}
                      >
                        {t("organization.preview")}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={orgStatus === "saving"}
                    className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {orgStatus === "saving"
                      ? common("actions.saving")
                      : t("organization.save")}
                  </button>
                </div>
              </form>
            )}
          </div>

          <form
            onSubmit={handleSaveProfile}
            className={cn(cardBase, "flex h-full flex-col space-y-6 p-6")}
          >
            <div className="flex items-center gap-4">
              {avatarSignedUrl ? (
                <img
                  src={avatarSignedUrl}
                  alt={t("profile.picture")}
                  className={cn(
                    "h-14 w-14 rounded-full border object-cover",
                    isDark ? "border-slate-800" : "border-slate-200",
                  )}
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                  {initials}
                </div>
              )}

              <div className="flex flex-col">
                <span className={labelClass}>{t("profile.picture")}</span>
                <span
                  className={cn(
                    "text-[11px]",
                    isDark ? "text-slate-500" : "text-slate-400",
                  )}
                >
                  {t("profile.pictureHelp")}
                </span>
                <label
                  className={cn(
                    buttonOutline,
                    "mt-2 w-fit cursor-pointer px-3 py-1.5",
                  )}
                  title={t("profile.picture")}
                >
                  {uploadingAvatar
                    ? t("profile.uploadingPhoto")
                    : t("profile.uploadPhoto")}
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
                <label className={labelClass}>
                  {common("fields.firstName")}
                </label>
                <input
                  className={inputClass}
                  value={profile.first_name}
                  onChange={(event) =>
                    setProfile({ ...profile, first_name: event.target.value })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>
                  {common("fields.lastName")}
                </label>
                <input
                  className={inputClass}
                  value={profile.last_name}
                  onChange={(event) =>
                    setProfile({ ...profile, last_name: event.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>{common("fields.email")}</label>
              <input
                type="email"
                className={inputClass}
                value={profile.email}
                onChange={(event) =>
                  setProfile({ ...profile, email: event.target.value })
                }
              />
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  isDark ? "text-slate-500" : "text-slate-400",
                )}
              >
                {t("profile.emailHelp")}
              </p>
            </div>

            <div>
              <label className={labelClass}>{common("languages.label")}</label>
              <select
                className={cn(inputClass, "cursor-pointer")}
                value={profile.preferred_language}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    preferred_language:
                      normalizeLocale(event.target.value) ?? "en",
                  })
                }
              >
                {localeOptions.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  isDark ? "text-slate-500" : "text-slate-400",
                )}
              >
                {common("languages.help")}
              </p>
            </div>

            <div>
              <label className={labelClass}>{common("fields.roles")}</label>
              <div className="flex flex-wrap gap-2">
                {(profile.roles.length ? profile.roles : ["member"]).map(
                  (role) => (
                    <span
                      key={role}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                        isDark
                          ? "border-slate-800 bg-slate-900/30 text-slate-200"
                          : "border-transparent bg-slate-100 text-slate-700",
                      )}
                    >
                      {getRoleLabel(common, role)}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t("profile.newPassword")}</label>
                <input
                  type="password"
                  className={inputClass}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t("profile.passwordPlaceholder")}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("profile.confirmNewPassword")}
                </label>
                <input
                  type="password"
                  className={inputClass}
                  placeholder={t("profile.passwordPlaceholder")}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={status === "saving"}
                className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {status === "saving"
                  ? common("actions.saving")
                  : t("profile.save")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
