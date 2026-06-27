"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils/cn";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";
import {
  darkenHexColor as darken,
  lightenHexColor as lighten,
  slugifySegment as slugify,
  timeToMinutes,
} from "@/features/crm/utils/booking";
import { HostSelectionSection } from "@/features/crm/components/create-schedule-page/HostSelectionSection";
import { SchedulePagePreview } from "@/features/crm/components/create-schedule-page/SchedulePagePreview";

type CloserUser = {
  user_id: string;
  first_name: string;
  last_name: string;
};

type OrgInfo = {
  id: string;
  name: string | null;
  primary_color: string | null;
  logo_url: string | null;
};

type RedirectMode = "default" | "external";
type AvailabilityMode = "business_hours" | "twenty_four_seven";

const DEFAULT_PRIMARY = "#4f46e5";

async function crmLocaleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocaleHeader(init?.headers),
  });
}

function humanizeCreateScheduleError(
  raw: unknown,
  t: ReturnType<typeof useTranslations>,
) {
  const code = String(raw ?? "").trim();

  if (!code) return t("errors.createFailed");
  if (
    code === "no_session" ||
    code === "missing_auth" ||
    code === "invalid_session"
  ) {
    return "Your session expired. Please sign in again and try creating the booking page once more.";
  }
  if (code === "invalid_payload") {
    return "Some booking page details are missing or invalid. Review the form and try again.";
  }
  if (code === "missing_team_or_owner") {
    return "We couldn't verify your workspace or owner details. Refresh the page and try again.";
  }
  if (code === "booking_link_hosts_create_failed") {
    return "We couldn't save the selected hosts for this booking page. Please try again.";
  }
  if (
    code === "booking_link_create_failed" ||
    code === "unexpected_booking_link_create_error"
  ) {
    return t("errors.createFailed");
  }
  if (/^[a-z0-9_]+$/i.test(code)) {
    return t("errors.unexpected");
  }

  return code;
}

function ErrorBox({
  msg,
  isDark,
  title,
}: {
  msg: string;
  isDark: boolean;
  title: string;
}) {
  return (
    <div
      className={cn(
        "mt-3 rounded-xl border px-3 py-2 text-xs",
        isDark
          ? "border-rose-900/40 bg-rose-950/40"
          : "border-rose-200 bg-rose-50",
      )}
    >
      <div
        className={cn(
          "font-semibold",
          isDark ? "text-rose-300" : "text-rose-700",
        )}
      >
        {title}: {msg}
      </div>
    </div>
  );
}

function PageLoading({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex max-w-5xl flex-col gap-6 animate-pulse">
      <div
        className={cn(
          "rounded-2xl border px-5 py-4 shadow-sm",
          isDark
            ? "border-slate-800 bg-slate-950"
            : "border-slate-200 bg-white",
        )}
      >
        <div
          className={cn(
            "h-7 w-64 rounded",
            isDark ? "bg-slate-800" : "bg-slate-100",
          )}
        />
        <div
          className={cn(
            "mt-2 h-4 w-full max-w-2xl rounded",
            isDark ? "bg-slate-800" : "bg-slate-100",
          )}
        />
        <div
          className={cn(
            "mt-3 h-6 w-40 rounded-full",
            isDark ? "bg-slate-800" : "bg-slate-100",
          )}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div
          className={cn(
            "space-y-4 rounded-2xl border p-5 shadow-sm",
            isDark
              ? "border-slate-800 bg-slate-950"
              : "border-slate-200 bg-white",
          )}
        >
          <div
            className={cn(
              "h-3 w-32 rounded",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />
          <div
            className={cn(
              "h-10 w-full rounded-lg",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />

          <div
            className={cn(
              "h-3 w-40 rounded",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />
          <div
            className={cn(
              "h-10 w-full rounded-lg",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />

          <div
            className={cn(
              "h-3 w-44 rounded",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />
          <div
            className={cn(
              "h-24 w-full rounded-lg",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />

          <div
            className={cn(
              "h-28 w-full rounded-xl",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />
          <div
            className={cn(
              "h-28 w-full rounded-xl",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />

          <div
            className={cn(
              "h-10 w-44 rounded-lg",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />
        </div>

        <div className="space-y-3">
          <div
            className={cn(
              "rounded-2xl border p-4 shadow-sm",
              isDark
                ? "border-slate-800 bg-slate-950"
                : "border-slate-200 bg-white",
            )}
          >
            <div
              className={cn(
                "h-4 w-48 rounded",
                isDark ? "bg-slate-800" : "bg-slate-100",
              )}
            />
            <div
              className={cn(
                "mt-2 h-3 w-80 rounded",
                isDark ? "bg-slate-800" : "bg-slate-100",
              )}
            />
          </div>

          <div
            className={cn(
              "overflow-hidden rounded-2xl border shadow-lg",
              isDark
                ? "border-slate-800 bg-slate-950"
                : "border-slate-200 bg-white",
            )}
          >
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-10 w-10 rounded-2xl",
                    isDark ? "bg-slate-800" : "bg-slate-100",
                  )}
                />
                <div className="flex-1">
                  <div
                    className={cn(
                      "h-3 w-56 rounded",
                      isDark ? "bg-slate-800" : "bg-slate-100",
                    )}
                  />
                  <div
                    className={cn(
                      "mt-2 h-5 w-64 rounded",
                      isDark ? "bg-slate-800" : "bg-slate-100",
                    )}
                  />
                </div>
              </div>
              <div
                className={cn(
                  "mt-4 h-3 w-full max-w-md rounded",
                  isDark ? "bg-slate-800" : "bg-slate-100",
                )}
              />
            </div>
            <div
              className={cn(
                "border-t p-5",
                isDark ? "border-slate-800" : "border-slate-200",
              )}
            >
              <div
                className={cn(
                  "h-3 w-24 rounded",
                  isDark ? "bg-slate-800" : "bg-slate-100",
                )}
              />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-8 rounded-lg",
                      isDark ? "bg-slate-800" : "bg-slate-100",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div
            className={cn(
              "h-3 w-60 rounded",
              isDark ? "bg-slate-800" : "bg-slate-100",
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default function CreateSchedulePageClient() {
  const t = useTranslations("CreateSchedulePage");
  const tSchedulePages = useTranslations("SchedulePagesSettingsPage");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { teamId } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const weekdays = useMemo(
    () => [
      { id: 1, label: t("weekdays.mon") },
      { id: 2, label: t("weekdays.tue") },
      { id: 3, label: t("weekdays.wed") },
      { id: 4, label: t("weekdays.thu") },
      { id: 5, label: t("weekdays.fri") },
      { id: 6, label: t("weekdays.sat") },
      { id: 0, label: t("weekdays.sun") },
    ],
    [t],
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [orgLogoSignedUrl, setOrgLogoSignedUrl] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);

  const [closers, setClosers] = useState<CloserUser[]>([]);
  const [loadingClosers, setLoadingClosers] = useState(false);

  const [selectedCloserId, setSelectedCloserId] = useState<string | null>(null);
  const [selectedGroupCloserIds, setSelectedGroupCloserIds] = useState<
    string[]
  >([]);
  const [primaryCloserId, setPrimaryCloserId] = useState<string | null>(null);
  const [selectedRoundRobinCloserIds, setSelectedRoundRobinCloserIds] =
    useState<string[]>([]);

  const [bookingType, setBookingType] = useState<
    "one_on_one" | "group" | "round_robin"
  >("one_on_one");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);

  const [bufferBefore, setBufferBefore] = useState<string>("0");
  const [bufferAfter, setBufferAfter] = useState<string>("0");
  const [minNoticeHours, setMinNoticeHours] = useState<string>("2");
  const [maxNoticeDays, setMaxNoticeDays] = useState<string>("30");

  const [redirectMode, setRedirectMode] = useState<RedirectMode>("default");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [confirmHeading, setConfirmHeading] = useState(
    t("defaults.confirmHeading"),
  );
  const [confirmSubheading, setConfirmSubheading] = useState(
    t("defaults.confirmSubheading"),
  );

  const [availabilityMode, setAvailabilityMode] =
    useState<AvailabilityMode>("business_hours");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAuthLoading(true);
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();
        if (userError || !userRes.user) {
          router.replace("/login");
          return;
        }
        if (!cancelled) setUserId(userRes.user.id);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    const type = searchParams.get("type");
    if (type === "group" || type === "round_robin" || type === "one_on_one") {
      setBookingType(type);
    } else {
      setBookingType("one_on_one");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!name) {
      setSlug("");
      return;
    }
    setSlug((current) => (current ? current : slugify(name)));
  }, [name]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        setOrgLoading(true);

        const { data: profRow } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", userId)
          .single();

        const companyId: string | null =
          profRow && typeof profRow.company_id === "string"
            ? profRow.company_id
            : null;
        if (!companyId) return;

        const { data: orgRow } = await supabase
          .from("organizations")
          .select("id, name, primary_color, logo_url")
          .eq("id", companyId)
          .single();

        const orgRecord =
          (orgRow as {
            id: string;
            name?: string | null;
            primary_color?: string | null;
            logo_url?: string | null;
          } | null) ?? null;
        if (!orgRecord || cancelled) return;

        const orgInfo: OrgInfo = {
          id: orgRecord.id,
          name: orgRecord.name ?? null,
          primary_color: orgRecord.primary_color ?? null,
          logo_url: orgRecord.logo_url ?? null,
        };

        setOrg(orgInfo);

        if (orgInfo.primary_color && orgInfo.primary_color.trim() !== "") {
          setPrimaryColor(orgInfo.primary_color);
        }

        if (orgInfo.logo_url) {
          if (
            orgInfo.logo_url.startsWith("http://") ||
            orgInfo.logo_url.startsWith("https://")
          ) {
            setOrgLogoSignedUrl(orgInfo.logo_url);
          } else {
            const { data: signed } = await supabase.storage
              .from("org-logos")
              .createSignedUrl(orgInfo.logo_url, 60 * 60 * 24);
            if (!cancelled) setOrgLogoSignedUrl(signed?.signedUrl ?? null);
          }
        } else {
          setOrgLogoSignedUrl(null);
        }
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoadingClosers(true);

        const { data } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, role")
          .eq("team_id", teamId);

        if (cancelled) return;

        const hasCloserRole = (role: unknown) => {
          if (Array.isArray(role)) {
            return role.some(
              (r) =>
                String(r ?? "")
                  .trim()
                  .toLowerCase() === "closer",
            );
          }
          if (typeof role === "string") {
            return role.trim().toLowerCase() === "closer";
          }
          return false;
        };

        const closerUsers: CloserUser[] = (data ?? [])
          .filter((p: any) => hasCloserRole(p.role))
          .map((p: any) => ({
            user_id: String(p.id ?? ""),
            first_name: String(p.first_name ?? ""),
            last_name: String(p.last_name ?? ""),
          }));

        setClosers(closerUsers);

        const defaultPrimary =
          closerUsers.find((c) => c.user_id === userId)?.user_id ??
          closerUsers[0]?.user_id ??
          null;

        setSelectedCloserId(defaultPrimary);
        setPrimaryCloserId(defaultPrimary);

        if (defaultPrimary) {
          const second =
            closerUsers.find((c) => c.user_id !== defaultPrimary)?.user_id ??
            null;
          setSelectedGroupCloserIds(
            second ? [defaultPrimary, second] : [defaultPrimary],
          );
          setSelectedRoundRobinCloserIds(closerUsers.map((c) => c.user_id));
        } else {
          setSelectedGroupCloserIds([]);
          setSelectedRoundRobinCloserIds([]);
        }
      } finally {
        if (!cancelled) setLoadingClosers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, userId]);

  useEffect(() => {
    if (bookingType !== "group") return;
    if (!primaryCloserId) return;
    setSelectedGroupCloserIds((prev) =>
      prev.includes(primaryCloserId) ? prev : [primaryCloserId, ...prev],
    );
  }, [bookingType, primaryCloserId]);

  useEffect(() => {
    if (availabilityMode === "twenty_four_seven") return;
    const s = timeToMinutes(workStart);
    const e = timeToMinutes(workEnd);
    if (s == null) setWorkStart("09:00");
    if (e == null) setWorkEnd("17:00");
  }, [availabilityMode, workStart, workEnd]);

  const gradientA = useMemo(
    () =>
      `linear-gradient(135deg, ${lighten(primaryColor, 0.25)}, ${primaryColor})`,
    [primaryColor],
  );
  const gradientB = useMemo(
    () =>
      `linear-gradient(135deg, ${primaryColor}, ${darken(primaryColor, 0.25)})`,
    [primaryColor],
  );

  const previewHours = useMemo(() => {
    if (availabilityMode === "twenty_four_seven")
      return t("preview.alwaysOpen");
    return `${workStart}–${workEnd}`;
  }, [availabilityMode, workStart, workEnd, t]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !userId) return;

    setError(null);

    if (!name.trim()) return setError(t("errors.nameRequired"));

    const finalSlug = slugify(slug || name);
    if (!finalSlug) return setError(t("errors.slugRequired"));

    const parsedDuration = parseInt(String(durationMinutes || 0), 10) || 0;
    if (parsedDuration < 5) {
      return setError(t("errors.durationMin"));
    }

    const parsedBufferBefore = parseInt(bufferBefore || "0", 10) || 0;
    const parsedBufferAfter = parseInt(bufferAfter || "0", 10) || 0;
    const parsedMinNotice = parseInt(minNoticeHours || "0", 10) || 0;
    const parsedMaxNotice = parseInt(maxNoticeDays || "0", 10) || 0;

    let workStartMin = 0;
    let workEndMin = 24 * 60;
    let workDaysToSave: number[] = [0, 1, 2, 3, 4, 5, 6];

    if (availabilityMode === "business_hours") {
      const s = timeToMinutes(workStart);
      const e2 = timeToMinutes(workEnd);

      if (s == null || e2 == null) {
        return setError(t("errors.invalidTimes"));
      }
      if (e2 <= s) {
        return setError(t("errors.endAfterStart"));
      }
      if (workDays.length === 0) {
        return setError(t("errors.pickDay"));
      }

      workStartMin = s;
      workEndMin = e2;
      workDaysToSave = Array.from(new Set(workDays));
    }

    if (bookingType === "one_on_one" && !selectedCloserId) {
      return setError(t("errors.pickOneOnOneCloser"));
    }

    if (bookingType === "group") {
      if (!primaryCloserId) return setError(t("errors.pickPrimaryCloser"));
      const uniq = Array.from(
        new Set([primaryCloserId, ...selectedGroupCloserIds]),
      ).filter(Boolean);
      if (!uniq.includes(primaryCloserId)) uniq.unshift(primaryCloserId);
      if (uniq.length < 2) {
        return setError(t("errors.groupNeedsTwo"));
      }
    }

    if (bookingType === "round_robin") {
      const uniq = Array.from(new Set(selectedRoundRobinCloserIds)).filter(
        Boolean,
      );
      if (uniq.length < 1) {
        return setError(t("errors.roundRobinNeedsOne"));
      }
    }

    const ownerId =
      bookingType === "one_on_one"
        ? selectedCloserId!
        : bookingType === "group"
          ? (primaryCloserId ?? userId)
          : userId;

    try {
      setSaving(true);

      const payload = {
        team_id: teamId,
        owner_user_id: ownerId,
        source_locale: locale,
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || null,
        primary_color: primaryColor,
        booking_type: bookingType,
        duration_minutes: parsedDuration,
        buffer_before_minutes: parsedBufferBefore,
        buffer_after_minutes: parsedBufferAfter,
        min_notice_hours: parsedMinNotice,
        max_notice_days: parsedMaxNotice,
        timezone_mode: "invitee" as const,
        post_booking_behavior: redirectMode,
        post_booking_redirect_url:
          redirectMode === "external" && redirectUrl.trim()
            ? redirectUrl.trim()
            : null,
        confirmation_heading: confirmHeading.trim() || null,
        confirmation_subheading: confirmSubheading.trim() || null,
        availability_mode: availabilityMode,
        work_start_minute: workStartMin,
        work_end_minute: workEndMin,
        work_days: workDaysToSave,
      };

      const host_user_ids =
        bookingType === "group"
          ? Array.from(new Set([ownerId, ...selectedGroupCloserIds])).filter(
              Boolean,
            )
          : bookingType === "round_robin"
            ? Array.from(new Set(selectedRoundRobinCloserIds)).filter(Boolean)
            : [];

      const response = await crmLocaleFetch("/api/crm/booking-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          host_user_ids,
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        link?: { id?: string };
        error?: string;
        message?: string;
      } | null;

      const insertedRow = result?.link ?? null;

      if (!response.ok || !insertedRow?.id) {
        console.error("[Schedule/new] Insert error", result);
        setError(
          humanizeCreateScheduleError(
            result?.message ?? result?.error,
            t,
          ),
        );
        return;
      }

      router.push("/settings/booking-links");
    } catch (err: any) {
      console.error("[Schedule/new] Unexpected error", err);
      setError(humanizeCreateScheduleError(err?.message, t));
    } finally {
      setSaving(false);
    }
  }

  const pageLoading =
    authLoading || !teamId || !userId || loadingClosers || orgLoading;

  if (pageLoading) return <PageLoading isDark={isDark} />;

  const orgName = org?.name || "FaigataCRM";
  const orgInitial =
    org?.name?.trim()?.charAt(0).toUpperCase() ||
    (name ? name[0]?.toUpperCase() : "F");

  const cardBase = cn(
    "rounded-2xl border shadow-sm",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );

  const labelClass = cn(
    "block text-xs font-semibold uppercase tracking-wide",
    isDark ? "text-slate-400" : "text-slate-500",
  );

  const inputClass = cn(
    "mt-1 w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1",
    isDark
      ? "border-slate-800 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-indigo-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500",
  );

  const helpText = cn(
    "mt-1 text-[11px]",
    isDark ? "text-slate-500" : "text-slate-400",
  );

  const previewSlots =
    availabilityMode === "twenty_four_seven"
      ? [0, 6, 12, 18, 21, 23]
      : (() => {
          const start = timeToMinutes(workStart) ?? 540;
          const end = timeToMinutes(workEnd) ?? 1020;
          const span = Math.max(1, Math.min(6, Math.floor((end - start) / 60)));
          return Array.from({ length: span }, (_, index) =>
            Math.floor(start / 60 + index),
          ).slice(0, 6);
        })();

  const enabledDaysLabel = workDays.length
    ? workDays
        .slice()
        .sort()
        .map((day) => weekdays.find((item) => item.id === day)?.label)
        .filter(Boolean)
        .join(", ")
    : t("availability.none");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className={cn(cardBase, "px-5 py-4")}>
        <h1
          className={cn(
            "text-2xl font-semibold",
            isDark ? "text-slate-100" : "text-slate-900",
          )}
        >
          {t("page.title")}
        </h1>
        <p
          className={cn(
            "mt-1 text-sm",
            isDark ? "text-slate-300" : "text-slate-600",
          )}
        >
          {t("page.description")}
        </p>

        <div
          className={cn(
            "mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
            isDark
              ? "bg-slate-900 text-slate-200"
              : "bg-slate-100 text-slate-700",
          )}
        >
          {bookingType === "one_on_one" && tSchedulePages("badges.oneOnOne")}
          {bookingType === "group" && tSchedulePages("badges.group")}
          {bookingType === "round_robin" &&
            tSchedulePages("badges.roundRobin")}
        </div>

        {!!error && (
          <ErrorBox msg={error} isDark={isDark} title={t("common.error")} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <form onSubmit={handleSubmit} className={cn(cardBase, "space-y-4 p-5")}>
          <div>
            <label className={labelClass}>{t("fields.meetingName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("placeholders.meetingName")}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("fields.publicSlug")}</label>
            <div className="mt-1 flex items-center gap-1 text-sm">
              <span
                className={cn(
                  "rounded-lg border px-2 py-1 text-xs",
                  isDark
                    ? "border-slate-800 bg-slate-900 text-slate-300"
                    : "border-slate-200 bg-slate-50 text-slate-500",
                )}
              >
                /b/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder={t("placeholders.publicSlug")}
                className={cn(inputClass, "mt-0 flex-1")}
              />
            </div>
            <p className={helpText}>{t("help.publicSlug")}</p>
          </div>

          <div>
            <label className={labelClass}>
              {t("fields.descriptionOptional")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("placeholders.description")}
              className={inputClass}
            />
          </div>

          <HostSelectionSection
            bookingType={bookingType}
            closers={closers}
            loadingClosers={loadingClosers}
            isDark={isDark}
            labelClass={labelClass}
            inputClass={inputClass}
            helpText={helpText}
            selectedCloserId={selectedCloserId}
            setSelectedCloserId={setSelectedCloserId}
            primaryCloserId={primaryCloserId}
            setPrimaryCloserId={setPrimaryCloserId}
            selectedGroupCloserIds={selectedGroupCloserIds}
            setSelectedGroupCloserIds={setSelectedGroupCloserIds}
            selectedRoundRobinCloserIds={selectedRoundRobinCloserIds}
            setSelectedRoundRobinCloserIds={setSelectedRoundRobinCloserIds}
          />

          <div
            className={cn(
              "mt-3 space-y-2 rounded-xl border px-3 py-3",
              isDark
                ? "border-slate-800 bg-slate-900/40"
                : "border-slate-200 bg-slate-50",
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  {t("sections.duration.title")}
                </p>
                <p
                  className={cn(
                    "text-[11px]",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  {t("sections.duration.description")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={durationMinutes}
                  onChange={(e) =>
                    setDurationMinutes(parseInt(e.target.value || "0", 10) || 0)
                  }
                  className={cn(
                    "w-24 rounded-lg border px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1",
                    isDark
                      ? "border-slate-800 bg-slate-950 text-slate-100 focus:border-indigo-400 focus:ring-indigo-400"
                      : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px]",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  {t("common.minutes")}
                </span>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl border px-3 py-3",
              isDark
                ? "border-slate-800 bg-slate-900/40"
                : "border-slate-200 bg-slate-50",
            )}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  {t("sections.buffers.title")}
                </p>
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("fields.bufferBefore")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={bufferBefore}
                      onChange={(e) => setBufferBefore(e.target.value)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1",
                        isDark
                          ? "border-slate-800 bg-slate-950 text-slate-100 focus:border-indigo-400 focus:ring-indigo-400"
                          : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("common.min")}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("fields.bufferAfter")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={bufferAfter}
                      onChange={(e) => setBufferAfter(e.target.value)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1",
                        isDark
                          ? "border-slate-800 bg-slate-950 text-slate-100 focus:border-indigo-400 focus:ring-indigo-400"
                          : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("common.min")}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    isDark ? "text-slate-400" : "text-slate-500",
                  )}
                >
                  {t("sections.bookingWindow.title")}
                </p>
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("fields.minNotice")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={minNoticeHours}
                      onChange={(e) => setMinNoticeHours(e.target.value)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1",
                        isDark
                          ? "border-slate-800 bg-slate-950 text-slate-100 focus:border-indigo-400 focus:ring-indigo-400"
                          : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("common.hours")}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("fields.maxNotice")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={maxNoticeDays}
                      onChange={(e) => setMaxNoticeDays(e.target.value)}
                      className={cn(
                        "w-full rounded-lg border px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1",
                        isDark
                          ? "border-slate-800 bg-slate-950 text-slate-100 focus:border-indigo-400 focus:ring-indigo-400"
                          : "border-slate-300 bg-white text-slate-900 focus:border-indigo-500 focus:ring-indigo-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("common.days")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "space-y-2 rounded-xl border px-3 py-3",
              isDark
                ? "border-slate-800 bg-slate-900/40"
                : "border-slate-200 bg-slate-50",
            )}
          >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wide",
                isDark ? "text-slate-400" : "text-slate-500",
              )}
            >
              {t("sections.availability.title")}
            </p>

            <div
              className={cn(
                "flex flex-col gap-2 text-[11px]",
                isDark ? "text-slate-300" : "text-slate-600",
              )}
            >
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  className="h-3 w-3"
                  checked={availabilityMode === "business_hours"}
                  onChange={() => setAvailabilityMode("business_hours")}
                />
                {t("availability.businessHours")}
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  className="h-3 w-3"
                  checked={availabilityMode === "twenty_four_seven"}
                  onChange={() => setAvailabilityMode("twenty_four_seven")}
                />
                {t("availability.twentyFourSeven")}
              </label>
            </div>

            {availabilityMode === "business_hours" && (
              <div className="mt-2 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className={cn(
                        "block text-[11px] font-medium",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("fields.startTime")}
                    </label>
                    <input
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className={cn(inputClass, "cursor-pointer")}
                    />
                  </div>

                  <div>
                    <label
                      className={cn(
                        "block text-[11px] font-medium",
                        isDark ? "text-slate-400" : "text-slate-500",
                      )}
                    >
                      {t("fields.endTime")}
                    </label>
                    <input
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className={cn(inputClass, "cursor-pointer")}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className={cn(
                      "block cursor-pointer text-[11px] font-medium",
                      isDark ? "text-slate-400" : "text-slate-500",
                    )}
                  >
                    {t("fields.days")}
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {weekdays.map((d) => {
                      const active = workDays.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setWorkDays((prev) =>
                              prev.includes(d.id)
                                ? prev.filter((x) => x !== d.id)
                                : [...prev, d.id],
                            );
                          }}
                          className={cn(
                            "cursor-pointer rounded-lg border px-3 py-1.5 text-[11px] font-semibold",
                            active
                              ? isDark
                                ? "border-indigo-500/40 bg-indigo-950/40 text-indigo-200"
                                : "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : isDark
                                ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-[11px]",
                      isDark ? "text-slate-400" : "text-slate-500",
                    )}
                  >
                    {t("availability.daysHelp")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>{t("fields.primaryColor")}</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className={cn(
                  "h-9 w-9 cursor-pointer rounded border p-0",
                  isDark
                    ? "border-slate-800 bg-slate-950"
                    : "border-slate-300 bg-white",
                )}
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className={cn(inputClass, "mt-0 flex-1")}
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {saving ? t("actions.creating") : t("actions.create")}
            </button>
          </div>
        </form>

        <SchedulePagePreview
          isDark={isDark}
          cardBaseClass={cardBase}
          previewHours={previewHours}
          orgLogoSignedUrl={orgLogoSignedUrl}
          orgName={orgName}
          orgInitial={orgInitial}
          bookingType={bookingType}
          durationMinutes={durationMinutes}
          name={name}
          description={description}
          gradientA={gradientA}
          gradientB={gradientB}
          previewSlots={previewSlots}
          availabilityMode={availabilityMode}
          enabledDaysLabel={enabledDaysLabel}
          bufferBeforeMinutes={parseInt(bufferBefore || "0", 10) || 0}
          bufferAfterMinutes={parseInt(bufferAfter || "0", 10) || 0}
          minNoticeHoursValue={parseInt(minNoticeHours || "0", 10) || 0}
          maxNoticeDaysValue={parseInt(maxNoticeDays || "0", 10) || 0}
        />
      </div>
    </div>
  );
}
