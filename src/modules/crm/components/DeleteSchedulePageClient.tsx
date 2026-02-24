"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";

type BookingLinkRow = {
  id: string;
  name: string;
  slug: string;
  deleted_at?: string | null;
};

export default function DeleteSchedulePageClient() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const id = String(params?.id ?? "");
  const { teamId } = useWorkspace();

  const [row, setRow] = useState<BookingLinkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function requireUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      router.replace("/login");
      return null;
    }
    return data.user;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      const user = await requireUser();
      if (!user) return;

      if (!teamId || !id) {
        if (!cancelled) {
          setErr("We couldn’t determine your team or schedule page id.");
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("booking_links")
          .select("id, name, slug, deleted_at")
          .eq("id", id)
          .eq("team_id", teamId)
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("not_found");

        if (!cancelled) setRow(data);
      } catch (e: any) {
        if (!cancelled)
          setErr(String(e?.message ?? "Failed to load schedule page"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, teamId]); // router is stable; no need in deps

  async function onDelete() {
    setDeleting(true);
    setErr(null);

    try {
      const user = await requireUser();
      if (!user) return;

      if (!teamId || !id) throw new Error("missing_team_or_id");

      const { error } = await supabase
        .from("booking_links")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("team_id", teamId)
        .eq("owner_user_id", user.id)
        .is("deleted_at", null); // idempotent

      if (error) throw error;

      router.push("/settings/booking-links?deleted=1");
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? "Failed to delete schedule page"));
    } finally {
      setDeleting(false);
    }
  }

  const alreadyDeleted = Boolean(row?.deleted_at);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Delete schedule page
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          This will hide the schedule page. Existing bookings will remain.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="text-sm text-rose-700">
            {err === "not_found"
              ? "We couldn’t find that schedule page (or you don’t have access)."
              : err}
          </div>
        ) : (
          <>
            <div className="text-sm text-slate-700">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-900">
                {row?.name ?? "this schedule page"}
              </span>
              ?
            </div>

            {alreadyDeleted ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                This schedule page was already deleted.
              </div>
            ) : (
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                This will <span className="font-semibold">disable</span> the
                schedule page. You can’t undo it from the UI.
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push("/settings/booking-links")}
                disabled={deleting}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={onDelete}
                disabled={deleting || alreadyDeleted}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {deleting ? "Deleting…" : "Delete Schedule Page"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
