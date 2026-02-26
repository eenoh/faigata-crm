"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function DeleteTeamMemberClient() {
  const router = useRouter();
  const { loading: workspaceLoading } = useWorkspace();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  const params = useParams<{ userId?: string }>();
  const userId = String(params?.userId ?? "");

  const [memberName, setMemberName] = useState("this user");
  const [loadingName, setLoadingName] = useState(true);

  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // theme-driven classes
  const pageText = isDark ? "text-slate-200" : "text-slate-700";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";

  const card = cn(
    "rounded-2xl border p-6 shadow-sm",
    isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white",
  );

  const dangerCard = cn(
    "rounded-2xl border p-6 shadow-sm",
    isDark ? "border-rose-900/40 bg-slate-950" : "border-rose-200 bg-white",
  );

  const dangerIconWrap = cn(
    "flex h-10 w-10 items-center justify-center rounded-full",
    isDark ? "bg-rose-950/40 text-rose-300" : "bg-rose-100 text-rose-600",
  );

  const btn = cn(
    "rounded-lg border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-60 cursor-pointer",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  );

  const dangerBtn = cn(
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 cursor-pointer",
    isDark ? "bg-rose-600 hover:bg-rose-500" : "bg-rose-600 hover:bg-rose-700",
  );

  // Load member name (best-effort)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingName(true);
      if (!userId) {
        setLoadingName(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", userId)
          .maybeSingle();

        if (cancelled) return;
        if (error || !data) return;

        const fullName =
          `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
        setMemberName(fullName || "this user");
      } catch {
        // ignore name errors (UI still works)
      } finally {
        if (!cancelled) setLoadingName(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function confirmDelete() {
    if (!userId) {
      setError("missing_user_id");
      return;
    }

    setRemoving(true);
    setError(null);

    try {
      const { data: sessionRes, error: sessionErr } =
        await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;

      if (sessionErr || !token) {
        router.replace("/login");
        return;
      }

      const controller = new AbortController();

      const res = await fetch("/api/crm/team-members/delete", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });

      const json = (await res.json().catch(() => ({}))) as any;

      if (!res.ok || !json?.ok) {
        setError(String(json?.error ?? `failed_${res.status}`));
        return;
      }

      router.replace("/settings/team/members");
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message ?? "Failed to remove team member."));
    } finally {
      setRemoving(false);
    }
  }

  if (workspaceLoading) {
    return (
      <div className="mx-auto max-w-lg pt-16">
        <div className={card}>
          <p className={cn("text-sm", mutedText)}>Loading workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pt-16">
      <div className={dangerCard}>
        <div className="flex items-center gap-3">
          <div className={dangerIconWrap}>
            <TrashIcon className="h-5 w-5" />
          </div>
          <h1
            className={cn(
              "text-lg font-semibold",
              isDark ? "text-slate-100" : "text-slate-900",
            )}
          >
            Remove team member
          </h1>
        </div>

        <p className={cn("mt-4 text-sm", pageText)}>
          Are you sure you want to remove{" "}
          <span
            className={cn(
              "font-semibold",
              isDark ? "text-slate-50" : "text-slate-900",
            )}
          >
            {loadingName ? "…" : memberName}
          </span>{" "}
          from this team?
        </p>

        <p className={cn("mt-2 text-xs", mutedText)}>
          This will revoke their access to this workspace. This action cannot be
          undone.
        </p>

        {error && (
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              isDark ? "text-rose-300" : "text-rose-600",
            )}
          >
            {error === "missing_user_id"
              ? "Missing user id."
              : error === "unauthorized"
                ? "You’re not signed in (or your session expired). Please log in again."
                : error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={removing}
            className={btn}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={confirmDelete}
            disabled={removing}
            className={dangerBtn}
          >
            <TrashIcon className="h-4 w-4" />
            {removing ? "Removing…" : "Remove user"}
          </button>
        </div>
      </div>
    </div>
  );
}
