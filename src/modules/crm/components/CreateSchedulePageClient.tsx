"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";

/* ------------------------- helpers ------------------------- */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function lighten(color: string, amount = 0.2): string {
  if (!/^#?[0-9a-f]{6}$/i.test(color)) return color;
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const adj = (c: number) => Math.min(255, Math.max(0, c + 255 * amount)) | 0;
  return `#${adj(r).toString(16).padStart(2, "0")}${adj(g)
    .toString(16)
    .padStart(2, "0")}${adj(b).toString(16).padStart(2, "0")}`;
}

function darken(color: string, amount = 0.2): string {
  if (!/^#?[0-9a-f]{6}$/i.test(color)) return color;
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const adj = (c: number) => Math.min(255, Math.max(0, c - 255 * amount)) | 0;
  return `#${adj(r).toString(16).padStart(2, "0")}${adj(g)
    .toString(16)
    .padStart(2, "0")}${adj(b).toString(16).padStart(2, "0")}`;
}

function timeToMinutes(t: string) {
  const [hh, mm] = (t || "").split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

const WEEKDAYS: { id: number; label: string }[] = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 0, label: "Sun" },
];

/* ------------------------- types ------------------------- */

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

/* ------------------------- loading UI ------------------------- */

function PageLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl animate-pulse">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="h-7 w-64 rounded bg-slate-100" />
        <div className="mt-2 h-4 w-full max-w-2xl rounded bg-slate-100" />
        <div className="mt-3 h-6 w-40 rounded-full bg-slate-100" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-3 w-32 rounded bg-slate-100" />
          <div className="h-10 w-full rounded-lg bg-slate-100" />

          <div className="h-3 w-40 rounded bg-slate-100" />
          <div className="h-10 w-full rounded-lg bg-slate-100" />

          <div className="h-3 w-44 rounded bg-slate-100" />
          <div className="h-24 w-full rounded-lg bg-slate-100" />

          <div className="h-28 w-full rounded-xl bg-slate-100" />
          <div className="h-28 w-full rounded-xl bg-slate-100" />

          <div className="h-10 w-44 rounded-lg bg-slate-100" />
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-4 w-48 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-80 rounded bg-slate-100" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-slate-100" />
                <div className="flex-1">
                  <div className="h-3 w-56 rounded bg-slate-100" />
                  <div className="mt-2 h-5 w-64 rounded bg-slate-100" />
                </div>
              </div>
              <div className="mt-4 h-3 w-full max-w-md rounded bg-slate-100" />
            </div>
            <div className="border-t border-slate-200 p-5">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 rounded-lg bg-slate-100" />
                ))}
              </div>
            </div>
          </div>

          <div className="h-3 w-60 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export default function CreateSchedulePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { teamId } = useWorkspace();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // org info (for preview header)
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [orgLogoSignedUrl, setOrgLogoSignedUrl] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);

  // closers
  const [closers, setClosers] = useState<CloserUser[]>([]);
  const [loadingClosers, setLoadingClosers] = useState(false);

  // one-on-one selection
  const [selectedCloserId, setSelectedCloserId] = useState<string | null>(null);

  // group selection (multi + primary)
  const [selectedGroupCloserIds, setSelectedGroupCloserIds] = useState<
    string[]
  >([]);
  const [primaryCloserId, setPrimaryCloserId] = useState<string | null>(null);

  // round robin selection (multi)
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
  const [confirmHeading, setConfirmHeading] = useState("You're booked!");
  const [confirmSubheading, setConfirmSubheading] = useState(
    "We’ve sent a calendar invite to your email.",
  );

  // availability config
  const [availabilityMode, setAvailabilityMode] =
    useState<AvailabilityMode>("business_hours");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  /* Load current user */
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

  /* Read type from query param */
  useEffect(() => {
    const t = searchParams.get("type");
    if (t === "group" || t === "round_robin" || t === "one_on_one")
      setBookingType(t);
    else setBookingType("one_on_one");
  }, [searchParams]);

  /* Auto slug from name */
  useEffect(() => {
    if (!name) {
      setSlug("");
      return;
    }
    setSlug((current) => (current ? current : slugify(name)));
  }, [name]);

  /* Load org */
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

        const companyId: string | null = profRow?.company_id ?? null;
        if (!companyId) return;

        const { data: orgRow } = await supabase
          .from("organizations")
          .select("id, name, primary_color, logo_url")
          .eq("id", companyId)
          .single();

        if (!orgRow || cancelled) return;

        const orgInfo: OrgInfo = {
          id: orgRow.id,
          name: orgRow.name ?? null,
          primary_color: orgRow.primary_color ?? null,
          logo_url: orgRow.logo_url ?? null,
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

  /* Load closers */
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

        const hasCloserRole = (role: any) => {
          if (Array.isArray(role))
            return role.some(
              (r) =>
                String(r ?? "")
                  .trim()
                  .toLowerCase() === "closer",
            );
          if (typeof role === "string")
            return String(role).trim().toLowerCase() === "closer";
          return false;
        };

        const closerUsers: CloserUser[] = (data ?? [])
          .filter((p: any) => hasCloserRole(p.role))
          .map((p: any) => ({
            user_id: p.id,
            first_name: p.first_name ?? "",
            last_name: p.last_name ?? "",
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

  // Ensure primary closer stays included for group
  useEffect(() => {
    if (bookingType !== "group") return;
    if (!primaryCloserId) return;
    setSelectedGroupCloserIds((prev) =>
      prev.includes(primaryCloserId) ? prev : [primaryCloserId, ...prev],
    );
  }, [bookingType, primaryCloserId]);

  // Validate/normalize business hours inputs when mode changes
  useEffect(() => {
    if (availabilityMode === "twenty_four_seven") return;
    const s = timeToMinutes(workStart);
    const e = timeToMinutes(workEnd);
    if (s == null) setWorkStart("09:00");
    if (e == null) setWorkEnd("17:00");
  }, [availabilityMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (availabilityMode === "twenty_four_seven") return "24/7";
    return `${workStart}–${workEnd}`;
  }, [availabilityMode, workStart, workEnd]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !userId) return;

    setError(null);

    if (!name.trim()) return setError("Please give your schedule page a name.");

    const finalSlug = slugify(slug || name);
    if (!finalSlug) return setError("Slug can’t be empty.");

    const parsedDuration = parseInt(String(durationMinutes || 0), 10) || 0;
    if (parsedDuration < 5)
      return setError("Duration must be at least 5 minutes.");

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

      if (s == null || e2 == null)
        return setError("Please set valid start/end times.");
      if (e2 <= s) return setError("End time must be after start time.");
      if (workDays.length === 0)
        return setError("Please select at least one day for availability.");

      workStartMin = s;
      workEndMin = e2;
      workDaysToSave = Array.from(new Set(workDays));
    }

    if (bookingType === "one_on_one" && !selectedCloserId) {
      return setError("Please choose who this one-on-one is with.");
    }

    if (bookingType === "group") {
      if (!primaryCloserId) return setError("Please choose a primary closer.");
      const uniq = Array.from(
        new Set([primaryCloserId, ...selectedGroupCloserIds]),
      ).filter(Boolean);
      if (!uniq.includes(primaryCloserId)) uniq.unshift(primaryCloserId);
      if (uniq.length < 2)
        return setError(
          "Please select at least 2 closers for a group schedule page.",
        );
    }

    if (bookingType === "round_robin") {
      const uniq = Array.from(new Set(selectedRoundRobinCloserIds)).filter(
        Boolean,
      );
      if (uniq.length < 1)
        return setError("Please select at least 1 closer for round robin.");
    }

    const ownerId =
      bookingType === "one_on_one"
        ? selectedCloserId!
        : bookingType === "group"
          ? (primaryCloserId ?? userId)
          : userId;

    try {
      setSaving(true);

      const payload: any = {
        team_id: teamId,
        owner_user_id: ownerId,
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

        timezone_mode: "invitee",

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

      const { data: inserted, error: insertError } = await supabase
        .from("booking_links")
        .insert([payload])
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        console.error("[Schedule/new] Insert error", insertError);
        setError(insertError?.message ?? "Failed to create schedule page.");
        return;
      }

      if (bookingType === "group") {
        const uniq = Array.from(
          new Set([ownerId, ...selectedGroupCloserIds]),
        ).filter(Boolean);
        if (!uniq.includes(ownerId)) uniq.unshift(ownerId);

        const rows = uniq.map((uid) => ({
          booking_link_id: inserted.id,
          user_id: uid,
        }));
        const { error: hostsErr } = await supabase
          .from("booking_link_hosts")
          .insert(rows);
        if (hostsErr) {
          console.error(
            "[Schedule/new] booking_link_hosts insert error",
            hostsErr,
          );
          setError(
            hostsErr.message ?? "Created page, but failed to save group hosts.",
          );
          return;
        }
      }

      if (bookingType === "round_robin") {
        const uniq = Array.from(new Set(selectedRoundRobinCloserIds)).filter(
          Boolean,
        );
        const rows = uniq.map((uid) => ({
          booking_link_id: inserted.id,
          user_id: uid,
        }));
        const { error: hostsErr } = await supabase
          .from("booking_link_hosts")
          .insert(rows);
        if (hostsErr) {
          console.error(
            "[Schedule/new] booking_link_hosts insert error",
            hostsErr,
          );
          setError(
            hostsErr.message ??
              "Created page, but failed to save round robin pool.",
          );
          return;
        }
      }

      router.push("/settings/booking-links");
    } catch (err: any) {
      console.error("[Schedule/new] Unexpected error", err);
      setError(String(err?.message ?? "Unexpected error"));
    } finally {
      setSaving(false);
    }
  }

  const pageLoading =
    authLoading || !teamId || !userId || loadingClosers || orgLoading; // you can drop orgLoading if you want the page to render without org preview

  if (pageLoading) return <PageLoading />;

  const orgName = org?.name || "FaigataCRM";
  const orgInitial =
    org?.name?.trim()?.charAt(0).toUpperCase() ||
    (name ? name[0]?.toUpperCase() : "F");

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          Create Schedule Page
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Pick a name, URL, and primary color. Choose which closers are included
          based on the type.
        </p>
        <div className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {bookingType === "one_on_one" && "Type: One-on-one"}
          {bookingType === "group" && "Type: Group meeting"}
          {bookingType === "round_robin" && "Type: Round robin"}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* ---- form ---- */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Meeting name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sales Discovery Call"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Public URL slug
            </label>
            <div className="mt-1 flex items-center gap-1 text-sm">
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                /b/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="sales-discovery-call"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              This becomes the shareable link you’ll send to leads.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Choose a time that works for you. We’ll send a calendar invite after you confirm."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* ---- host selection sections (unchanged UI) ---- */}
          {bookingType === "one_on_one" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Host (Closer)
              </label>
              {closers.length === 0 ? (
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  No teammates with role{" "}
                  <span className="font-semibold">Closer</span> found.
                </p>
              ) : (
                <>
                  <select
                    value={selectedCloserId ?? ""}
                    onChange={(e) =>
                      setSelectedCloserId(e.target.value || null)
                    }
                    disabled={loadingClosers}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {closers.map((c) => {
                      const fullName =
                        `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                        "Unnamed user";
                      return (
                        <option key={c.user_id} value={c.user_id}>
                          {fullName}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Lead books directly with this closer.
                  </p>
                </>
              )}
            </div>
          )}

          {bookingType === "group" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Required closers (must attend)
              </label>

              {closers.length === 0 ? (
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  No teammates with role{" "}
                  <span className="font-semibold">Closer</span> found.
                </p>
              ) : (
                <>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Primary closer (assigned on lead)
                    </div>
                    <select
                      value={primaryCloserId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        setPrimaryCloserId(v);
                        if (v && !selectedGroupCloserIds.includes(v)) {
                          setSelectedGroupCloserIds((prev) => [v, ...prev]);
                        }
                      }}
                      disabled={loadingClosers}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    >
                      {closers.map((c) => {
                        const fullName =
                          `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                          "Unnamed user";
                        return (
                          <option key={c.user_id} value={c.user_id}>
                            {fullName}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Select required attendees
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {closers.map((c) => {
                        const id = c.user_id;
                        const full =
                          `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                          "Unnamed user";
                        const checked = selectedGroupCloserIds.includes(id);
                        const isPrimary = primaryCloserId === id;

                        return (
                          <label
                            key={id}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked || isPrimary}
                              disabled={isPrimary}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? Array.from(
                                      new Set([...selectedGroupCloserIds, id]),
                                    )
                                  : selectedGroupCloserIds.filter(
                                      (x) => x !== id,
                                    );

                                const ensured = primaryCloserId
                                  ? next.includes(primaryCloserId)
                                    ? next
                                    : [primaryCloserId, ...next]
                                  : next;

                                setSelectedGroupCloserIds(ensured);
                              }}
                            />
                            <span className="font-medium text-slate-900">
                              {full}
                            </span>
                            {isPrimary && (
                              <span className="ml-auto text-[11px] font-semibold text-indigo-600">
                                Primary
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500">
                      Availability is the overlap of all selected calendars.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {bookingType === "round_robin" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Round robin closers (pool)
              </label>

              {closers.length === 0 ? (
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                  No teammates with role{" "}
                  <span className="font-semibold">Closer</span> found.
                </p>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Select which closers can be assigned
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {closers.map((c) => {
                      const id = c.user_id;
                      const full =
                        `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() ||
                        "Unnamed user";
                      const checked = selectedRoundRobinCloserIds.includes(id);

                      return (
                        <label
                          key={id}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedRoundRobinCloserIds((prev) => {
                                if (e.target.checked)
                                  return Array.from(new Set([...prev, id]));
                                return prev.filter((x) => x !== id);
                              });
                            }}
                          />
                          <span className="font-medium text-slate-900">
                            {full}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <p className="mt-2 text-[11px] text-slate-500">
                    Leads will see times where{" "}
                    <span className="font-semibold">at least one</span> closer
                    is free. At booking time, we randomly assign one of the
                    available closers for the chosen slot.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Duration */}
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Duration
                </p>
                <p className="text-[11px] text-slate-500">
                  Set how long this meeting should last.
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
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-500">minutes</span>
              </div>
            </div>
          </div>

          {/* Buffers & booking window */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Buffers
                </p>
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="text-[11px] text-slate-500">Before</span>
                    <input
                      type="number"
                      min={0}
                      value={bufferBefore}
                      onChange={(e) => setBufferBefore(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500">min</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="text-[11px] text-slate-500">After</span>
                    <input
                      type="number"
                      min={0}
                      value={bufferAfter}
                      onChange={(e) => setBufferAfter(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500">min</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Booking window
                </p>
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      Min notice
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={minNoticeHours}
                      onChange={(e) => setMinNoticeHours(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500">hours</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      Max notice
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={maxNoticeDays}
                      onChange={(e) => setMaxNoticeDays(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] text-slate-500">days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Availability */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Availability
            </p>

            <div className="flex flex-col gap-2 text-[11px] text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  className="h-3 w-3"
                  checked={availabilityMode === "business_hours"}
                  onChange={() => setAvailabilityMode("business_hours")}
                />
                Business hours (set days + time window)
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  className="h-3 w-3"
                  checked={availabilityMode === "twenty_four_seven"}
                  onChange={() => setAvailabilityMode("twenty_four_seven")}
                />
                24/7 (leads can book any time)
              </label>
            </div>

            {availabilityMode === "business_hours" && (
              <div className="mt-2 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">
                      Start time
                    </label>
                    <input
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">
                      End time
                    </label>
                    <input
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 cursor-pointer">
                    Days
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
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
                          className={[
                            "rounded-lg border px-3 py-1.5 text-[11px] font-semibold cursor-pointer",
                            active
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Availability will be limited to these days and times in the
                    invitee’s timezone.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Primary color */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Primary color
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-rose-600">{error}</p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Creating…" : "Create Schedule Page"}
            </button>
          </div>
        </form>

        {/* ---- preview ---- */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Preview schedule page
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Rough preview of the public booking page. (Availability range
              preview: <span className="font-semibold">{previewHours}</span>)
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950/90 shadow-lg">
            <div
              className="px-6 py-5 text-white"
              style={{ backgroundImage: gradientA }}
            >
              <div className="flex items-center gap-3">
                {orgLogoSignedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={orgLogoSignedUrl}
                    alt={orgName}
                    className="h-10 w-10 rounded-2xl border border-white/20 bg-white/10 object-cover"
                    style={{ boxShadow: "0 10px 30px rgba(15,23,42,0.45)" }}
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xs font-semibold uppercase"
                    style={{ boxShadow: "0 10px 30px rgba(15,23,42,0.45)" }}
                  >
                    {orgInitial}
                  </div>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wide text-white/70">
                    Booking with {orgName} ·{" "}
                    {bookingType === "one_on_one"
                      ? "1:1"
                      : bookingType === "group"
                        ? "Group"
                        : "Round robin"}{" "}
                    · {durationMinutes} min
                  </p>
                  <h3 className="text-lg font-semibold">
                    {name || "Sales Discovery Call"}
                  </h3>
                </div>
              </div>

              <p className="mt-3 max-w-md text-xs text-white/80">
                {description ||
                  "Choose a time that works for you. We’ll send a calendar invite after you confirm."}
              </p>
            </div>

            <div className="grid gap-0 border-t border-slate-800 bg-slate-950/95 text-slate-100 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border-b border-slate-800 px-5 py-4 sm:border-r">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Your details
                </p>
                <div className="mt-3 space-y-2 text-[11px]">
                  <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-slate-400">
                    First Name
                  </div>
                  <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-slate-400">
                    name@example.com
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Pick a time
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(availabilityMode === "twenty_four_seven"
                    ? [0, 6, 12, 18, 21, 23]
                    : (() => {
                        const s = timeToMinutes(workStart) ?? 540;
                        const e = timeToMinutes(workEnd) ?? 1020;
                        const span = Math.max(
                          1,
                          Math.min(6, Math.floor((e - s) / 60)),
                        );
                        const baseHours = Array.from({ length: span }, (_, i) =>
                          Math.floor(s / 60 + i),
                        );
                        return baseHours.slice(0, 6);
                      })()
                  ).map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-[11px] font-medium text-slate-100 hover:border-indigo-400 hover:bg-slate-900"
                      style={{
                        backgroundImage: gradientB,
                        backgroundSize: "200% 200%",
                        backgroundPosition: "0% 50%",
                      }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </button>
                  ))}
                </div>

                {availabilityMode === "business_hours" && (
                  <p className="mt-3 text-[11px] text-slate-400">
                    Days enabled:{" "}
                    <span className="font-semibold">
                      {workDays.length
                        ? workDays
                            .slice()
                            .sort()
                            .map((d) => WEEKDAYS.find((x) => x.id === d)?.label)
                            .join(", ")
                        : "None"}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Note: Preview how the page is going to look like!
          </p>
        </div>
      </div>
    </div>
  );
}
