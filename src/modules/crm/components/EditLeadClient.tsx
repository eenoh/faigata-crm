"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { getPipelineStages } from "@/modules/crm/data/pipelineStages";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import type { PipelineStageDef } from "@/modules/crm/data/pipelineStages";
import { useWorkspace } from "@/context/WorkspaceContext";

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
  lead_name: string | null;

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

  custom_values: Record<string, any> | null;
  notes: string | null;
};

function contactValueLabel(type: ContactType) {
  switch (type) {
    case "email":
      return "Email Address";
    case "phone":
      return "Phone Number";
    case "linkedin":
      return "LinkedIn Profile URL";
    case "instagram":
      return "Instagram Profile URL";
    case "facebook":
      return "Facebook Profile URL";
    case "reddit":
      return "Reddit Profile URL";
    case "twitter_x":
      return "Twitter/X Profile URL";
    case "whatsapp":
      return "WhatsApp Number or wa.me Link";
    case "telegram":
      return "Telegram Username or Link";
    case "tiktok":
      return "TikTok Profile URL";
    case "youtube":
      return "YouTube Channel URL";
    case "snapchat":
      return "Snapchat Username";
    case "discord":
      return "Discord Handle or Invite Link";
    case "slack":
      return "Slack Workspace/User (or message link)";
    case "wechat":
      return "WeChat ID";
    case "line":
      return "LINE ID";
    case "signal":
      return "Signal Number";
    default:
      return "Contact value";
  }
}

function contactValuePlaceholder(type: ContactType) {
  switch (type) {
    case "email":
      return "e.g. alex@company.com";
    case "phone":
      return "e.g. +1 555 123 4567";
    case "linkedin":
      return "e.g. https://www.linkedin.com/in/username";
    case "instagram":
      return "e.g. https://instagram.com/username";
    case "facebook":
      return "e.g. https://facebook.com/username";
    case "reddit":
      return "e.g. https://reddit.com/u/username";
    case "twitter_x":
      return "e.g. https://x.com/username";
    case "whatsapp":
      return "e.g. +1 555 123 4567 or https://wa.me/15551234567";
    case "telegram":
      return "e.g. @username or https://t.me/username";
    case "tiktok":
      return "e.g. https://www.tiktok.com/@username";
    case "youtube":
      return "e.g. https://www.youtube.com/@channel";
    case "snapchat":
      return "e.g. username";
    case "discord":
      return "e.g. username#1234 or https://discord.gg/xxxx";
    case "slack":
      return "e.g. workspace or message link";
    case "wechat":
      return "e.g. wechat_id";
    case "line":
      return "e.g. line_id";
    case "signal":
      return "e.g. +1 555 123 4567";
    default:
      return "e.g. link, handle, or identifier";
  }
}

function normalizeNullishString(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

type FormState = {
  stage: string;

  // lead name editor
  leadName: string;
  firstName: string;
  lastName: string;

  // system/core
  niche: string;
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

  // custom + notes
  customValues: Record<string, any>;
  notes: string;
};

const EMPTY_FORM: FormState = {
  stage: "",

  leadName: "",
  firstName: "",
  lastName: "",

  niche: "",
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

export function EditLeadClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadNameMode = useMemo<"split" | "single">(() => {
    const cv = form.customValues ?? {};
    const hasFirstOrLast =
      typeof cv.first_name === "string" || typeof cv.last_name === "string";
    return hasFirstOrLast ? "split" : "single";
  }, [form.customValues]);

  const showGender = form.leadType === "individual";

  const fullName = useMemo(() => {
    const computed =
      leadNameMode === "split"
        ? [form.firstName, form.lastName].filter(Boolean).join(" ").trim()
        : form.leadName.trim();
    return computed;
  }, [leadNameMode, form.firstName, form.lastName, form.leadName]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCustom(key: string, value: any) {
    setForm((prev) => ({
      ...prev,
      customValues: { ...(prev.customValues ?? {}), [key]: value },
    }));
  }

  // If lead type flips away from individual -> clear gender
  useEffect(() => {
    if (form.leadType !== "individual" && form.gender) {
      setField("gender", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leadType]);

  // -------- load lead + config --------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) return;

      if (!teamId || !id) {
        setError("We couldn’t determine your team or lead id.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const [defs, stageDefs] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          getPipelineStages(teamId),
        ]);

        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select(
            [
              "id",
              "team_id",
              "stage",
              "lead_name",
              "custom_values",
              "notes",
              "niche",
              "lead_type",
              "gender",
              "country",
              "region",
              "city",
              "postal_code",
              "primary_contact_type",
              "primary_contact_value",
              "source_category",
              "source_name",
            ].join(","),
          )
          .eq("id", id)
          .single<LeadRow>();

        if (cancelled) return;

        if (leadError || !lead) {
          console.error("[EditLead] failed to load lead", leadError);
          setError("We couldn’t load this lead. Please try again.");
          return;
        }

        if (lead.team_id !== teamId) {
          setError("This lead doesn’t belong to your current workspace/team.");
          return;
        }

        const cv = lead.custom_values ?? {};
        const colName =
          typeof lead.lead_name === "string" ? lead.lead_name : "";

        const cvFirst = typeof cv.first_name === "string" ? cv.first_name : "";
        const cvLast = typeof cv.last_name === "string" ? cv.last_name : "";
        const cvSingle =
          typeof cv.lead_name === "string"
            ? cv.lead_name
            : [cvFirst, cvLast].filter(Boolean).join(" ");

        const initialFull = (colName || cvSingle || "").trim();

        setFields(defs ?? []);
        setStages(stageDefs ?? []);

        setForm({
          ...EMPTY_FORM,
          stage: lead.stage || stageDefs?.[0]?.name || "",

          niche: lead.niche ?? "",
          leadType: (lead.lead_type ?? "business") as LeadType,
          gender: (lead.gender ?? "") as Gender | "",

          country: lead.country ?? "",
          region: lead.region ?? "",
          city: lead.city ?? "",
          postalCode: lead.postal_code ?? "",

          primaryContactType: ((lead.primary_contact_type as ContactType) ??
            "other") as ContactType,
          primaryContactValue: lead.primary_contact_value ?? "",

          sourceCategory: (lead.source_category ?? "inbound") as SourceCategory,
          sourceName: (lead.source_name ?? "other") as SourceName,

          customValues: cv,
          notes: lead.notes ?? "",

          // editor defaults
          firstName: cvFirst,
          lastName: cvLast,
          leadName: initialFull,
        });
      } catch (e) {
        console.error("[EditLead] unexpected load error", e);
        if (!cancelled)
          setError("We couldn’t load this lead. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, teamId, workspaceLoading]);

  function validate(): string | null {
    if (!form.stage) return "Pipeline stage is required.";
    if (!fullName) return "Lead name is required.";
    if (!form.niche.trim()) return "Niche / Industry is required.";
    if (form.leadType === "individual" && !form.gender)
      return "Gender is required for individuals.";

    if (!form.country.trim()) return "Country is required.";
    if (!form.region.trim()) return "State / Region is required.";
    if (!form.city.trim()) return "City is required.";

    if (!form.primaryContactType) return "Primary contact type is required.";
    if (!form.primaryContactValue.trim())
      return "Primary contact value is required.";

    if (!form.sourceCategory) return "Source category is required.";
    if (!form.sourceName) return "Source name is required.";

    return null;
  }

  function renderCustomField(field: LeadFieldDefinition) {
    const value = form.customValues?.[field.key] ?? "";

    const baseLabel =
      "block text-xs font-medium uppercase tracking-wide text-slate-600";

    const baseInput =
      "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

    if (field.type === "text" || field.type === "link") {
      return (
        <div key={field.key} className="space-y-1">
          <label className={baseLabel}>{field.label}</label>
          <input
            className={baseInput}
            value={value}
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
            value={value}
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
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={Boolean(value)}
              onChange={(e) => setCustom(field.key, e.target.checked)}
            />
            <span>Yes</span>
          </label>
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.key} className="space-y-1">
          <label className={baseLabel}>{field.label}</label>
          <select
            className={baseInput}
            value={value}
            onChange={(e) => setCustom(field.key, e.target.value)}
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
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
    if (!teamId || !id) return;

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const cleanNotes = normalizeNullishString(form.notes);
      const cleanPostal = normalizeNullishString(form.postalCode);

      // ✅ keep backward compat mirror in custom_values
      const nextCustomValues = { ...(form.customValues ?? {}) };
      nextCustomValues.lead_name = fullName;

      if (leadNameMode === "split") {
        nextCustomValues.first_name = form.firstName;
        nextCustomValues.last_name = form.lastName;
      }

      const payload: Partial<LeadRow> & { updated_at: string } = {
        stage: form.stage,

        // ✅ save to real column
        lead_name: normalizeNullishString(fullName),

        niche: form.niche.trim(),
        lead_type: form.leadType,
        gender: form.leadType === "individual" ? (form.gender as Gender) : null,

        country: form.country.trim(),
        region: form.region.trim(),
        city: form.city.trim(),
        postal_code: cleanPostal,

        primary_contact_type: form.primaryContactType,
        primary_contact_value: form.primaryContactValue.trim(),

        source_category: form.sourceCategory,
        source_name: form.sourceName,

        custom_values: nextCustomValues,
        notes: cleanNotes,

        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("leads")
        .update(payload)
        .eq("id", id)
        .eq("team_id", teamId);

      if (updateError) {
        console.error("[EditLead] failed to update lead", updateError);
        const msg = updateError.message?.toLowerCase?.() ?? "";

        if (msg.includes("leads_gender_required_for_individual")) {
          setError("Gender is required when Lead Type is Individual.");
        } else if (msg.includes("leads_primary_contact_value_not_blank")) {
          setError("Primary contact value cannot be empty.");
        } else {
          setError("Saving changes failed. Please try again.");
        }
        return;
      }

      router.push(`/leads/${id}`);
    } catch (err) {
      console.error("[EditLead] unexpected save error", err);
      setError("Saving changes failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // -------- guards --------
  if (workspaceLoading || loading) {
    return (
      <div className="max-w-2xl space-y-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="h-6 w-40 rounded bg-slate-100 animate-pulse" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded bg-slate-100 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        We couldn&apos;t determine your team from the workspace context. Please
        open this page from your workspace or contact support.
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">Edit Lead</h1>
          <p className="text-sm text-slate-500">
            Update the lead’s core details, stage, and any custom fields your
            team tracks.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <p className="text-xs font-medium text-rose-600">{error}</p>
          )}

          {/* Core details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Core details
            </h2>

            {/* Lead Name */}
            {leadNameMode === "split" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block mb-1 text-sm font-medium text-slate-700">
                    First Name
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.firstName}
                    onChange={(e) => setField("firstName", e.target.value)}
                    placeholder="e.g. Alex"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-slate-700">
                    Last Name
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.lastName}
                    onChange={(e) => setField("lastName", e.target.value)}
                    placeholder="e.g. Johnson"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Lead Name
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.leadName}
                  onChange={(e) => setField("leadName", e.target.value)}
                  placeholder="e.g. Alex Johnson or Acme Inc."
                />
              </div>
            )}

            {/* Niche + Lead Type + Gender */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Niche / Industry
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.niche}
                  onChange={(e) => setField("niche", e.target.value)}
                  placeholder="e.g. Real Estate, SaaS, Healthcare"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Lead Type
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.leadType}
                  onChange={(e) =>
                    setField("leadType", e.target.value as LeadType)
                  }
                  required
                >
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </div>

              {showGender && (
                <div>
                  <label className="block mb-1 text-sm font-medium text-slate-700">
                    Gender
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.gender}
                    onChange={(e) =>
                      setField("gender", e.target.value as Gender)
                    }
                    required
                  >
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Location
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Country
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.country}
                  onChange={(e) => setField("country", e.target.value)}
                  placeholder="e.g. United States"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  State / Region
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.region}
                  onChange={(e) => setField("region", e.target.value)}
                  placeholder="e.g. California"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  City
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  placeholder="e.g. San Diego"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  ZIP / Postal Code{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.postalCode}
                  onChange={(e) => setField("postalCode", e.target.value)}
                  placeholder="e.g. 92101"
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Contact
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Primary Contact Type
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.primaryContactType}
                  onChange={(e) =>
                    setField(
                      "primaryContactType",
                      e.target.value as ContactType,
                    )
                  }
                  required
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="reddit">Reddit</option>
                  <option value="twitter_x">Twitter/X</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="snapchat">Snapchat</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="signal">Signal</option>
                  <option value="wechat">WeChat</option>
                  <option value="line">LINE</option>
                  <option value="discord">Discord</option>
                  <option value="slack">Slack</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  {contactValueLabel(form.primaryContactType)}
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.primaryContactValue}
                  onChange={(e) =>
                    setField("primaryContactValue", e.target.value)
                  }
                  placeholder={contactValuePlaceholder(form.primaryContactType)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Source
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Source Category
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.sourceCategory}
                  onChange={(e) =>
                    setField("sourceCategory", e.target.value as SourceCategory)
                  }
                  required
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                  <option value="referral">Referral</option>
                  <option value="partner">Partner</option>
                  <option value="purchased">Purchased</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Source Name
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.sourceName}
                  onChange={(e) =>
                    setField("sourceName", e.target.value as SourceName)
                  }
                  required
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="reddit">Reddit</option>
                  <option value="twitter_x">Twitter/X</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stage */}
          <div className="border-t border-slate-100 pt-4">
            <label className="block mb-1 text-sm font-medium text-slate-700">
              Pipeline Stage
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.stage}
              onChange={(e) => setField("stage", e.target.value)}
              required
            >
              {stages.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Custom fields */}
          {fields.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                Custom fields
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {fields.map(renderCustomField)}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Notes</h2>
            <p className="mb-2 text-xs text-slate-500">
              Internal notes about this lead. Only visible to your team.
            </p>
            <textarea
              className="min-h-[120px] w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Add context, objections, personal details, or anything else that helps your team close this deal."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-70 cursor-pointer"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/leads/${id}`)}
              className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
