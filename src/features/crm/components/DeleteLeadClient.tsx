"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/features/crm/data/leadFields";
import type {
  LeadContactType,
  LeadFieldDefinition,
  LeadGender,
  LeadSourceCategory,
  LeadSourceName,
  LeadType,
} from "@/features/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useAppLocale } from "@/context/LocaleContext";
import {
  contactHref,
  getLeadFieldSelectLabel,
  normalizeLeadKey,
  normalizeUrl,
  safeValue,
} from "@/features/crm/utils/lead";
import {
  getLeadContactTypeLabel,
  getLeadGenderLabel,
  getLeadSourceCategoryLabel,
  getLeadSourceNameLabel,
  getLeadTypeLabel,
} from "@/i18n/domain-values";

interface LeadRow {
  id: string;
  team_id: string;
  stage: string;

  lead_name?: string | null;

  niche?: string | null;
  lead_type?: LeadType;
  gender?: LeadGender;

  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;

  primary_contact_type?: LeadContactType;
  primary_contact_value?: string | null;

  source_category?: LeadSourceCategory;
  source_name?: LeadSourceName;

  custom_values: Record<string, unknown> | null;
  display_values?: Record<string, string | null> | null;
}

function isLikelyLinkField(def: LeadFieldDefinition) {
  const t = String((def as { type?: unknown })?.type ?? "").toLowerCase();
  if (t === "link" || t === "url") return true;

  const k = String(def.key ?? "").toLowerCase();
  return k.includes("url") || k.includes("link") || k.includes("website");
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Delete preview remains source-value safe.
 * Human-readable display is allowed, but destructive behavior must stay keyed by DB id only.
 */
function getLeadDisplayName(
  lead: Pick<LeadRow, "lead_name" | "custom_values" | "display_values">,
  emptyLabel: string,
) {
  const translated = getString(lead.display_values?.lead_name);
  if (translated) return translated;

  const direct = getString(lead.lead_name);
  if (direct) return direct;

  const cv = (lead.custom_values ?? {}) as Record<string, unknown>;
  return (
    getString(cv.lead_name) ||
    getString(cv.name) ||
    getString(cv.full_name) ||
    getString(cv.email) ||
    emptyLabel
  );
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

/* -------------------- loading UI -------------------- */

function SkeletonBlock({
  className = "",
  isDark,
}: {
  className?: string;
  isDark: boolean;
}) {
  return (
    <div
      className={[
        "animate-pulse rounded-lg",
        isDark ? "bg-slate-800" : "bg-slate-100",
        className,
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

function DeleteLeadLoadingState({ isDark }: { isDark: boolean }) {
  const dangerShell = isDark
    ? "border-rose-900/60 bg-rose-950/35"
    : "border-rose-100 bg-rose-50";
  const dangerIconShell = isDark ? "bg-rose-500/10" : "bg-rose-100";

  const cardShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const softPanel = isDark
    ? "border-slate-900 bg-slate-900/40"
    : "border-slate-100 bg-slate-50";
  const innerCard = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl space-y-6">
        <div
          className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${dangerShell}`}
        >
          <div
            className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${dangerIconShell}`}
          >
            <SkeletonBlock
              isDark={isDark}
              className={
                isDark
                  ? "h-4 w-4 rounded-full bg-rose-500/20"
                  : "h-4 w-4 rounded-full bg-rose-200"
              }
            />
          </div>
          <div className="flex-1">
            <SkeletonBlock
              isDark={isDark}
              className={
                isDark ? "h-5 w-56 bg-rose-500/15" : "h-5 w-56 bg-rose-100"
              }
            />
            <SkeletonBlock
              isDark={isDark}
              className={
                isDark
                  ? "mt-2 h-4 w-full max-w-[520px] bg-rose-500/10"
                  : "mt-2 h-4 w-full max-w-[520px] bg-rose-100"
              }
            />
            <SkeletonBlock
              isDark={isDark}
              className={
                isDark
                  ? "mt-2 h-4 w-full max-w-[420px] bg-rose-500/10"
                  : "mt-2 h-4 w-full max-w-[420px] bg-rose-100"
              }
            />
          </div>
        </div>

        <div className={`rounded-2xl border px-5 py-4 shadow-sm ${cardShell}`}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <SkeletonBlock isDark={isDark} className="h-4 w-28" />
              <SkeletonBlock
                isDark={isDark}
                className="mt-2 h-3 w-64 max-w-full"
              />
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${
                isDark ? "bg-indigo-500/10" : "bg-indigo-50"
              }`}
            >
              <SkeletonBlock
                isDark={isDark}
                className={
                  isDark
                    ? "h-3 w-10 bg-indigo-500/15"
                    : "h-3 w-10 bg-indigo-100"
                }
              />
              <SkeletonBlock
                isDark={isDark}
                className={
                  isDark
                    ? "h-5 w-16 rounded-full bg-indigo-500/25"
                    : "h-5 w-16 rounded-full bg-indigo-200"
                }
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`rounded-xl border px-3 py-2 ${softPanel}`}
              >
                <SkeletonBlock isDark={isDark} className="h-3 w-24" />
                <SkeletonBlock
                  isDark={isDark}
                  className="mt-2 h-4 w-44 max-w-full"
                />
              </div>
            ))}
          </div>

          <div className={`mt-4 rounded-xl border px-4 py-3 ${softPanel}`}>
            <SkeletonBlock isDark={isDark} className="h-3 w-32" />
            <SkeletonBlock
              isDark={isDark}
              className="mt-2 h-3 w-64 max-w-full"
            />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-xl border px-3 py-2 ${innerCard}`}
                >
                  <SkeletonBlock isDark={isDark} className="h-3 w-24" />
                  <SkeletonBlock
                    isDark={isDark}
                    className="mt-2 h-4 w-44 max-w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <SkeletonBlock isDark={isDark} className="h-10 w-28 rounded-lg" />
            <SkeletonBlock isDark={isDark} className="h-10 w-20 rounded-lg" />
          </div>
        </div>

        <SkeletonBlock isDark={isDark} className="h-3 w-56" />
      </div>
    </div>
  );
}

/* -------------------- component -------------------- */

export function DeleteLeadClient() {
  const t = useTranslations("DeleteLeadPage");
  const tLeads = useTranslations("LeadsPage");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");
  const { locale } = useAppLocale();

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) return;

      if (!teamId || !id) {
        if (!cancelled) {
          setLoading(false);
          setError(t("errors.missingTeamOrLeadId"));
          setLead(null);
          setFields([]);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setError(null);
        setLead(null);
        setFields([]);
      }

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          if (!cancelled) {
            setError(t("errors.loadFailed"));
            setLead(null);
            setFields([]);
          }
          return;
        }

        const [defs, leadResponse] = await Promise.all([
          getLeadFieldDefinitions(teamId, locale),
          fetch(
            `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(id)}`,
            {
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "x-faigata-locale": locale,
              },
            },
          ),
        ]);

        if (cancelled) return;

        const leadPayload = (await leadResponse.json().catch(() => null)) as
          | LeadRow
          | { error?: string | null }
          | null;

        if (!leadResponse.ok || !leadPayload || !("team_id" in leadPayload)) {
          console.error("[DeleteLead] failed to load lead", leadPayload);
          setError(t("errors.loadFailed"));
          setLead(null);
          setFields(defs ?? []);
          return;
        }

        if (leadPayload.team_id !== teamId) {
          console.warn(
            "[DeleteLead] lead team mismatch",
            leadPayload.team_id,
            teamId,
          );
          setError(t("errors.workspaceMismatch"));
          setLead(null);
          setFields(defs ?? []);
          return;
        }

        setFields(defs ?? []);
        setLead(leadPayload);
        setError(null);
      } catch (err) {
        console.error("[DeleteLead] unexpected load error", err);
        if (!cancelled) {
          setError(t("errors.loadFailed"));
          setLead(null);
          setFields([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, teamId, workspaceLoading, t, locale]);

  async function handleConfirmDelete() {
    if (!teamId || !id || deleting) return;

    setDeleting(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError(t("errors.deleteFailed"));
        return;
      }

      const response = await fetch(
        `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-faigata-locale": locale,
          },
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.error("[DeleteLead] failed to delete lead", payload);
        setError(t("errors.deleteFailed"));
        return;
      }

      router.push("/leads");
      router.refresh();
    } catch (err) {
      console.error("[DeleteLead] unexpected delete error", err);
      setError(t("errors.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  const pageText = isDark ? "text-slate-200" : "text-slate-800";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const dangerShell = isDark
    ? "border-rose-900/60 bg-rose-950/35"
    : "border-rose-100 bg-rose-50";
  const dangerIconShell = isDark ? "bg-rose-500/10" : "bg-rose-100";
  const dangerTitle = isDark ? "text-rose-100" : "text-rose-900";
  const dangerBody = isDark ? "text-rose-200/90" : "text-rose-800";
  const dangerIconText = isDark ? "text-rose-300" : "text-rose-600";

  const cardShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";
  const softPanel = isDark
    ? "border-slate-900 bg-slate-900/40"
    : "border-slate-100 bg-slate-50";
  const innerCard = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";

  const linkCls = isDark
    ? "text-indigo-300 hover:text-indigo-200"
    : "text-indigo-600 hover:text-indigo-700";

  const stageWrap = isDark ? "bg-indigo-500/10" : "bg-indigo-50";
  const stageLabel = isDark ? "text-slate-300" : "text-slate-500";
  const stagePill = isDark
    ? "bg-indigo-500/25 text-indigo-100"
    : "bg-indigo-600 text-white";

  const deleteBtn = "bg-rose-600 hover:bg-rose-700 text-white";
  const cancelLink = isDark
    ? "text-slate-300 hover:text-slate-100"
    : "text-slate-600 hover:text-slate-800";

  const emptyLabel = tDomain("fallbacks.empty");
  const dashLabel = "—";

  const customValues = useMemo(
    () => (lead?.custom_values ?? {}) as Record<string, unknown>,
    [lead],
  );
  const displayValues = useMemo(() => {
    const values: Record<string, string | null> = {};

    for (const [key, value] of Object.entries(lead?.display_values ?? {})) {
      values[normalizeLeadKey(key)] = typeof value === "string" ? value : null;
    }

    return values;
  }, [lead]);

  const leadLabel = useMemo(() => {
    if (!lead) return emptyLabel;
    return getLeadDisplayName(lead, emptyLabel);
  }, [lead, emptyLabel]);

  const locationLine = useMemo(() => {
    if (!lead) return "";

    const postal = getString(lead.postal_code);
    const city = getString(displayValues.city ?? lead.city);
    const region = getString(displayValues.region ?? lead.region);
    const country = getString(displayValues.country ?? lead.country);

    const firstPart = [postal, city].filter(Boolean).join(" ").trim();
    return [firstPart, region, country].filter(Boolean).join(", ");
  }, [displayValues.city, displayValues.country, displayValues.region, lead]);

  const contactValue = getString(lead?.primary_contact_value);
  const contactLink = contactValue
    ? contactHref(lead?.primary_contact_type ?? null, contactValue)
    : null;

  if (workspaceLoading || loading) {
    return <DeleteLeadLoadingState isDark={isDark} />;
  }

  if (!teamId) {
    return (
      <p
        className={["text-sm", isDark ? "text-rose-300" : "text-rose-500"].join(
          " ",
        )}
      >
        {t("errors.noWorkspaceContext")}
      </p>
    );
  }

  if (!lead) {
    return (
      <p className={["text-sm", mutedText].join(" ")}>
        {error ?? t("errors.leadNotFound")}
      </p>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${pageText}`}>
      <div className="max-w-3xl space-y-6">
        <div
          className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${dangerShell}`}
        >
          <div
            className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${dangerIconShell}`}
          >
            <span className={`text-lg font-semibold ${dangerIconText}`}>!</span>
          </div>
          <div>
            <h1 className={`text-xl font-semibold ${dangerTitle}`}>
              {t("header.title")}
            </h1>
            <p className={`mt-1 text-sm ${dangerBody}`}>
              {t.rich("header.description", {
                strong: (chunks) => (
                  <span className="font-semibold">{chunks}</span>
                ),
              })}
            </p>
          </div>
        </div>

        <div className={`rounded-2xl border px-5 py-4 shadow-sm ${cardShell}`}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2
                className={`text-sm font-semibold uppercase tracking-wide ${mutedText}`}
              >
                {t("preview.title")}
              </h2>
              <p
                className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                {t("preview.description")}
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${stageWrap}`}
            >
              <span
                className={`text-[11px] font-medium uppercase tracking-wide ${stageLabel}`}
              >
                {t("preview.stage")}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stagePill}`}
              >
                {lead.stage || dashLabel}
              </span>
            </div>
          </div>

          {error && (
            <p
              className={[
                "mb-3 text-xs font-medium",
                isDark ? "text-rose-300" : "text-rose-600",
              ].join(" ")}
            >
              {error}
            </p>
          )}

          <div className={`mb-4 rounded-xl border px-4 py-3 ${softPanel}`}>
            <div className="mb-2">
              <h3
                className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
              >
                {t("core.title")}
              </h3>
              <p
                className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                {t("core.description")}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div
                className={`rounded-xl border px-3 py-2 md:col-span-2 ${innerCard}`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.leadName")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {safeValue(leadLabel) ?? emptyLabel}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.nicheIndustry")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {safeValue(lead.niche) ?? emptyLabel}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.leadType")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {getLeadTypeLabel(tDomain, lead.lead_type)}
                </p>
              </div>

              {lead.lead_type === "individual" && (
                <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                  >
                    {tLeads("columns.gender")}
                  </p>
                  <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                    {getLeadGenderLabel(tDomain, lead.gender)}
                  </p>
                </div>
              )}

              <div
                className={`rounded-xl border px-3 py-2 md:col-span-2 ${innerCard}`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {t("fields.location")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {locationLine || emptyLabel}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.primaryContactType")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {getLeadContactTypeLabel(tDomain, lead.primary_contact_type)}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {t("fields.primaryContact")}
                </p>

                {contactLink ? (
                  <a
                    href={contactLink}
                    target={
                      contactLink.startsWith("mailto:") ||
                      contactLink.startsWith("tel:")
                        ? undefined
                        : "_blank"
                    }
                    rel={
                      contactLink.startsWith("mailto:") ||
                      contactLink.startsWith("tel:")
                        ? undefined
                        : "noopener noreferrer"
                    }
                    className={`mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline ${linkCls}`}
                  >
                    <span className="truncate">
                      {contactValue || emptyLabel}
                    </span>
                  </a>
                ) : (
                  <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                    {contactValue || emptyLabel}
                  </p>
                )}
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.sourceCategory")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {getLeadSourceCategoryLabel(tDomain, lead.source_category)}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  {tLeads("columns.sourceName")}
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {getLeadSourceNameLabel(tDomain, lead.source_name)}
                </p>
              </div>
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 ${softPanel}`}>
            <div className="mb-2">
              <h3
                className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
              >
                {t("additional.title")}
              </h3>
              <p
                className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                {t("additional.description")}
              </p>
            </div>

            {fields.length === 0 ? (
              <p className={`text-sm ${mutedText}`}>{t("additional.none")}</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((field) => {
                  const raw = customValues[field.key];
                  const isSelect = field.type === "select";
                  const isBoolean = field.type === "boolean";

                  const translatedSelectValue = isSelect
                    ? getLeadFieldSelectLabel(field, raw)
                    : null;

                  const translatedBooleanValue = isBoolean
                    ? raw == null
                      ? null
                      : Boolean(raw)
                        ? common("common.yes")
                        : common("common.no")
                    : null;

                  const displayValue =
                    translatedSelectValue ??
                    translatedBooleanValue ??
                    displayValues[normalizeLeadKey(field.key)] ??
                    (raw == null
                      ? ""
                      : typeof raw === "string"
                        ? raw.trim()
                        : String(raw));

                  const isEmpty = String(displayValue).trim().length === 0;
                  const finalDisplayValue = isEmpty ? dashLabel : displayValue;

                  const isLink =
                    isLikelyLinkField(field) &&
                    !isEmpty &&
                    typeof raw === "string";
                  const href = isLink ? normalizeUrl(raw) : null;

                  return (
                    <div
                      key={field.key}
                      className={`rounded-xl border px-3 py-2 ${innerCard}`}
                    >
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                      >
                        {field.label}
                      </p>

                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline ${linkCls}`}
                        >
                          <span className="truncate">
                            {String(finalDisplayValue)}
                          </span>
                        </a>
                      ) : (
                        <p
                          className={`mt-0.5 text-sm break-words ${titleText}`}
                        >
                          {String(finalDisplayValue)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className={[
                "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm cursor-pointer",
                deleteBtn,
                "disabled:opacity-70 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {deleting ? t("actions.deleting") : t("actions.deleteLead")}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              className={`text-sm font-medium cursor-pointer ${cancelLink}`}
            >
              {common("actions.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
