"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TrashIcon } from "@heroicons/react/24/outline";

export function DeleteTeamMemberClient() {
  const router = useRouter();
  const params = useParams();
  const { teamId, loading: workspaceLoading } = useWorkspace();

  const userId = params.userId as string;

  const [memberName, setMemberName] = useState("this user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load member name
  useEffect(() => {
    if (!userId) return;

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle();

      if (data) {
        const fullName = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();

        setMemberName(
          fullName || "this user"
        );
      }
    })();
  }, [userId]);


  async function confirmDelete() {
    setLoading(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/crm/team-members/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Failed to remove team member.");
        return;
      }

      router.replace("/settings/team/members");
    } finally {
      setLoading(false);
    }
  }

  if (workspaceLoading) {
    return <p className="text-sm text-slate-500">Loading workspace…</p>;
  }

  return (
    <div className="mx-auto max-w-lg pt-16">
      <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <TrashIcon className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">
            Remove team member
          </h1>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Are you sure you want to remove{" "}
          <span className="font-semibold text-slate-900">{memberName}</span>{" "}
          from this team?
        </p>

        <p className="mt-2 text-xs text-slate-500">
          This will revoke their access to this workspace. This action cannot be
          undone.
        </p>

        {error && (
          <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={confirmDelete}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
          >
            <TrashIcon className="h-4 w-4" />
            {loading ? "Removing…" : "Remove user"}
          </button>
        </div>
      </div>
    </div>
  );
}
