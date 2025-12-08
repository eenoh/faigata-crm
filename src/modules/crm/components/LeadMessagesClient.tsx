"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type LeadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  channel: string | null;
  body: string;
  sent_at: string;
};

type LeadSummary = {
  id: string;
  stage: string;
  custom_values: Record<string, any>;
  created_at: string;
  prospector_id: string | null;
};

type UserProfile = {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null; // stored path OR full URL
};

export function LeadMessagesClient() {
  const { id } = useParams<{ id: string }>();

  // workspace / team
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const [lead, setLead] = useState<LeadSummary | null>(null);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // current user (for outbound messages)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  // creator / prospector (for "Lead created" entry)
  const [creatorProfile, setCreatorProfile] = useState<UserProfile | null>(null);
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);

  const [direction, setDirection] = useState<"inbound" | "outbound">(
    "outbound"
  );
  const [channel, setChannel] = useState("dm");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---------- helpers ---------- */

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

  /* ---------- 1) Load teamId from Supabase (not URL) ---------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          console.warn("[LeadMessages] No authenticated user", userError);
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
          console.error("[LeadMessages] Failed to load profile", profileError);
        }

        let tId: string | null = profile?.team_id ?? null;

        // fallback to metadata.primary_team_id
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
        console.error("[LeadMessages] Failed to load workspace context", err);
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

  /* ---------- 2) Load lead, messages, current user, creator ---------- */

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
          console.error("[Messages] avatar sign error", error);
          return null;
        }
        return data?.signedUrl ?? null;
      } catch (err) {
        console.error("[Messages] avatar sign unexpected error", err);
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
        const res = await fetch(
          `/api/crm/leads?teamId=${encodeURIComponent(
            teamId
          )}&id=${encodeURIComponent(id)}`
        );
        if (!res.ok) {
          console.error(
            "[Messages] Failed to load lead",
            res.status,
            await res.text().catch(() => "")
          );
          if (!cancelled) setLoading(false);
          return;
        }
        const leadRes = (await res.json()) as LeadSummary;

        if (cancelled) return;

        setLead(leadRes);

        // load creator / prospector profile for "Lead created" entry
        if (leadRes.prospector_id) {
          try {
            const { data, error } = await supabase
              .from("profiles")
              .select("first_name, last_name, avatar_url")
              .eq("id", leadRes.prospector_id)
              .single();

            if (error) {
              console.error(
                "[Messages] Failed to load creator profile",
                error
              );
            } else if (!cancelled && data) {
              const prof: UserProfile = {
                first_name: data.first_name ?? null,
                last_name: data.last_name ?? null,
                avatar_url: data.avatar_url ?? null,
              };
              setCreatorProfile(prof);

              const signed = await resolveAvatarUrl(prof.avatar_url);
              if (!cancelled) {
                setCreatorAvatarUrl(signed);
              }
            }
          } catch (err) {
            console.error("[Messages] load creator profile error", err);
          }
        }
      } catch (err) {
        console.error("[Messages] Failed to load lead", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadMessages() {
      if (!workspaceLoaded) return;
      if (!teamId || !id) {
        if (!cancelled) setLoadingMessages(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/crm/lead-messages?teamId=${encodeURIComponent(
            teamId
          )}&leadId=${encodeURIComponent(id)}`
        );
        if (!res.ok) {
          console.error(
            "[Messages] Failed to load messages",
            res.status,
            await res.text().catch(() => "")
          );
          if (!cancelled) setLoadingMessages(false);
          return;
        }
        const data = (await res.json()) as LeadMessage[];
        if (!cancelled) setMessages(data ?? []);
      } catch (err) {
        console.error("[Messages] Failed to load messages", err);
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    async function loadCurrentUser() {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId || cancelled) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url")
          .eq("id", userId)
          .single();

        if (error) {
          console.error("[Messages] Failed to load user profile", error);
          return;
        }

        if (cancelled) return;

        const profile: UserProfile = {
          first_name: data?.first_name ?? null,
          last_name: data?.last_name ?? null,
          avatar_url: data?.avatar_url ?? null,
        };

        setCurrentUser(profile);

        const signed = await resolveAvatarUrl(profile.avatar_url);
        if (!cancelled) {
          setUserAvatarUrl(signed);
        }
      } catch (err) {
        console.error("[Messages] Failed to load current user", err);
      }
    }

    loadLead();
    loadMessages();
    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [workspaceLoaded, teamId, id]);

  /* ---------- submit ---------- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId || !id || !body.trim()) return;

    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const senderId = userRes.user?.id ?? null;

      const res = await fetch(
        `/api/crm/lead-messages?teamId=${encodeURIComponent(
          teamId
        )}&leadId=${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction,
            channel,
            body: body.trim(),
            sender_profile_id: senderId,
          }),
        }
      );

      if (!res.ok) {
        console.error(
          "[Messages] Failed to create message",
          await res.text().catch(() => "")
        );
        return;
      }

      const created = (await res.json()) as LeadMessage;
      setMessages((prev) => [...prev, created]);
      setBody("");

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("lead-message-logged", {
            detail: { teamId, leadId: id },
          })
        );
      }
    } catch (err) {
      console.error("[Messages] Failed to create message", err);
    } finally {
      setSaving(false);
    }
  }

  /* ---------- early return if no team ---------- */

  if (workspaceLoaded && !teamId) {
    return (
      <p className="text-sm text-slate-500">
        You don&apos;t seem to be in any team yet. Open this page from a
        workspace, or complete onboarding first.
      </p>
    );
  }

  /* ---------- derived values ---------- */

  const leadLabel: string = useMemo(() => {
    if (!lead) return `Lead in pipeline`;

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

  const hasHistory = messages.length > 0;

  const placeholder =
    direction === "outbound"
      ? "What did you send to this lead?"
      : hasHistory
      ? "How did the lead respond?"
      : "What message did the lead send you?";

  const userFullName =
    (currentUser?.first_name || currentUser?.last_name) &&
    `${currentUser?.first_name ?? ""} ${currentUser?.last_name ?? ""}`.trim();

  const userInitials = initialsFromName(
    currentUser?.first_name,
    currentUser?.last_name
  );

  const leadInitials = initialsFromSingleString(leadLabel);

  const creatorFullName =
    (creatorProfile?.first_name || creatorProfile?.last_name) &&
    `${creatorProfile?.first_name ?? ""} ${
      creatorProfile?.last_name ?? ""
    }`.trim();

  const creatorInitials = initialsFromName(
    creatorProfile?.first_name,
    creatorProfile?.last_name
  );

  const sortedMessages: LeadMessage[] = useMemo(() => {
    if (!messages.length) return [];
    return [...messages].sort(
      (a, b) =>
        new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
  }, [messages]);

  const created = lead ? new Date(lead.created_at) : null;

  /* ---------- render ---------- */

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl space-y-6 pb-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            Log messages for this lead
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track outbound and inbound conversations so you always know the last
            touch.
          </p>
          {lead && (
            <p className="mt-2 text-xs text-slate-500">
              Lead: <span className="font-medium">{leadLabel}</span> · Stage:{" "}
              <span className="font-medium">
                {lead.stage || "Unassigned"}
              </span>
            </p>
          )}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex gap-2">
            <select
              className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              value={direction}
              onChange={(e) =>
                setDirection(e.target.value as "inbound" | "outbound")
              }
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>

            <select
              className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="dm">DM</option>
              <option value="email">EMAIL</option>
              <option value="call">CALL</option>
              <option value="sms">SMS</option>
              <option value="other">OTHER</option>
            </select>
          </div>

          <textarea
            className="h-28 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={placeholder}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Log message"}
            </button>
          </div>
        </form>

        {/* Activity / Conversation history */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Activity Timeline
          </h2>

          {loadingMessages ? (
            <p className="text-xs text-slate-500">Loading activity…</p>
          ) : sortedMessages.length === 0 ? (
            <>
              <p className="text-xs text-slate-500">
                No messages logged yet. Your conversation with this lead will
                show up here.
              </p>
              {created && (
                <div className="mt-4 text-xs">
                  <div className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {creatorAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={creatorAvatarUrl}
                            alt={creatorFullName || "Prospector"}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : creatorProfile ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
                            {creatorInitials}
                          </div>
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">
                              {creatorFullName || "Prospector"}
                            </span>
                            <span className="text-slate-400">· Prospector</span>
                          </span>
                          <span>
                            {created.toLocaleDateString()}{" "}
                            {created.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700">
                          Lead created
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3 text-xs">
              {sortedMessages.map((m) => {
                const ts = new Date(m.sent_at);
                const isOutbound = m.direction === "outbound";
                const isPipeline =
                  (m.channel ?? "").toLowerCase() === "pipeline";

                const authorName = isOutbound
                  ? userFullName || "You"
                  : leadLabel;

                const avatarUrl = isOutbound ? userAvatarUrl : null;
                const initials = isOutbound ? userInitials : leadInitials;

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
                              ·{" "}
                              {isPipeline
                                ? "Setter"
                                : isOutbound
                                ? "Setter"
                                : "Lead"}{" "}
                              · {formatChannel(m.channel)}
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

              {created && (
                <div className="pt-1">
                  <div className="flex gap-2">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center">
                        {creatorAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={creatorAvatarUrl}
                            alt={creatorFullName || "Prospector"}
                            className="h-8 w-8 rounded-full object-cover border border-slate-200"
                          />
                        ) : creatorProfile ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
                            {creatorInitials}
                          </div>
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold text-slate-700">
                              {creatorFullName || "Prospector"}
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
                        <p className="text-[11px] text-slate-700">
                          Lead created
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
