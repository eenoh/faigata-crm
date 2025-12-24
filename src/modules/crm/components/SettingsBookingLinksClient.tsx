"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { bookingLinkUrl } from "@/lib/publicUrl";
import { useWorkspace } from "@/context/WorkspaceContext";
import { TrashIcon } from "@heroicons/react/24/outline";

function formatCreated(value: string) {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

type BookingLinkRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  primary_color: string;
  booking_type: "one_on_one" | "group" | "round_robin";
  created_at: string;
  deleted_at?: string | null;
};

function typeClasses(t: BookingLinkRow["booking_type"]) {
  switch (t) {
    case "one_on_one":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "group":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "round_robin":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function formatType(t: BookingLinkRow["booking_type"]): string {
  switch (t) {
    case "one_on_one":
      return "1:1";
    case "group":
      return "Group";
    case "round_robin":
      return "Round robin";
    default:
      return t;
  }
}

type TypeOptionProps = {
  label: string;
  description: string;
  iconSrc: string;
  onClick: () => void;
};

function TypeOption({ label, description, iconSrc, onClick }: TypeOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer"
    >
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-indigo-100 bg-slate-50 overflow-hidden">
        <img src={iconSrc} alt={label} className="h-14 w-14 object-contain" />
      </div>

      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <p className="mt-2 text-xs leading-snug text-slate-500">{description}</p>
    </button>
  );
}

export default function SettingsBookingLinksClient() {
  const router = useRouter();
  const { teamId } = useWorkspace();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<BookingLinkRow[]>([]);
  const [showTypeDialog, setShowTypeDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } = await supabase.auth.getUser();
        if (userError || !userRes.user) {
          router.replace("/login");
          return;
        }
        if (!cancelled) setUserId(userRes.user.id);
      } catch (err) {
        console.error("[Schedule] Failed to load user", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!teamId || !userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("booking_links")
          .select("id, name, slug, description, primary_color, booking_type, created_at, deleted_at")
          .eq("team_id", teamId)
          .eq("owner_user_id", userId)
          // ✅ soft-delete filter
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[Schedule] Failed to load booking_links", error);
          return;
        }

        if (!cancelled) {
          const rows: BookingLinkRow[] = (data ?? []).map((row: any) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            primary_color: row.primary_color,
            booking_type: row.booking_type ?? "one_on_one",
            created_at: row.created_at,
            deleted_at: row.deleted_at ?? null,
          }));
          setLinks(rows);
        }
      } catch (err) {
        console.error("[Schedule] Unexpected error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, userId]);

  if (!teamId || !userId) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Schedule Pages</h1>
          <p className="mt-1 text-sm text-slate-600">
            You need a team and profile to manage schedule pages. Please contact support if this seems wrong.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden max-w-4xl">
      {/* Type dialog */}
      {showTypeDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-indigo-600 px-6 py-4 text-white">
              <div>
                <h2 className="text-lg font-semibold">Choose a scheduling page type</h2>
                <p className="mt-1 text-xs text-indigo-100">
                  Decide how this booking link should behave. You can use 1:1, group, or round robin booking flows.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTypeDialog(false)}
                className="rounded-full p-1 text-indigo-100 hover:bg-indigo-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
              >
                <span className="sr-only">Close</span>✕
              </button>
            </div>

            <div className="space-y-5 bg-slate-50 px-6 pb-5 pt-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <TypeOption
                  label="One-on-One"
                  description="Contacts can schedule a meeting directly with you or a single teammate."
                  iconSrc="/icons/one-on-one.svg"
                  onClick={() => {
                    setShowTypeDialog(false);
                    router.push("/settings/booking-links/new?type=one_on_one");
                  }}
                />

                <TypeOption
                  label="Group"
                  description="Use when multiple people on your team need to be on the same call."
                  iconSrc="/icons/group.svg"
                  onClick={() => {
                    setShowTypeDialog(false);
                    router.push("/settings/booking-links/new?type=group");
                  }}
                />

                <TypeOption
                  label="Round robin"
                  description="Distribute meetings across a pool of teammates, perfect for high-volume inbound."
                  iconSrc="/icons/round_robin.svg"
                  onClick={() => {
                    setShowTypeDialog(false);
                    router.push("/settings/booking-links/new?type=round_robin");
                  }}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTypeDialog(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#F1F5F9] pb-2 pt-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Schedule Pages</h1>
          <p className="text-sm text-slate-500">
            Create booking links that leads can use to schedule time on your connected Google Calendar.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTypeDialog(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold !text-white shadow-sm hover:bg-indigo-700 cursor-pointer"
        >
          Create Schedule Page
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading schedule pages…</p>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          <p className="font-semibold text-slate-700">No schedule pages yet.</p>
          <p className="mt-1">
            Click <span className="font-semibold">Create Schedule Page</span> to set up your first booking link.
          </p>
        </div>
      ) : (
        <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[800px] overflow-y-auto overflow-x-auto rounded-xl">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="text-left">
                  <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                    Schedule page
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                    Public link
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700">
                    Color
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2 font-semibold text-slate-700 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {links.map((link) => {
                  const publicUrl = bookingLinkUrl(link.slug);
                  const created = formatCreated(link.created_at);

                  return (
                    <tr key={link.id} className="group border-b border-slate-100 hover:bg-slate-50/70">
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div
                            className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm"
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${link.primary_color}22, ${link.primary_color}AA)`,
                            }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate font-semibold text-slate-900">{link.name}</div>
                              <span
                                className={[
                                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                                  typeClasses(link.booking_type),
                                ].join(" ")}
                              >
                                {formatType(link.booking_type)}
                              </span>
                            </div>

                            {link.description ? (
                              <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{link.description}</div>
                            ) : (
                              <div className="mt-0.5 text-xs text-slate-400">No description</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Public link (no Open button) */}
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                            title={publicUrl}
                          >
                            {publicUrl}
                          </a>
                          <div className="mt-0.5 text-[11px] text-slate-500">Public booking page</div>
                        </div>
                      </td>

                      {/* Color */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded-full border border-slate-200 shadow-sm"
                            style={{ backgroundColor: link.primary_color }}
                          />
                          <span className="font-mono text-[11px] text-slate-600">{link.primary_color}</span>
                        </div>
                      </td>

                      {/* Actions (Delete) */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Link
                            href={`/settings/booking-links/${link.id}/delete`}
                            className="p-1 !text-rose-500 hover:!text-rose-600 cursor-pointer transition-colors"
                            title="Delete schedule page"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
