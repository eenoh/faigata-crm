// src/app/leads/[id]/edit/EditLeadClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { getPipelineStages } from "@/modules/crm/data/pipelineStages";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import type { PipelineStageDef } from "@/modules/crm/data/pipelineStages";
import { useWorkspace } from "@/context/WorkspaceContext";

/**
 * NOTE ABOUT "LEAD NAME"
 * ✅ Your schema DOES have a dedicated `lead_name` column.
 * We still keep `custom_values.lead_name` in sync for backward compatibility.
 */

type LeadType = "individual" | "business";
type Gender = "male" | "female";

/**
 * ✅ Expanded Primary Contact Types
 */
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

type SourceCategory = "inbound" | "outbound" | "referral" | "partner" | "purchased";
type SourceName = "instagram" | "facebook" | "reddit" | "twitter_x" | "other";

interface LeadRow {
  id: string;
  team_id: string;
  stage: string;

  // ✅ real column
  lead_name: string | null;

  // system fields
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

  // existing fields
  custom_values: Record<string, any> | null;
  notes: string | null;
}

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

function normalizeNullishString(v: string) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export function EditLeadClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [stages, setStages] = useState<PipelineStageDef[]>([]);
  const [stage, setStage] = useState("");

  // system fields state
  const [niche, setNiche] = useState("");
  const [leadType, setLeadType] = useState<LeadType>("business");
  const [gender, setGender] = useState<Gender | "">("");

  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const [primaryContactType, setPrimaryContactType] = useState<ContactType>("other");
  const [primaryContactValue, setPrimaryContactValue] = useState("");

  const [sourceCategory, setSourceCategory] = useState<SourceCategory>("inbound");
  const [sourceName, setSourceName] = useState<SourceName>("other");

  // custom values + notes
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ keep a dedicated lead_name state (real column)
  const [leadNameCol, setLeadNameCol] = useState<string>("");

  // Derived: whether to show split vs single editor
  const leadNameMode = useMemo(() => {
    const hasFirstOrLast =
      typeof customValues?.first_name === "string" || typeof customValues?.last_name === "string";
    return hasFirstOrLast ? "split" : "single";
  }, [customValues]);

  const [leadName, setLeadName] = useState(""); // single input
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // -------- load lead + config --------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (workspaceLoading) return;

      if (!teamId || !id) {
        setLoading(false);
        setError("We couldn’t determine your team or lead id.");
        return;
      }

      try {
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
              "lead_name", // ✅ preload lead name from real column
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
            ].join(",")
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

        setFields(defs ?? []);
        setStages(stageDefs ?? []);
        setStage(lead.stage || stageDefs?.[0]?.name || "");

        // system fields
        setNiche(lead.niche ?? "");
        setLeadType((lead.lead_type ?? "business") as LeadType);
        setGender((lead.gender ?? "") as Gender | "");

        setCountry(lead.country ?? "");
        setRegion(lead.region ?? "");
        setCity(lead.city ?? "");
        setPostalCode(lead.postal_code ?? "");

        setPrimaryContactType(((lead.primary_contact_type as ContactType) ?? "other") as ContactType);
        setPrimaryContactValue(lead.primary_contact_value ?? "");

        setSourceCategory((lead.source_category ?? "inbound") as SourceCategory);
        setSourceName((lead.source_name ?? "other") as SourceName);

        // custom + notes
        const cv = lead.custom_values ?? {};
        setCustomValues(cv);
        setNotes(lead.notes ?? "");

        // ✅ preload lead name from lead_name column first, then fall back to custom_values
        const colName = typeof lead.lead_name === "string" ? lead.lead_name : "";
        setLeadNameCol(colName);

        const cvFirst = typeof cv.first_name === "string" ? cv.first_name : "";
        const cvLast = typeof cv.last_name === "string" ? cv.last_name : "";
        const cvSingleRaw =
          typeof cv.lead_name === "string" ? cv.lead_name : [cvFirst, cvLast].filter(Boolean).join(" ");

        const initialFull = (colName || cvSingleRaw || "").trim();

        setFirstName(cvFirst);
        setLastName(cvLast);
        setLeadName(initialFull);

        setError(null);
      } catch (err) {
        console.error("[EditLead] unexpected load error", err);
        if (!cancelled) setError("We couldn’t load this lead. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, teamId, workspaceLoading]);

  function handleCustomChange(key: string, value: any) {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  }

  // ✅ Keep lead_name in sync:
  // - write to real column state (leadNameCol)
  // - mirror into custom_values.lead_name (+ first/last if split)
  useEffect(() => {
    const full =
      leadNameMode === "split"
        ? [firstName, lastName].filter(Boolean).join(" ").trim()
        : leadName.trim();

    setLeadNameCol(full);

    setCustomValues((prev) => {
      const next = { ...prev };

      if (leadNameMode === "split") {
        next.first_name = firstName;
        next.last_name = lastName;
        next.lead_name = full;
        return next;
      }

      next.lead_name = full;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, leadName, leadNameMode]);

  // If lead type changes to business, clear gender
  useEffect(() => {
    if (leadType !== "individual") setGender("");
  }, [leadType]);

  function validate() {
    if (!stage) return "Pipeline stage is required.";

    const full =
      leadNameMode === "split"
        ? [firstName, lastName].filter(Boolean).join(" ").trim()
        : leadName.trim();

    if (!full) return "Lead name is required.";

    if (!niche.trim()) return "Niche / Industry is required.";
    if (!leadType) return "Lead type is required.";
    if (leadType === "individual" && !gender) return "Gender is required for individuals.";

    if (!country.trim()) return "Country is required.";
    if (!region.trim()) return "State / Region is required.";
    if (!city.trim()) return "City is required.";

    if (!primaryContactType) return "Primary contact type is required.";
    if (!primaryContactValue.trim()) return "Primary contact value is required.";

    if (!sourceCategory) return "Source category is required.";
    if (!sourceName) return "Source name is required.";

    return null;
  }

  // -------- save --------
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
      const cleanNotes = notes.trim() === "" ? null : notes.trim();
      const cleanPostal = postalCode.trim() === "" ? null : postalCode.trim();

      const fullName =
        leadNameMode === "split"
          ? [firstName, lastName].filter(Boolean).join(" ").trim()
          : leadName.trim();

      const payload: Partial<LeadRow> & { updated_at?: string } = {
        stage,

        // ✅ save to real column
        lead_name: normalizeNullishString(fullName),

        niche: niche.trim(),
        lead_type: leadType,
        gender: leadType === "individual" ? (gender as Gender) : null,

        country: country.trim(),
        region: region.trim(),
        city: city.trim(),
        postal_code: cleanPostal,

        primary_contact_type: primaryContactType,
        primary_contact_value: primaryContactValue.trim(),

        source_category: sourceCategory,
        source_name: sourceName,

        // ✅ keep backward compat mirror in custom_values too
        custom_values: { ...(customValues ?? {}), lead_name: fullName },
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
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        We couldn&apos;t determine your team from the workspace context. Please open this page from
        your workspace or contact support.
      </p>
    );
  }

  const showGender = leadType === "individual";

  // -------- UI --------
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Edit Lead</h1>
            <p className="text-sm text-slate-500">
              Update the lead’s core details, stage, and any custom fields your team tracks.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          {/* Core details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Core details</h2>

            {/* Lead Name */}
            {leadNameMode === "split" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block mb-1 text-sm font-medium text-slate-700">First Name</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Alex"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-slate-700">Last Name</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Johnson"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">Lead Name</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
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
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. Real Estate, SaaS, Healthcare"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">Lead Type</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={leadType}
                  onChange={(e) => setLeadType(e.target.value as LeadType)}
                  required
                >
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </div>

              {showGender && (
                <div>
                  <label className="block mb-1 text-sm font-medium text-slate-700">Gender</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
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
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Location</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">Country</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. United States"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">State / Region</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. California"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">City</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. San Diego"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  ZIP / Postal Code <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 92101"
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Contact</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Primary Contact Type
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={primaryContactType}
                  onChange={(e) => setPrimaryContactType(e.target.value as ContactType)}
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
                  {contactValueLabel(primaryContactType)}
                </label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={primaryContactValue}
                  onChange={(e) => setPrimaryContactValue(e.target.value)}
                  placeholder={contactValuePlaceholder(primaryContactType)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="border-t border-slate-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Source</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block mb-1 text-sm font-medium text-slate-700">
                  Source Category
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={sourceCategory}
                  onChange={(e) => setSourceCategory(e.target.value as SourceCategory)}
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
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value as SourceName)}
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
            <label className="block mb-1 text-sm font-medium text-slate-700">Pipeline Stage</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
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
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Custom fields</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {fields.map((field) => {
                  const value = customValues[field.key] ?? "";

                  if (field.type === "text" || field.type === "link") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                          {field.label}
                        </label>
                        <input
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={value}
                          onChange={(e) => handleCustomChange(field.key, e.target.value)}
                        />
                      </div>
                    );
                  }

                  if (field.type === "number") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                          {field.label}
                        </label>
                        <input
                          type="number"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={value}
                          onChange={(e) =>
                            handleCustomChange(
                              field.key,
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                        />
                      </div>
                    );
                  }

                  if (field.type === "boolean") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                          {field.label}
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={Boolean(value)}
                            onChange={(e) => handleCustomChange(field.key, e.target.checked)}
                          />
                          <span>Yes</span>
                        </label>
                      </div>
                    );
                  }

                  if (field.type === "select") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                          {field.label}
                        </label>
                        <select
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={value}
                          onChange={(e) => handleCustomChange(field.key, e.target.value)}
                        >
                          <option value="">Select…</option>

                          {/* ✅ FIX: opt typed (no implicit any) */}
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
                })}
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
