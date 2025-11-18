"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getLeadFieldDefinitions } from "@/data/leadFields";
import { supabase } from "@/lib/supabaseClient";
import type { LeadFieldDefinition } from "@/types/lead";

interface LeadData {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
  created_at: string;
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
    avatar_url: string | null; // may be path or full URL
  } | null;
};

type ThreadMessage = LeadMessage & { indent: number };

export function LeadDetailClient() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team");
  const router = useRouter();

  const [fields, setFields] = useState<LeadFieldDefinition[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);

  // ---------- data loading ----------
  useEffect(() => {
    let cancelled = false;

    async function loadLead() {
      if (!teamId || !id) {
        setLoading(false);
        return;
      }

      try {
        const [defs, leadRes] = await Promise.all([
          getLeadFieldDefinitions(teamId),
          fetch(
            `/api/leads?teamId=${encodeURIComponent(
              teamId
            )}&id=${encodeURIComponent(id)}`
          ).then((r) => r.json() as Promise<LeadData>),
        ]);

        if (cancelled) return;

        setFields(defs);
        setLead(leadRes);
      } catch (err) {
        console.error("Failed to load lead detail", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function resolveAvatarUrl(raw: string | null): Promise<string | null> {
      if (!raw) return null;
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw;
      }

      try {
        const { data, error } = await supabase.storage
          .from("avatars")
          .createSignedUrl(raw, 60 * 60 * 24 * 7); // 7 days

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

    async function loadMessages() {
      if (!teamId || !id) {
        setMessagesLoading(false);
        return;
      }

      try {
        const data = await fetch(
          `/api/lead-messages?teamId=${encodeURIComponent(
            teamId
          )}&leadId=${encodeURIComponent(id)}`
        ).then((r) => r.json() as Promise<LeadMessage[]>);

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
        console.error("Failed to load messages", err);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }

    loadLead();
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [teamId, id]);

  // ---------- helpers (no hooks) ----------
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

  // ---------- derived values (hooks) ----------
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

  const threadedMessages: ThreadMessage[] = useMemo(() => {
    if (!messages.length) return [];
    const sorted = [...messages].sort(
      (a, b) =>
        new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    );

    let lastDirection: "inbound" | "outbound" | null = null;
    let lastIndent = 0;

    return sorted.map((m) => {
      let indent = lastIndent;
      if (lastDirection === null) {
        indent = 0;
      } else if (m.direction !== lastDirection) {
        indent = Math.min(lastIndent + 1, 4);
      }
      lastDirection = m.direction;
      lastIndent = indent;
      return { ...m, indent };
    });
  }, [messages]);

  // ---------- early returns ----------
  if (!teamId) {
    return (
      <p className="text-sm text-rose-500">
        Missing <code>?team=TEAM_ID</code> in URL.
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

  // ---------- render ----------
  return (
    <div className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)]">
      {/* LEFT: lead details */}
      <div className="space-y-6">
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
              onClick={() =>
                router.push(
                  `/leads/${id}/edit?team=${encodeURIComponent(teamId)}`
                )
              }
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/leads/${id}/delete?team=${encodeURIComponent(teamId)}`
                )
              }
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
            >
              Delete
            </button>
          </div>
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

      {/* RIGHT: conversation history */}
      <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Conversation History
            </h2>
            <p className="text-xs text-slate-500">
              Messages logged by your team for this lead.
            </p>
          </div>

          {/* + button to log messages */}
          <button
            type="button"
            onClick={() =>
              router.push(
                `/leads/${id}/messages?team=${encodeURIComponent(teamId)}`
              )
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-600 shadow-sm hover:border-emerald-400 hover:bg-emerald-100 cursor-pointer"
            title="Log new message"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messagesLoading ? (
            <p className="text-xs text-slate-500">Loading messages…</p>
          ) : threadedMessages.length === 0 ? (
            <p className="text-xs text-slate-500">
              No messages yet. Use the “+” button above to log your
              outbound / inbound touches.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              {threadedMessages.map((m) => {
                const ts = new Date(m.sent_at);
                const isOutbound = m.direction === "outbound";

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

                const indentClass = m.indent
                  ? `ml-${Math.min(m.indent * 4, 16)}`
                  : "";

                return (
                  <div
                    key={m.id}
                    className={`flex gap-2 ${indentClass}`}
                  >
                    <div className="flex flex-col items-center">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt={authorName}
                          className="h-8 w-8 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                            isOutbound
                              ? "bg-indigo-600"
                              : "bg-slate-500"
                          }`}
                        >
                          {initials}
                        </div>
                      )}
                      <div className="mt-1 h-full w-px flex-1 bg-slate-200" />
                    </div>

                    <div className="flex-1">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">
                              {authorName}
                            </span>
                            <span className="text-slate-400">
                              · {isOutbound ? "Setter" : "Lead"} ·{" "}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
