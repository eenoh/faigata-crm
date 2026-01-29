// src/context/WorkspaceContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

type WorkspaceContextValue = {
  userId: string | null;
  teamId: string | null;
  teamName: string | null;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function normalizeSupabaseError(err: unknown) {
  const e = err as any;
  return {
    message: e?.message,
    details: e?.details,
    hint: e?.hint,
    code: e?.code,
    status: e?.status,
    raw: err,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<WorkspaceContextValue>({
    userId: null,
    teamId: null,
    teamName: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (userError) console.error("[Workspace] auth.getUser failed", normalizeSupabaseError(userError));
          if (!cancelled) setValue({ userId: null, teamId: null, teamName: null, loading: false });
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        // 1) primary team from profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .maybeSingle(); // ✅ avoids noisy error when row not found / not visible

        if (profileError) {
          console.error("[Workspace] profiles select failed", normalizeSupabaseError(profileError));
        }

        let teamId: string | null = profile?.team_id ?? null;

        // 2) fallback: auth.user_metadata.primary_team_id
        if (!teamId) {
          const metaTeam = (user.user_metadata as any)?.primary_team_id;
          if (typeof metaTeam === "string" && metaTeam.length > 0) teamId = metaTeam;
        }

        // 3) team name (treat "not found/hidden" as normal)
        let teamName: string | null = null;
        if (teamId) {
          const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("name")
            .eq("id", teamId)
            .maybeSingle(); // ✅ avoids PGRST noise for 0 rows under RLS

          if (teamError) {
            console.error("[Workspace] teams select failed", normalizeSupabaseError(teamError));
          } else {
            teamName = team?.name ?? null;
          }
        }

        if (!cancelled) setValue({ userId, teamId, teamName, loading: false });
      } catch (err) {
        console.error("[Workspace] error", normalizeSupabaseError(err));
        if (!cancelled) setValue({ userId: null, teamId: null, teamName: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
