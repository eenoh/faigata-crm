"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/features/crm/data/leadFields";
import { getPipelineStages } from "@/features/crm/data/pipelineStages";
import { getLeadFormNicheOptions } from "@/features/crm/data/niches";
import type { LeadFieldDefinition } from "@/features/crm/types/lead";
import type { PipelineStageDef } from "@/features/crm/data/pipelineStages";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  getLeadFieldSelectOptions,
  getLeadFieldSelectValue,
  isReservedLeadCustomValueKey,
  normalizeLeadCustomSelectValues,
} from "@/features/crm/utils/lead";
import {
  resolveLeadNicheOption,
  toNormalizedNicheName,
  type LeadNicheOption,
} from "@/features/crm/server/niches.shared";
import { resolveClientRequestLocale } from "@/features/i18n/client/requestLocale";
import {
  getLeadContactTypeLabel,
  getLeadGenderLabel,
  getLeadSourceCategoryLabel,
  getLeadSourceNameLabel,
  getLeadTypeLabel,
} from "@/i18n/domain-values";

type LeadType = "individual" | "business";
type Gender = "male" | "female";

type ContactType =
  | "email"
  | "phone"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "reddit"
  | "twitter_x"
  | "whatsapp"
  | "telegram"
  | "tiktok"
  | "youtube"
  | "snapchat"
  | "discord"
  | "slack"
  | "wechat"
  | "line"
  | "signal"
  | "other";

type SourceCategory =
  | "inbound"
  | "outbound"
  | "referral"
  | "partner"
  | "purchased";

type SourceName = "instagram" | "facebook" | "reddit" | "twitter_x" | "other";

type LeadRow = {
  id: string;
  team_id: string;
  stage: string;
  stage_id?: string | null;
  lead_name: string | null;

  niche_id: string | null;
  niche: string | null;
  lead_type: LeadType | null;
  gender: Gender | null;

  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;

  primary_contact_type: ContactType | null;
  primary_contact_value: string | null;

  source_category: SourceCategory | null;
  source_name: SourceName | null;

  custom_values: Record<string, unknown> | null;
  display_values?: Record<string, string | null> | null;
  notes: string | null;
};

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

function normalizeNullishString(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function fetchLeadForEdit(
  teamId: string,
  leadId: string,
  accessToken: string,
): Promise<Response> {
  return fetch(
    `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(leadId)}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

type FormState = {
  stageId: string;

  leadName: string;
  firstName: string;
  lastName: string;

  nicheId: string;
  leadType: LeadType;
  gender: Gender | "";

  country: string;
  region: string;
  city: string;
  postalCode: string;

  primaryContactType: ContactType;
  primaryContactValue: string;

  sourceCategory: SourceCategory;
  sourceName: SourceName;

  customValues: Record<string, unknown>;
  notes: string;
};

const EMPTY_FORM: FormState = {
  stageId: "",

  leadName: "",
  firstName: "",
  lastName: "",

  nicheId: "",
  leadType: "business",
  gender: "",

  country: "",
  region: "",
  city: "",
  postalCode: "",

  primaryContactType: "other",
  primaryContactValue: "",

  sourceCategory: "inbound",
  sourceName: "other",

  customValues: {},
  notes: "",
};

function LoadingSkeleton({ isDark }: { isDark: boolean }) {
  const card = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-100 bg-white";
  const sk = isDark ? "bg-slate-800" : "bg-slate-100";

  return (
    <div className="max-w-2xl space-y-3">
      <div className={`rounded-2xl border p-6 shadow-sm ${card}`}>
        <div className={`h-6 w-40 animate-pulse rounded ${sk}`} />
        <div className={`mt-3 h-4 w-2/3 animate-pulse rounded ${sk}`} />
      </div>

      <div className={`rounded-2xl border p-6 shadow-sm ${card}`}>
        <div className={`h-4 w-32 animate-pulse rounded ${sk}`} />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`h-10 animate-pulse rounded ${sk}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InlineError({
  title,
  message,
  closeLabel,
  isDark,
  onClose,
}: {
  title: string;
  message: string;
  closeLabel: string;
  isDark: boolean;
  onClose?: () => void;
}) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-3",
        isDark
          ? "border-rose-900/50 bg-rose-500/10 text-rose-200"
          : "border-rose-200 bg-rose-50 text-rose-700",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-relaxed">{message}</p>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={[
              "shrink-0 rounded-md px-2 py-1 text-xs font-semibold",
              isDark
                ? "text-rose-200 hover:bg-rose-500/10"
                : "text-rose-700 hover:bg-rose-100",
            ].join(" ")}
            aria-label={closeLabel}
          >
            {closeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getStageOptionValue(
  stage: Pick<PipelineStageDef, "id" | "name"> | null | undefined,
) {
  const id = typeof stage?.id === "string" ? stage.id.trim() : "";
  if (id) return id;
  return String(stage?.name ?? "").trim();
}

export function EditLeadClient() {
  const t = useTranslations("EditLeadPage");
  const tLeads = useTranslations("LeadsPage");
  const common = useTranslations("Common");
  const tDomain = useTranslations("DomainValues");

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nicheOptions, setNicheOptions] = useState<LeadNicheOption[]>([]);

  const locale = resolveClientRequestLocale();

  const leadNameMode = useMemo<"split" | "single">(() => {
    const cv = form.customValues ?? {};
    const hasFirstOrLast =
      typeof (cv as Record<string, unknown>).first_name === "string" ||
      typeof (cv as Record<string, unknown>).last_name === "string";
    return hasFirstOrLast ? "split" : "single";
  }, [form.customValues]);

  const visibleCustomFields = useMemo(
    () => fields.filter((field) => !isReservedLeadCustomValueKey(field.key)),
    [fields],
  );

  const showGender = form.leadType === "individual";

  const fullName = useMemo(() => {
    return leadNameMode === "split"
      ? [form.firstName, form.lastName].filter(Boolean).join(" ").trim()
      : form.leadName.trim();
  }, [leadNameMode, form.firstName, form.lastName, form.leadName]);

  function contactValueLabel(type: ContactType) {
    return getLeadContactTypeLabel(tDomain, type);
  }

  function contactValuePlaceholder(type: ContactType) {
    switch (type) {
      case "email":
        return t("contact.placeholder.email");
      case "phone":
        return t("contact.placeholder.phone");
      case "linkedin":
        return t("contact.placeholder.linkedin");
      case "instagram":
        return t("contact.placeholder.instagram");
      case "facebook":
        return t("contact.placeholder.facebook");
      case "reddit":
        return t("contact.placeholder.reddit");
      case "twitter_x":
        return t("contact.placeholder.twitter_x");
      case "whatsapp":
        return t("contact.placeholder.whatsapp");
      case "telegram":
        return t("contact.placeholder.telegram");
      case "tiktok":
        return t("contact.placeholder.tiktok");
      case "youtube":
        return t("contact.placeholder.youtube");
      case "snapchat":
        return t("contact.placeholder.snapchat");
      case "discord":
        return t("contact.placeholder.discord");
      case "slack":
        return t("contact.placeholder.slack");
      case "wechat":
        return t("contact.placeholder.wechat");
      case "line":
        return t("contact.placeholder.line");
      case "signal":
        return t("contact.placeholder.signal");
      default:
        return t("contact.placeholder.other");
    }
  }

  function mapLeadApiError(raw: unknown) {
    const message = String(raw ?? "").trim();
    const lowered = message.toLowerCase();

    if (!message) return t("errors.generic");

    if (
      lowered.includes("missing_session") ||
      lowered.includes("missing_auth_token") ||
      lowered.includes("unauthorized") ||
      lowered.includes("jwt") ||
      lowered.includes("session expired")
    ) {
      return t("errors.sessionExpired");
    }

    if (lowered.includes("forbidden")) {
      return t("errors.forbidden");
    }

    if (lowered.includes("not found")) {
      return t("errors.notFound");
    }

    if (lowered.includes("team") && lowered.includes("workspace")) {
      return t("errors.workspaceMismatch");
    }

    if (lowered.includes("leads_gender_required_for_individual")) {
      return t("errors.genderRequiredForIndividual");
    }

    if (lowered.includes("leads_primary_contact_value_not_blank")) {
      return t("errors.primaryContactRequired");
    }

    if (
      lowered.includes("invalid or disabled niche") ||
      lowered.includes("invalid niche")
    ) {
      return t("errors.invalidNiche");
    }

    if (lowered.includes("stage")) {
      return t("errors.invalidStage");
    }

    return message;
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCustom(key: string, value: unknown) {
    setForm((prev) => ({
      ...prev,
      customValues: { ...(prev.customValues ?? {}), [key]: value },
    }));
  }

  const pageText = isDark ? "text-slate-200" : "text-slate-800";
  const titleText = isDark ? "text-slate-100" : "text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const formShell = isDark
    ? "border-slate-800 bg-slate-950"
    : "border-slate-200 bg-white";

  const sectionBorder = isDark ? "border-slate-800" : "border-slate-100";
  const labelCls = isDark ? "text-slate-300" : "text-slate-700";

  const inputCls = isDark
    ? [
        "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-600",
        "focus:ring-indigo-400 focus:border-indigo-400",
      ].join(" ")
    : [
        "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
        "focus:ring-indigo-500 focus:border-indigo-500",
      ].join(" ");

  const selectCls = `${inputCls} cursor-pointer`;

  const checkboxCls = isDark
    ? "rounded border-slate-700 text-indigo-500 focus:ring-indigo-400"
    : "rounded border-slate-300 text-indigo-600 focus:ring-indigo-500";

  const helperText = isDark ? "text-slate-500" : "text-slate-500";

  useEffect(() => {
    if (form.leadType !== "individual" && form.gender) {
      setField("gender", "");
    }
  }, [form.leadType, form.gender]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) return;

      if (!teamId || !id) {
        setError(t("errors.missingWorkspaceOrLeadId"));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const accessToken = await getAccessToken();
        if (!accessToken) {
          setError(t("errors.sessionExpired"));
          return;
        }

        const [defs, stageDefs, leadRes] = await Promise.all([
          getLeadFieldDefinitions(teamId, locale),
          getPipelineStages(teamId, locale),
          fetchLeadForEdit(teamId, id, accessToken),
        ]);

        if (cancelled) return;

        const ct = leadRes.headers.get("content-type") ?? "";
        const payload = ct.includes("application/json")
          ? ((await leadRes.json().catch(() => null)) as
              | LeadRow
              | ApiErrorPayload
              | null)
          : null;

        if (!leadRes.ok || !payload || !("team_id" in payload)) {
          setError(
            mapLeadApiError(
              (payload as ApiErrorPayload | null)?.error ||
                (payload as ApiErrorPayload | null)?.message ||
                t("errors.loadFailed"),
            ),
          );
          return;
        }

        const leadPayload = payload as LeadRow;

        if (leadPayload.team_id !== teamId) {
          setError(t("errors.workspaceMismatch"));
          return;
        }

        const rawCustomValues = {
          ...((leadPayload.custom_values ?? {}) as Record<string, unknown>),
        };

        const colName =
          typeof leadPayload.lead_name === "string"
            ? leadPayload.lead_name
            : "";

        const cvFirst =
          typeof rawCustomValues.first_name === "string"
            ? rawCustomValues.first_name
            : "";
        const cvLast =
          typeof rawCustomValues.last_name === "string"
            ? rawCustomValues.last_name
            : "";
        const cvSingle =
          typeof rawCustomValues.lead_name === "string"
            ? rawCustomValues.lead_name
            : [cvFirst, cvLast].filter(Boolean).join(" ");

        const initialFull = (colName || cvSingle || "").trim();
        const nicheData = await getLeadFormNicheOptions(
          leadPayload.niche_id,
          locale,
        );

        if (cancelled) return;

        setFields(defs ?? []);
        setStages(stageDefs ?? []);

        const options = [...(nicheData.options ?? [])];
        if (
          leadPayload.niche_id &&
          !options.some((opt) => opt.id === leadPayload.niche_id)
        ) {
          options.unshift({
            id: leadPayload.niche_id,
            label: leadPayload.niche ?? t("niche.unknown"),
            archived: true,
            normalizedName: toNormalizedNicheName(
              leadPayload.niche ?? t("niche.unknown"),
            ),
          });
        }

        setNicheOptions(options);

        const normalizedCustomValues = normalizeLeadCustomSelectValues(
          rawCustomValues,
          defs ?? [],
        );

        const matchingStage =
          stageDefs.find((stage) => {
            if (
              typeof leadPayload.stage_id === "string" &&
              leadPayload.stage_id.trim()
            ) {
              return stage.id === leadPayload.stage_id;
            }

            return (
              String(stage.name ?? "").trim() ===
              String(leadPayload.stage ?? "").trim()
            );
          }) ?? stageDefs?.[0];

        const matchingNiche = resolveLeadNicheOption(
          options,
          leadPayload.niche_id ?? leadPayload.niche,
        );

        setForm({
          ...EMPTY_FORM,
          stageId: getStageOptionValue(matchingStage),

          nicheId: matchingNiche?.id ?? leadPayload.niche_id ?? "",

          leadType: (leadPayload.lead_type ?? "business") as LeadType,
          gender: (leadPayload.gender ?? "") as Gender | "",

          country: leadPayload.country ?? "",
          region: leadPayload.region ?? "",
          city: leadPayload.city ?? "",
          postalCode: leadPayload.postal_code ?? "",

          primaryContactType:
            ((leadPayload.primary_contact_type as ContactType) ??
              "other") as ContactType,
          primaryContactValue: leadPayload.primary_contact_value ?? "",

          sourceCategory: (leadPayload.source_category ??
            "inbound") as SourceCategory,
          sourceName: (leadPayload.source_name ?? "other") as SourceName,

          customValues: normalizedCustomValues,
          notes: leadPayload.notes ?? "",

          firstName: cvFirst,
          lastName: cvLast,
          leadName: initialFull,
        });
      } catch (e) {
        console.error("[EditLead] unexpected load error", e);
        if (!cancelled) {
          setError(t("errors.loadFailed"));
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

  function validate(): string | null {
    if (!form.stageId) return t("validation.stageRequired");
    if (!fullName) return t("validation.leadNameRequired");
    if (!form.nicheId) return t("validation.nicheRequired");
    if (form.leadType === "individual" && !form.gender) {
      return t("validation.genderRequired");
    }

    if (!form.country.trim()) return t("validation.countryRequired");
    if (!form.region.trim()) return t("validation.regionRequired");
    if (!form.city.trim()) return t("validation.cityRequired");

    if (!form.primaryContactType) {
      return t("validation.primaryContactTypeRequired");
    }

    if (!form.primaryContactValue.trim()) {
      return t("validation.primaryContactValueRequired");
    }

    if (!form.sourceCategory) return t("validation.sourceCategoryRequired");
    if (!form.sourceName) return t("validation.sourceNameRequired");

    return null;
  }

  function renderCustomField(field: LeadFieldDefinition) {
    const value =
      (form.customValues as Record<string, unknown>)?.[field.key] ?? "";

    const baseLabel = `block text-xs font-medium uppercase tracking-wide ${mutedText}`;
    const baseInput = [
      "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2",
      selectCls,
    ].join(" ");

    if (field.type === "text" || field.type === "link") {
      return (
        <div key={field.key} className="space-y-1">
          <label className={baseLabel}>{field.label}</label>
          <input
            className={baseInput}
            value={String(value ?? "")}
            onChange={(e) => setCustom(field.key, e.target.value)}
          />
        </div>
      );
    }

    if (field.type === "number") {
      return (
        <div key={field.key} className="space-y-1">
          <label className={baseLabel}>{field.label}</label>
          <input
            type="number"
            className={baseInput}
            value={value === "" ? "" : String(value ?? "")}
            onChange={(e) =>
              setCustom(
                field.key,
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          />
        </div>
      );
    }

    if (field.type === "boolean") {
      return (
        <div key={field.key} className="space-y-1">
          <label className={baseLabel}>{field.label}</label>
          <label
            className={`inline-flex items-center gap-2 text-sm ${
              isDark ? "text-slate-200" : "text-slate-700"
            }`}
          >
            <input
              type="checkbox"
              className={checkboxCls}
              checked={Boolean(value)}
              onChange={(e) => setCustom(field.key, e.target.checked)}
            />
            <span>{common("common.yes")}</span>
          </label>
        </div>
      );
    }

    if (field.type === "select") {
      const selectedValue = getLeadFieldSelectValue(field, value);
      const selectOptions = getLeadFieldSelectOptions(field);

      return (
        <div key={field.key} className="space-y-1">
          <label className={baseLabel}>{field.label}</label>
          <select
            className={baseInput}
            value={selectedValue}
            onChange={(e) => setCustom(field.key, e.target.value)}
          >
            <option value="">{common("common.select")}</option>
            {selectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !id || saving) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError(t("errors.sessionExpired"));
        return;
      }

      const cleanNotes = normalizeNullishString(form.notes);
      const cleanPostal = normalizeNullishString(form.postalCode);
      const selectedStage =
        stages.find((stage) => getStageOptionValue(stage) === form.stageId) ??
        null;

      const nextCustomValues = normalizeLeadCustomSelectValues(
        { ...(form.customValues ?? {}) },
        fields,
      ) as Record<string, unknown>;

      nextCustomValues.lead_name = fullName;

      if (leadNameMode === "split") {
        nextCustomValues.first_name = form.firstName;
        nextCustomValues.last_name = form.lastName;
      }

      const res = await fetch(
        `/api/crm/leads?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(String(id))}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            updates: {
              ...(selectedStage?.id
                ? { stage_id: selectedStage.id }
                : selectedStage?.name
                  ? { stage: selectedStage.name }
                  : {}),
              notes: cleanNotes,
              customValues: nextCustomValues,
              systemFields: {
                lead_name: normalizeNullishString(fullName),
                niche_id: form.nicheId,
                lead_type: form.leadType,
                gender:
                  form.leadType === "individual"
                    ? (form.gender as Gender)
                    : null,
                country: form.country.trim(),
                region: form.region.trim(),
                city: form.city.trim(),
                postal_code: cleanPostal,
                primary_contact_type: form.primaryContactType,
                primary_contact_value: form.primaryContactValue.trim(),
                source_category: form.sourceCategory,
                source_name: form.sourceName,
              },
            },
          }),
        },
      );

      const payload = (await res
        .json()
        .catch(() => null)) as ApiErrorPayload | null;

      if (!res.ok) {
        setError(
          mapLeadApiError(
            payload?.error || payload?.message || t("errors.saveFailed"),
          ),
        );
        return;
      }

      router.push(`/leads/${id}`);
      router.refresh();
    } catch (err) {
      console.error("[EditLead] unexpected save error", err);
      setError(t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (workspaceLoading || loading) {
    return <LoadingSkeleton isDark={isDark} />;
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

  const selectedNicheOption =
    nicheOptions.find((option) => option.id === form.nicheId) ?? null;

  return (
    <div className={`h-full overflow-y-auto ${pageText}`}>
      <div className="max-w-2xl">
        <div className="mb-4">
          <h1 className={`text-2xl font-semibold ${titleText}`}>
            {t("page.title")}
          </h1>
          <p className={`text-sm ${mutedText}`}>{t("page.description")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`space-y-6 rounded-2xl border p-6 shadow-sm ${formShell}`}
        >
          {error ? (
            <InlineError
              title={t("errorBox.title")}
              message={error}
              closeLabel={common("actions.close")}
              isDark={isDark}
              onClose={() => setError(null)}
            />
          ) : null}

          <div className="space-y-4">
            <h2
              className={`text-sm font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {t("sections.coreDetails")}
            </h2>

            {leadNameMode === "split" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${labelCls}`}
                  >
                    {common("fields.firstName")}
                  </label>
                  <input
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                    placeholder={t("placeholders.firstName")}
                  />
                </div>
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${labelCls}`}
                  >
                    {common("fields.lastName")}
                  </label>
                  <input
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    placeholder={t("placeholders.lastName")}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {tLeads("columns.leadName")}
                </label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                  value={form.leadName}
                  onChange={(e) => setField("leadName", e.target.value)}
                  placeholder={t("placeholders.leadName")}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {t("fields.niche")}
                </label>
                <select
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
                  value={form.nicheId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      nicheId: selectedId,
                    }));
                  }}
                  required
                >
                  <option value="">{t("fields.selectNiche")}</option>
                  {nicheOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.archived ? ` ${t("niche.archivedSuffix")}` : ""}
                    </option>
                  ))}
                </select>
                {selectedNicheOption?.archived ? (
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    {t("niche.archivedHelp")}
                  </p>
                ) : null}
              </div>

              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {tLeads("columns.leadType")}
                </label>
                <select
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
                  value={form.leadType}
                  onChange={(e) =>
                    setField("leadType", e.target.value as LeadType)
                  }
                    required
                  >
                    <option value="individual">
                      {getLeadTypeLabel(tDomain, "individual")}
                    </option>
                    <option value="business">
                      {getLeadTypeLabel(tDomain, "business")}
                    </option>
                  </select>
                </div>

              {showGender ? (
                <div>
                  <label
                    className={`mb-1 block text-sm font-medium ${labelCls}`}
                  >
                    {tLeads("columns.gender")}
                  </label>
                  <select
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
                    value={form.gender}
                    onChange={(e) =>
                      setField("gender", e.target.value as Gender)
                    }
                    required
                  >
                    <option value="">{common("common.select")}</option>
                    <option value="male">
                      {getLeadGenderLabel(tDomain, "male")}
                    </option>
                    <option value="female">
                      {getLeadGenderLabel(tDomain, "female")}
                    </option>
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`border-t pt-4 ${sectionBorder}`}>
            <h2
              className={`mb-3 text-sm font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {t("sections.location")}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {t("fields.country")}
                </label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                  placeholder={t("placeholders.country")}
                  required
                />
              </div>

              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {t("fields.region")}
                </label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                  value={form.region}
                  onChange={(e) => setField("region", e.target.value)}
                  placeholder={t("placeholders.region")}
                  required
                />
              </div>

              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {t("fields.city")}
                </label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  placeholder={t("placeholders.city")}
                  required
                />
              </div>

              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {t("fields.postalCode")}{" "}
                  <span
                    className={`font-normal ${
                      isDark ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    ({t("common.optional")})
                  </span>
                </label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                  value={form.postalCode}
                  onChange={(e) => setField("postalCode", e.target.value)}
                  placeholder={t("placeholders.postalCode")}
                />
              </div>
            </div>
          </div>

          <div className={`border-t pt-4 ${sectionBorder}`}>
            <h2
              className={`mb-3 text-sm font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {t("sections.contact")}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {tLeads("columns.primaryContactType")}
                </label>
                <select
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
                  value={form.primaryContactType}
                  onChange={(e) =>
                    setField(
                      "primaryContactType",
                      e.target.value as ContactType,
                    )
                  }
                  required
                >
                  <option value="email">
                    {getLeadContactTypeLabel(tDomain, "email")}
                  </option>
                  <option value="phone">
                    {getLeadContactTypeLabel(tDomain, "phone")}
                  </option>
                  <option value="linkedin">
                    {getLeadContactTypeLabel(tDomain, "linkedin")}
                  </option>
                  <option value="instagram">
                    {getLeadContactTypeLabel(tDomain, "instagram")}
                  </option>
                  <option value="facebook">
                    {getLeadContactTypeLabel(tDomain, "facebook")}
                  </option>
                  <option value="reddit">
                    {getLeadContactTypeLabel(tDomain, "reddit")}
                  </option>
                  <option value="twitter_x">
                    {getLeadContactTypeLabel(tDomain, "twitter_x")}
                  </option>
                  <option value="tiktok">
                    {getLeadContactTypeLabel(tDomain, "tiktok")}
                  </option>
                  <option value="youtube">
                    {getLeadContactTypeLabel(tDomain, "youtube")}
                  </option>
                  <option value="snapchat">
                    {getLeadContactTypeLabel(tDomain, "snapchat")}
                  </option>
                  <option value="whatsapp">
                    {getLeadContactTypeLabel(tDomain, "whatsapp")}
                  </option>
                  <option value="telegram">
                    {getLeadContactTypeLabel(tDomain, "telegram")}
                  </option>
                  <option value="signal">
                    {getLeadContactTypeLabel(tDomain, "signal")}
                  </option>
                  <option value="wechat">
                    {getLeadContactTypeLabel(tDomain, "wechat")}
                  </option>
                  <option value="line">
                    {getLeadContactTypeLabel(tDomain, "line")}
                  </option>
                  <option value="discord">
                    {getLeadContactTypeLabel(tDomain, "discord")}
                  </option>
                  <option value="slack">
                    {getLeadContactTypeLabel(tDomain, "slack")}
                  </option>
                  <option value="other">
                    {getLeadContactTypeLabel(tDomain, "other")}
                  </option>
                </select>
              </div>

              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {contactValueLabel(form.primaryContactType)}
                </label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
                  value={form.primaryContactValue}
                  onChange={(e) =>
                    setField("primaryContactValue", e.target.value)
                  }
                  placeholder={contactValuePlaceholder(form.primaryContactType)}
                  required
                />
              </div>
            </div>

            <p className={`mt-2 text-xs ${helperText}`}>{t("contact.tip")}</p>
          </div>

          <div className={`border-t pt-4 ${sectionBorder}`}>
            <h2
              className={`mb-3 text-sm font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {t("sections.source")}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {tLeads("columns.sourceCategory")}
                </label>
                <select
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
                  value={form.sourceCategory}
                  onChange={(e) =>
                    setField("sourceCategory", e.target.value as SourceCategory)
                  }
                  required
                >
                  <option value="inbound">
                    {getLeadSourceCategoryLabel(tDomain, "inbound")}
                  </option>
                  <option value="outbound">
                    {getLeadSourceCategoryLabel(tDomain, "outbound")}
                  </option>
                  <option value="referral">
                    {getLeadSourceCategoryLabel(tDomain, "referral")}
                  </option>
                  <option value="partner">
                    {getLeadSourceCategoryLabel(tDomain, "partner")}
                  </option>
                  <option value="purchased">
                    {getLeadSourceCategoryLabel(tDomain, "purchased")}
                  </option>
                </select>
              </div>

              <div>
                <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
                  {tLeads("columns.sourceName")}
                </label>
                <select
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
                  value={form.sourceName}
                  onChange={(e) =>
                    setField("sourceName", e.target.value as SourceName)
                  }
                  required
                >
                  <option value="instagram">
                    {getLeadSourceNameLabel(tDomain, "instagram")}
                  </option>
                  <option value="facebook">
                    {getLeadSourceNameLabel(tDomain, "facebook")}
                  </option>
                  <option value="reddit">
                    {getLeadSourceNameLabel(tDomain, "reddit")}
                  </option>
                  <option value="twitter_x">
                    {getLeadSourceNameLabel(tDomain, "twitter_x")}
                  </option>
                  <option value="other">
                    {getLeadSourceNameLabel(tDomain, "other")}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div className={`border-t pt-4 ${sectionBorder}`}>
            <label className={`mb-1 block text-sm font-medium ${labelCls}`}>
              {t("fields.pipelineStage")}
            </label>
            <select
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${selectCls}`}
              value={form.stageId}
              onChange={(e) => setField("stageId", e.target.value)}
              required
            >
              {stages.map((s) => (
                <option
                  key={getStageOptionValue(s)}
                  value={getStageOptionValue(s)}
                >
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {visibleCustomFields.length > 0 ? (
            <div className={`border-t pt-4 ${sectionBorder}`}>
              <h2
                className={`mb-3 text-sm font-semibold ${
                  isDark ? "text-slate-100" : "text-slate-800"
                }`}
              >
                {t("sections.customFields")}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibleCustomFields.map(renderCustomField)}
              </div>
            </div>
          ) : null}

          <div className={`border-t pt-4 ${sectionBorder}`}>
            <h2
              className={`mb-2 text-sm font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              {t("sections.notes")}
            </h2>
            <p className={`mb-2 text-xs ${mutedText}`}>
              {t("notes.description")}
            </p>
            <textarea
              className={`min-h-[120px] w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${inputCls}`}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder={t("notes.placeholder")}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className={[
                "inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm cursor-pointer",
                "bg-indigo-600 text-white hover:bg-indigo-700",
                "disabled:cursor-not-allowed disabled:opacity-70",
              ].join(" ")}
            >
              {saving ? common("actions.saving") : t("actions.saveChanges")}
            </button>

            <button
              type="button"
              onClick={() => router.push(`/leads/${id}`)}
              className={[
                "text-sm cursor-pointer",
                isDark
                  ? "text-slate-400 hover:text-slate-200"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {common("actions.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
