// src/modules/crm/components/DeleteLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";

interface LeadRow {
  id: string;
  team_id: string;
  stage: string;

  // core fields (real columns)
  lead_name?: string | null;

  niche?: string | null;
  lead_type?: "individual" | "business" | null;
  gender?: "male" | "female" | null;

  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;

  primary_contact_type?:
    | "email"
    | "phone"
    | "instagram"
    | "facebook"
    | "reddit"
    | "twitter_x"
    | "linkedin"
    | "tiktok"
    | "youtube"
    | "whatsapp"
    | "telegram"
    | "discord"
    | "other"
    | null;

  primary_contact_value?: string | null;

  source_category?:
    | "inbound"
    | "outbound"
    | "referral"
    | "partner"
    | "purchased"
    | null;
  source_name?:
    | "instagram"
    | "facebook"
    | "reddit"
    | "twitter_x"
    | "other"
    | null;

  custom_values: Record<string, any> | null;
}

/* -------------------- helpers -------------------- */

function safeValue(v: any) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length ? s : "—";
}

function labelizeEnum(v: string | null | undefined) {
  if (!v) return "—";
  const s = String(v).trim();
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function looksLikeUrl(v: string) {
  return /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}([/].*)?$/i.test(v);
}

function normalizeUrl(v: string) {
  const raw = v.trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function contactHref(
  type: LeadRow["primary_contact_type"],
  value: string,
): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (type === "email") return `mailto:${raw}`;
  if (type === "phone") return `tel:${raw.replace(/\s+/g, "")}`;

  if (looksLikeUrl(raw)) return normalizeUrl(raw);
  return null;
}

function isLikelyLinkField(def: LeadFieldDefinition) {
  // if your LeadFieldDefinition has a 'type' union, keep this.
  // fallback: treat keys containing url/link as link-like.
  const t = String((def as any)?.type ?? "").toLowerCase();
  if (t === "link" || t === "url") return true;

  const k = String(def.key ?? "").toLowerCase();
  return k.includes("url") || k.includes("link") || k.includes("website");
}

/* -------------------- loading UI -------------------- */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

function DeleteLeadLoadingState() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl space-y-6">
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-rose-100">
            <SkeletonBlock className="h-4 w-4 rounded-full bg-rose-200" />
          </div>
          <div className="flex-1">
            <SkeletonBlock className="h-5 w-56 bg-rose-100" />
            <SkeletonBlock className="mt-2 h-4 w-full max-w-[520px] bg-rose-100" />
            <SkeletonBlock className="mt-2 h-4 w-full max-w-[420px] bg-rose-100" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1">
              <SkeletonBlock className="h-3 w-10 bg-indigo-100" />
              <SkeletonBlock className="h-5 w-16 rounded-full bg-indigo-200" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="mt-2 h-4 w-44 max-w-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <SkeletonBlock className="h-10 w-28 rounded-lg" />
            <SkeletonBlock className="h-10 w-20 rounded-lg" />
          </div>
        </div>

        <SkeletonBlock className="h-3 w-56" />
      </div>
    </div>
  );
}

/* -------------------- component -------------------- */

export function DeleteLeadClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

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
        setLoading(false);
        setError("We couldn’t determine your team or lead id.");
        return;
      }

      try {
        const [defs, leadRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          supabase
            .from("leads")
            .select(
              `
              id, team_id, stage,
              lead_name,
              niche, lead_type, gender,
              country, region, city, postal_code,
              primary_contact_type, primary_contact_value,
              source_category, source_name,
              custom_values
            `,
            )
            .eq("id", id)
            .single<LeadRow>(),
        ]);

        if (cancelled) return;

        if (leadRes.error || !leadRes.data) {
          console.error(
            "[DeleteLead] failed to load lead",
            leadRes.error ?? "no data",
          );
          setError("We couldn’t load this lead. Please try again.");
          setLead(null);
          return;
        }

        if (leadRes.data.team_id !== teamId) {
          console.warn(
            "[DeleteLead] lead team mismatch",
            leadRes.data.team_id,
            teamId,
          );
          setError("This lead doesn’t belong to your current workspace.");
          setLead(null);
          return;
        }

        setFields(defs ?? []);
        setLead(leadRes.data);
        setError(null);
      } catch (err) {
        console.error("[DeleteLead] unexpected load error", err);
        if (!cancelled) {
          setError("We couldn’t load this lead. Please try again.");
          setLead(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, teamId, workspaceLoading]);

  async function handleConfirmDelete() {
    if (!teamId || !id) return;
    setDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("leads")
        .delete()
        .eq("id", id)
        .eq("team_id", teamId);

      if (deleteError) {
        console.error("[DeleteLead] failed to delete lead", deleteError);
        setError("Failed to delete lead. Please try again.");
        setDeleting(false);
        return;
      }

      router.push("/leads");
    } catch (err) {
      console.error("[DeleteLead] unexpected delete error", err);
      setError("Failed to delete lead. Please try again.");
      setDeleting(false);
    }
  }

  // -------- guards (NO hooks below this line) --------
  if (workspaceLoading || loading) return <DeleteLeadLoadingState />;

  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        We couldn&apos;t determine your team from the workspace context. Please
        open this page from your workspace or contact support.
      </p>
    );
  }

  if (!lead) {
    return (
      <p className="text-sm text-slate-500">{error ?? "Lead not found."}</p>
    );
  }

  const customValues = lead.custom_values ?? {};

  // compute label without hooks (prevents hook-order mismatch)
  const leadLabel = (() => {
    const direct = String(lead.lead_name ?? "").trim();
    if (direct) return direct;

    const cv = customValues ?? {};
    const legacy =
      String((cv as any)?.lead_name ?? "").trim() ||
      String((cv as any)?.name ?? "").trim() ||
      String((cv as any)?.full_name ?? "").trim() ||
      String((cv as any)?.email ?? "").trim();

    return legacy || "—";
  })();

  const postal = String(lead.postal_code ?? "").trim();
  const city = String(lead.city ?? "").trim();
  const region = String(lead.region ?? "").trim();
  const country = String(lead.country ?? "").trim();
  const firstPart = [postal, city].filter(Boolean).join(" ").trim();
  const locationLine = [firstPart, region, country]
    .filter(Boolean)
    .join(", ")
    .trim();

  const contactValue = String(lead.primary_contact_value ?? "").trim();
  const contactLink = contactValue
    ? contactHref(lead.primary_contact_type ?? null, contactValue)
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl space-y-6">
        {/* Danger header */}
        <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-rose-100">
            <span className="text-lg font-semibold text-rose-600">!</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-rose-900">
              Delete this Lead?
            </h1>
            <p className="mt-1 text-sm text-rose-800">
              This action is permanent and cannot be undone. All data for this
              lead will be removed from the{" "}
              <span className="font-semibold">current workspace</span>.
            </p>
          </div>
        </div>

        {/* Lead preview card */}
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Lead preview
              </h2>
              <p className="text-xs text-slate-400">
                Review the lead details below before deleting.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Stage
              </span>
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {lead.stage || "—"}
              </span>
            </div>
          </div>

          {error && (
            <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>
          )}

          {/* Core Details */}
          <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Core details
              </h3>
              <p className="text-[11px] text-slate-400">
                These are stored in the lead’s main columns.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Lead name
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {safeValue(leadLabel)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Niche / Industry
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {safeValue(lead.niche)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Lead type
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {labelizeEnum(lead.lead_type)}
                </p>
              </div>

              {lead.lead_type === "individual" && (
                <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Gender
                  </p>
                  <p className="mt-0.5 text-sm text-slate-900 break-words">
                    {labelizeEnum(lead.gender)}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 md:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Location
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {locationLine || "—"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Primary contact type
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {labelizeEnum(lead.primary_contact_type)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Primary contact
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
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    <span className="truncate">{contactValue || "—"}</span>
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm text-slate-900 break-words">
                    {contactValue || "—"}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Source category
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {labelizeEnum(lead.source_category)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Source name
                </p>
                <p className="mt-0.5 text-sm text-slate-900 break-words">
                  {labelizeEnum(lead.source_name)}
                </p>
              </div>
            </div>
          </div>

          {/* Additional fields — SAME STYLE as Core Details */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Additional fields
              </h3>
              <p className="text-[11px] text-slate-400">
                Custom fields configured for this workspace.
              </p>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-slate-500">
                This workspace has no custom fields configured for leads.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((field) => {
                  const raw = customValues[field.key];
                  const empty =
                    raw === undefined ||
                    raw === null ||
                    String(raw).trim() === "";
                  const displayValue = empty ? "—" : String(raw);

                  const isLink =
                    isLikelyLinkField(field) &&
                    !empty &&
                    typeof raw === "string";
                  const href = isLink ? normalizeUrl(String(raw)) : null;

                  return (
                    <div
                      key={field.key}
                      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {field.label}
                      </p>

                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <span className="truncate">{displayValue}</span>
                        </a>
                      ) : (
                        <p className="mt-0.5 text-sm text-slate-900 break-words">
                          {displayValue}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-70 cursor-pointer"
            >
              {deleting ? "Deleting…" : "Delete Lead"}
            </button>

            {/* safer than pushing a route that may not exist */}
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
