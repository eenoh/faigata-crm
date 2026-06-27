// src/context/WorkspaceContext.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";

type WorkspaceContextValue = {
  userId: string | null;
  teamId: string | null;
  teamName: string | null;
  loading: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

function normErr(err: unknown) {
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

function logErr(label: string, err: unknown) {
  // keep your detailed error shape, but reduce repetition
  console.error(label, normErr(err));
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceContextValue>({
    userId: null,
    teamId: null,
    teamName: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (userError) logErr("[Workspace] auth.getUser failed", userError);
          if (!cancelled) {
            setState({
              userId: null,
              teamId: null,
              teamName: null,
              loading: false,
            });
          }
          return;
        }

        const user = userRes.user;
        const userId = user.id;

        // 1) primary team from profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .maybeSingle();

        if (profileError)
          logErr("[Workspace] profiles select failed", profileError);

        // 2) fallback: auth.user_metadata.primary_team_id
        const metaTeam = (user.user_metadata as any)?.primary_team_id;
        const teamId =
          (profile?.team_id as string | null) ??
          (typeof metaTeam === "string" && metaTeam.length ? metaTeam : null);

        // 3) team name (treat "not found/hidden" as normal)
        let teamName: string | null = null;
        if (teamId) {
          const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("name")
            .eq("id", teamId)
            .maybeSingle();

          if (teamError) logErr("[Workspace] teams select failed", teamError);
          else teamName = typeof team?.name === "string" ? team.name : null;
        }

        if (!cancelled) setState({ userId, teamId, teamName, loading: false });
      } catch (err) {
        logErr("[Workspace] error", err);
        if (!cancelled) {
          setState({
            userId: null,
            teamId: null,
            teamName: null,
            loading: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
