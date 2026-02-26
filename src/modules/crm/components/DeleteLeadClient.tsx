// src/modules/crm/components/DeleteLeadClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "next-themes";

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
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

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
  if (workspaceLoading || loading)
    return <DeleteLeadLoadingState isDark={isDark} />;

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

  if (!teamId) {
    return (
      <p
        className={["text-sm", isDark ? "text-rose-300" : "text-rose-500"].join(
          " ",
        )}
      >
        We couldn&apos;t determine your team from the workspace context. Please
        open this page from your workspace or contact support.
      </p>
    );
  }

  if (!lead) {
    return (
      <p className={["text-sm", mutedText].join(" ")}>
        {error ?? "Lead not found."}
      </p>
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
    <div className={`h-full overflow-y-auto ${pageText}`}>
      <div className="max-w-3xl space-y-6">
        {/* Danger header */}
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
              Delete this Lead?
            </h1>
            <p className={`mt-1 text-sm ${dangerBody}`}>
              This action is permanent and cannot be undone. All data for this
              lead will be removed from the{" "}
              <span className="font-semibold">current workspace</span>.
            </p>
          </div>
        </div>

        {/* Lead preview card */}
        <div className={`rounded-2xl border px-5 py-4 shadow-sm ${cardShell}`}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2
                className={`text-sm font-semibold uppercase tracking-wide ${mutedText}`}
              >
                Lead preview
              </h2>
              <p
                className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                Review the lead details below before deleting.
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${stageWrap}`}
            >
              <span
                className={`text-[11px] font-medium uppercase tracking-wide ${stageLabel}`}
              >
                Stage
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stagePill}`}
              >
                {lead.stage || "—"}
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

          {/* Core Details */}
          <div className={`mb-4 rounded-xl border px-4 py-3 ${softPanel}`}>
            <div className="mb-2">
              <h3
                className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
              >
                Core details
              </h3>
              <p
                className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                These are stored in the lead’s main columns.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div
                className={`rounded-xl border px-3 py-2 md:col-span-2 ${innerCard}`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Lead name
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {safeValue(leadLabel)}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Niche / Industry
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {safeValue(lead.niche)}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Lead type
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {labelizeEnum(lead.lead_type)}
                </p>
              </div>

              {lead.lead_type === "individual" && (
                <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                  >
                    Gender
                  </p>
                  <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                    {labelizeEnum(lead.gender)}
                  </p>
                </div>
              )}

              <div
                className={`rounded-xl border px-3 py-2 md:col-span-2 ${innerCard}`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Location
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {locationLine || "—"}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Primary contact type
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {labelizeEnum(lead.primary_contact_type)}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
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
                    className={`mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline ${linkCls}`}
                  >
                    <span className="truncate">{contactValue || "—"}</span>
                  </a>
                ) : (
                  <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                    {contactValue || "—"}
                  </p>
                )}
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Source category
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {labelizeEnum(lead.source_category)}
                </p>
              </div>

              <div className={`rounded-xl border px-3 py-2 ${innerCard}`}>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
                >
                  Source name
                </p>
                <p className={`mt-0.5 text-sm break-words ${titleText}`}>
                  {labelizeEnum(lead.source_name)}
                </p>
              </div>
            </div>
          </div>

          {/* Additional fields */}
          <div className={`rounded-xl border px-4 py-3 ${softPanel}`}>
            <div className="mb-2">
              <h3
                className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}
              >
                Additional fields
              </h3>
              <p
                className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}
              >
                Custom fields configured for this workspace.
              </p>
            </div>

            {fields.length === 0 ? (
              <p className={`text-sm ${mutedText}`}>
                This workspace has no custom fields configured for leads.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((field) => {
                  const raw = (customValues as any)[field.key];
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
                          <span className="truncate">{displayValue}</span>
                        </a>
                      ) : (
                        <p
                          className={`mt-0.5 text-sm break-words ${titleText}`}
                        >
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
              className={[
                "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm cursor-pointer",
                deleteBtn,
                "disabled:opacity-70 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {deleting ? "Deleting…" : "Delete Lead"}
            </button>

            {/* safer than pushing a route that may not exist */}
            <button
              type="button"
              onClick={() => router.back()}
              className={`text-sm font-medium cursor-pointer ${cancelLink}`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
