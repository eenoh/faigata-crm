// src/app/leads/[id]/LeadDetailClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getLeadFieldDefinitions } from "@/modules/crm/data/leadFields";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/modules/crm/types/lead";

interface LeadData {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
  created_at: string;
  prospector_id?: string | null; // NEW: who created / owns the lead as prospector
  score?: number | null;
  score_grade?: string | null;
  score_breakdown?:
    | {
        ruleId: string;
        label: string;
        points: number;
      }[]
    | null;
  score_updated_at?: string | null;
}

type LeadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  channel: string | null;
  body: string;
  sent_at: string;
  sender_profile_id: string | null;
  sender?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
};

type ScoreThresholds = { low: number; high: number };

type CreatorProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export function LeadDetailClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [thresholds, setThresholds] = useState<ScoreThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  const [creator, setCreator] = useState<CreatorProfile | null>(null); // NEW

  /* ---------- 1) Load teamId from Supabase ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[LeadDetail] No authenticated user", userError);
          if (!cancelled) {
            setTeamId(null);
            setWorkspaceLoaded(true);
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("[LeadDetail] Failed to load profile", profileError);
        }

        let tId: string | null = profile?.team_id ?? null;

        if (!tId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) {
            tId = metaTeam;
          }
        }

        if (!cancelled) {
          setTeamId(tId);
          setWorkspaceLoaded(true);
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load workspace context", err);
        if (!cancelled) {
          setTeamId(null);
          setWorkspaceLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- 2) Load lead + messages once teamId is known ---------- */

  useEffect(() => {
    let cancelled = false;

    async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
      if (!raw) return null;
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw;
      }

      try {
        const { data, error } = await supabase.storage
          .from("avatars")
          .createSignedUrl(raw, 60 * 60 * 24 * 7);

        if (error) {
          console.error("[LeadDetail] avatar sign error", error);
          return null;
        }
        return data?.signedUrl ?? null;
      } catch (err) {
        console.error("[LeadDetail] avatar sign unexpected error", err);
        return null;
      }
    }

    async function loadLead() {
      if (!workspaceLoaded) return;
      if (!teamId || !id) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const [defs, leadRes, configRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          (async () => {
            const res = await fetch(
              `/api/crm/leads?teamId=${encodeURIComponent(
                teamId
              )}&id=${encodeURIComponent(id)}`
            );

            const ct = res.headers.get("content-type") ?? "";

            if (!res.ok) {
              const text = await res.text();
              console.error(
                "[LeadDetail] /api/crm/leads error",
                res.status,
                ct,
                text.slice(0, 400)
              );
              throw new Error("Failed to load lead");
            }

            if (!ct.includes("application/json")) {
              const text = await res.text();
              console.error(
                "[LeadDetail] /api/crm/leads returned non-JSON",
                res.status,
                ct,
                text.slice(0, 400)
              );
              throw new Error("Lead API did not return JSON");
            }

            return (await res.json()) as LeadData;
          })(),
          (async (): Promise<ScoreThresholds | null> => {
            const res = await fetch("/api/crm/lead-scoring-config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamId, action: "get" }),
            });

            const ct = res.headers.get("content-type") ?? "";
            if (!res.ok || !ct.includes("application/json")) {
              return null;
            }

            const json = await res.json();
            const low = Number(json.thresholds?.low);
            const high = Number(json.thresholds?.high);

            if (Number.isNaN(low) || Number.isNaN(high)) return null;
            return { low, high };
          })(),
        ]);

        if (cancelled) return;

        setFields(defs);
        setLead(leadRes);
        setThresholds(configRes);

        // NEW: load creator (prospector) profile for "Lead created" entry
        setCreator(null);
        if (leadRes.prospector_id) {
          const { data: creatorProfile, error: creatorError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", leadRes.prospector_id)
            .single();

          if (!cancelled && !creatorError && creatorProfile) {
            const signedAvatar = await resolveAvatarUrl(
              creatorProfile.avatar_url
            );
            if (!cancelled) {
              setCreator({
                ...creatorProfile,
                avatar_url: signedAvatar,
              });
            }
          } else if (creatorError) {
            console.error(
              "[LeadDetail] Failed to load creator profile",
              creatorError
            );
          }
        }
      } catch (err) {
        console.error("[LeadDetail] Failed to load lead detail", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadMessages() {
      if (!workspaceLoaded) return;
      if (!teamId || !id) {
        if (!cancelled) setMessagesLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/crm/lead-messages?teamId=${encodeURIComponent(
            teamId
          )}&leadId=${encodeURIComponent(id)}`
        );

        const ct = res.headers.get("content-type") ?? "";

        if (!res.ok) {
          const text = await res.text();
          console.error(
            "[LeadDetail] /api/crm/lead-messages error",
            res.status,
            ct,
            text.slice(0, 400)
          );
          throw new Error("Failed to load messages");
        }

        if (!ct.includes("application/json")) {
          const text = await res.text();
          console.error(
            "[LeadDetail] /api/crm/lead-messages returned non-JSON",
            res.status,
            ct,
            text.slice(0, 400)
          );
          throw new Error("Messages API did not return JSON");
        }

        const data = (await res.json()) as LeadMessage[];

        if (cancelled) return;

        const withResolvedAvatars: LeadMessage[] = await Promise.all(
          (data ?? []).map(async (m) => {
            if (m.sender?.avatar_url) {
              const signed = await resolveAvatarUrl(m.sender.avatar_url);
              return {
                ...m,
                sender: { ...m.sender, avatar_url: signed },
              };
            }
            return m;
          })
        );

        if (!cancelled) setMessages(withResolvedAvatars);
      } catch (err) {
        console.error("[LeadDetail] Failed to load messages", err);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }

    loadLead();
    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, id]);

  /* ---------- helpers (no hooks) ---------- */

  function initialsFromName(first?: string | null, last?: string | null) {
    const f = first?.trim()?.charAt(0).toUpperCase();
    const l = last?.trim()?.charAt(0).toUpperCase();
    if (f && l) return `${f}${l}`;
    if (f) return f;
    if (l) return l;
    return "U";
  }

  function initialsFromSingleString(label: string) {
    const parts = label.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      (parts[0]?.charAt(0).toUpperCase() || "L") +
      (parts[1]?.charAt(0).toUpperCase() || "")
    );
  }

  function formatChannel(c: string | null): string {
    if (!c) return "DM";
    return c.toUpperCase();
  }

  function getScoreGrade(score: number | null) {
    if (score == null) {
      return {
        label: "Unscored",
        short: "?",
        circle: "bg-slate-100 text-slate-500",
      };
    }

    if (!thresholds) {
      return {
        label: "Scored",
        short: "S",
        circle: "bg-amber-100 text-amber-800",
      };
    }

    const { low, high } = thresholds;

    if (score < low) {
      return {
        label: "Low",
        short: "L",
        circle: "bg-rose-100 text-rose-800",
      };
    }

    if (score >= high) {
      return {
        label: "High",
        short: "H",
        circle: "bg-emerald-100 text-emerald-800",
      };
    }

    return {
      label: "Medium",
      short: "M",
      circle: "bg-amber-100 text-amber-800",
    };
  }

  /* ---------- derived values ---------- */

  const leadLabel: string = useMemo(() => {
    if (!lead) return "Lead in pipeline";

    const cv = lead.custom_values ?? {};
    const preferredKeys = [
      "name",
      "full_name",
      "first_name",
      "last_name",
      "company",
      "account",
      "email",
    ];

    const lowerEntries = Object.entries(cv).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]);

    for (const pref of preferredKeys) {
      const match = lowerEntries.find(
        ([key, value]) =>
          key.includes(pref) &&
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
      );
      if (match) return String(match[1]).trim();
    }

    const anyField = lowerEntries.find(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        typeof value === "string" &&
        String(value).trim() !== ""
    );
    if (anyField) return String(anyField[1]).trim();

    const stageLabel = lead.stage || "Pipeline";
    return `Lead in “${stageLabel}” stage`;
  }, [lead]);

  const leadInitials = useMemo(
    () => initialsFromSingleString(leadLabel),
    [leadLabel]
  );

  const sortedMessages: LeadMessage[] = useMemo(() => {
    if (!messages.length) return [];
    return [...messages].sort(
      (a, b) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
  }, [messages]);

  const creatorName = useMemo(() => {
    if (!creator) return "Prospector";
    const first = creator.first_name ?? "";
    const last = creator.last_name ?? "";
    const full = `${first} ${last}`.trim();
    return full || "Prospector";
  }, [creator]);

  const creatorInitials = useMemo(
    () => initialsFromName(creator?.first_name, creator?.last_name),
    [creator?.first_name, creator?.last_name]
  );

  const creatorAvatarUrl = creator?.avatar_url ?? null;

  /* ---------- early returns ---------- */

  if (workspaceLoaded && !teamId) {
    return (
      <p className="text-sm text-slate-500">
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading lead…</p>;
  }

  if (!lead) {
    return <p className="text-sm text-slate-500">Lead not found.</p>;
  }

  const created = new Date(lead.created_at);
  const scoreUpdated = lead.score_updated_at
    ? new Date(lead.score_updated_at)
    : null;

  const score = lead.score ?? null;
  const gradeInfo = getScoreGrade(score);

  /* ---------- render ---------- */

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
        {/* LEFT: lead details */}
        <div className="space-y-6 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Lead Details
              </h1>
              <p className="text-sm text-slate-500">
                Created on {created.toLocaleDateString()} at{" "}
                {created.toLocaleTimeString()}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push(`/leads/${id}/edit`)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer w-15"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => router.push(`/leads/${id}/delete`)}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer w-15"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Lead score */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Lead Score
            </h2>
            {score != null ? (
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${gradeInfo.circle}`}
                >
                  {gradeInfo.short}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {score} · {gradeInfo.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {scoreUpdated
                      ? `Last updated ${scoreUpdated.toLocaleDateString()} at ${scoreUpdated.toLocaleTimeString()}`
                      : "Higher is better."}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No score yet. Configure lead scoring in Settings → Lead
                scoring.
              </p>
            )}

            {lead.score_breakdown && lead.score_breakdown.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2">
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Why this score
                </h3>
                <ul className="space-y-1 text-[11px] text-slate-700">
                  {lead.score_breakdown.map((item) => (
                    <li
                      key={item.ruleId}
                      className="flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      <span className="font-semibold text-emerald-600">
                        +{item.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              Pipeline Stage
            </h2>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
              {lead.stage || "—"}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Lead Fields
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {fields.map((field) => {
                const value = lead.custom_values?.[field.key];

                if (
                  field.type === "link" &&
                  typeof value === "string" &&
                  value
                ) {
                  const raw = value.trim();
                  const href = /^https?:\/\//i.test(raw)
                    ? raw
                    : `https://${raw}`;

                  return (
                    <div key={field.key} className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {field.label}
                      </p>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        <span className="truncate">{raw}</span>
                      </a>
                    </div>
                  );
                }

                return (
                  <div key={field.key} className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {field.label}
                    </p>
                    <p className="text-sm text-slate-800">
                      {value !== null && value !== undefined && value !== ""
                        ? String(value)
                        : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: activity timeline */}
        <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Activity Timeline
              </h2>
              <p className="text-xs text-slate-500">
                Lead creation, stage changes, and messages in one view.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/leads/${id}/messages`)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-600 shadow-sm hover:border-emerald-400 hover:bg-emerald-100 cursor-pointer"
              title="Log new message"
            >
              +
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messagesLoading ? (
              <p className="text-xs text-slate-500">Loading activity…</p>
            ) : sortedMessages.length === 0 ? (
              <>
                <p className="text-xs text-slate-500">
                  No messages yet. Use the “+” button above to log your
                  outbound / inbound touches.
                </p>

                {/* Lead created entry (no other messages) */}
                <div className="mt-4 text-xs">
                  <div className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {creatorAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={creatorAvatarUrl}
                            alt={creatorName}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
                            {creatorInitials}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">
                              {creatorName}
                            </span>
                            <span className="text-slate-400">
                              · Prospector
                            </span>
                          </span>
                          <span>
                            {created.toLocaleDateString()}{" "}
                            {created.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-[11px] text-slate-800">
                          Lead created
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-xs">
                {sortedMessages.map((m) => {
                  const ts = new Date(m.sent_at);
                  const isOutbound = m.direction === "outbound";
                  const isPipeline =
                    (m.channel ?? "").toLowerCase() === "pipeline";

                  const first = m.sender?.first_name ?? "";
                  const last = m.sender?.last_name ?? "";
                  const fullName = `${first} ${last}`.trim() || "Team member";

                  const authorName = isOutbound ? fullName : leadLabel;
                  const avatarUrl = isOutbound
                    ? m.sender?.avatar_url ?? null
                    : null;
                  const initials = isOutbound
                    ? initialsFromName(first, last)
                    : leadInitials;

                  return (
                    <div key={m.id} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 items-center justify-center">
                          {isPipeline ? (
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          ) : avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatarUrl}
                              alt={authorName}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                                isOutbound ? "bg-indigo-600" : "bg-slate-500"
                              }`}
                            >
                              {initials}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <span className="font-semibold text-slate-700">
                                {authorName}
                              </span>
                              <span className="text-slate-400">
                                · {isPipeline ? "Setter" : isOutbound ? "Setter" : "Lead"} ·{" "}
                                {formatChannel(m.channel)}
                              </span>
                            </span>
                            <span>
                              {ts.toLocaleDateString()}{" "}
                              {ts.toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-[11px] text-slate-800">
                            {m.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Lead created entry at the end (with messages) */}
                <div className="pt-1">
                  <div className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {creatorAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={creatorAvatarUrl}
                            alt={creatorName}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
                            {creatorInitials}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">
                              {creatorName}
                            </span>
                            <span className="text-slate-400">
                              · Prospector
                            </span>
                          </span>
                          <span>
                            {created.toLocaleDateString()}{" "}
                            {created.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-[11px] text-slate-800">
                          Lead created
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
