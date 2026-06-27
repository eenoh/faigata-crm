"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { lightenHexColor as lighten } from "@/features/crm/utils/booking";

/**
 * Only allow "go back" to URLs on the same origin (prevents open redirects).
 * If it's not safe, we return null and the UI falls back to baseHref.
 */
function safeSameOriginHref(candidate: string | null): string | null {
  if (!candidate) return null;

  const raw = candidate.trim();
  if (!raw) return null;

  try {
    if (raw.startsWith("/")) return raw;

    if (typeof window === "undefined") return null;

    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;

    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export default function PublicBookingErrorPage({
  title = "Booking link not found",
  message = "This booking link doesn't exist, has expired, or is no longer available.",
  baseHref = "/",
  primaryColor,
}: {
  title?: string;
  message?: string;
  baseHref?: string;
  primaryColor?: string | null;
}) {
  const [backHref, setBackHref] = useState<string | null>(null);
  const [resolvedPrimary, setResolvedPrimary] = useState("#4f46e5");

  useEffect(() => {
    try {
      const ref =
        document.referrer ||
        localStorage.getItem("faigata:lastReferrer") ||
        localStorage.getItem("faigata:lastVisitedUrl");

      const safe = safeSameOriginHref(ref);
      setBackHref(safe);
    } catch {
      const safe =
        typeof document !== "undefined"
          ? safeSameOriginHref(document.referrer || null)
          : null;
      setBackHref(safe);
    }
  }, []);

  useEffect(() => {
    if (primaryColor && primaryColor.trim()) {
      setResolvedPrimary(primaryColor.trim());
      return;
    }

    try {
      const stored = localStorage.getItem("faigata:lastPrimaryColor");
      setResolvedPrimary(stored || "#4f46e5");
    } catch {
      setResolvedPrimary("#4f46e5");
    }
  }, [primaryColor]);

  const headerGradient = useMemo(
    () =>
      `linear-gradient(135deg, ${lighten(resolvedPrimary, 0.25)}, ${resolvedPrimary})`,
    [resolvedPrimary],
  );

  const buttonClass =
    "inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white " +
    "cursor-pointer transition " +
    "hover:opacity-95 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div
          className="px-6 py-6 text-white"
          style={{ backgroundImage: headerGradient }}
        >
          <p className="text-xs uppercase tracking-wide text-white/70">
            Faigata Scheduling
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        </div>

        <div className="px-6 py-6 text-center">
          <p className="text-sm text-slate-600">{message}</p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-slate-700">
              Why this can happen
            </p>
            <ul className="mt-2 list-disc pl-5 text-[12px] leading-relaxed text-slate-600">
              <li>The link may have been deleted or the slug was changed.</li>
              <li>
                You might be on a different environment (local vs production).
              </li>
              <li>
                Access may be restricted (for example, database policies block
                public viewing).
              </li>
              <li>The URL may be incomplete or copied with a typo.</li>
            </ul>
          </div>

          <div className="mt-6">
            {backHref ? (
              <a
                href={backHref}
                className={buttonClass}
                style={{ backgroundColor: resolvedPrimary }}
              >
                Go back
              </a>
            ) : (
              <Link
                href={baseHref}
                className={buttonClass}
                style={{ backgroundColor: resolvedPrimary }}
              >
                Go back
              </Link>
            )}
          </div>

          <p className="mt-4 text-[11px] text-slate-400">
            If you think this is a mistake, ask the sender to share the link
            again.
          </p>
        </div>

        <div className="border-t border-slate-200 px-6 py-3 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} Faigata
        </div>
      </div>
    </div>
  );
}
