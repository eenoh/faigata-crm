"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function lighten(color: string, amount = 0.2): string {
  if (!/^#?[0-9a-f]{6}$/i.test(color)) return color;
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const adj = (c: number) => Math.min(255, Math.max(0, c + 255 * amount)) | 0;
  return `#${adj(r).toString(16).padStart(2, "0")}${adj(g)
    .toString(16)
    .padStart(2, "0")}${adj(b).toString(16).padStart(2, "0")}`;
}

/**
 * Only allow "go back" to URLs on the same origin (prevents open redirects).
 * If it’s not safe, we return null and the UI falls back to baseHref.
 */
function safeSameOriginHref(candidate: string | null): string | null {
  if (!candidate) return null;

  const raw = candidate.trim();
  if (!raw) return null;

  try {
    // Accept relative paths like "/dashboard"
    if (raw.startsWith("/")) return raw;

    // Absolute URL: only accept if same origin
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;

    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export default function PublicBookingErrorPage({
  title = "Booking link not found",
  message = "This booking link doesn’t exist, has expired, or is no longer available.",
  baseHref = "/",
  primaryColor,
}: {
  title?: string;
  message?: string;
  baseHref?: string;
  primaryColor?: string | null;
}) {
  const [backHref, setBackHref] = useState<string | null>(null);

  useEffect(() => {
    try {
      const ref =
        document.referrer ||
        localStorage.getItem("faigata:lastReferrer") ||
        localStorage.getItem("faigata:lastVisitedUrl");

      const safe = safeSameOriginHref(ref);
      setBackHref(safe);
    } catch {
      // if localStorage access fails, still try referrer (then sanitize)
      const safe = safeSameOriginHref(document.referrer || null);
      setBackHref(safe);
    }
  }, []);

  const primary = useMemo(() => {
    if (primaryColor && primaryColor.trim()) return primaryColor.trim();
    try {
      return localStorage.getItem("faigata:lastPrimaryColor") || "#4f46e5";
    } catch {
      return "#4f46e5";
    }
  }, [primaryColor]);

  const headerGradient = useMemo(
    () => `linear-gradient(135deg, ${lighten(primary, 0.25)}, ${primary})`,
    [primary],
  );

  const buttonClass =
    "inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white " +
    "cursor-pointer transition " +
    "hover:opacity-95 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div
          className="px-6 py-6 text-white"
          style={{ backgroundImage: headerGradient }}
        >
          <p className="text-xs uppercase tracking-wide text-white/70">
            Faigata Scheduling
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        </div>

        {/* Body */}
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
                Access may be restricted (e.g. database policies block public
                viewing).
              </li>
              <li>The URL may be incomplete or copied with a typo.</li>
            </ul>
          </div>

          {/* Only ONE button */}
          <div className="mt-6">
            {backHref ? (
              <a
                href={backHref}
                className={buttonClass}
                style={{ backgroundColor: primary }}
              >
                Go back
              </a>
            ) : (
              <Link
                href={baseHref}
                className={buttonClass}
                style={{ backgroundColor: primary }}
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

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} Faigata
        </div>
      </div>
    </div>
  );
}
