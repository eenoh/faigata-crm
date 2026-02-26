"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AcceptInviteClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const inviteId = searchParams.get("invite");
  const teamQuery = searchParams.get("team");
  const companyQuery = searchParams.get("company");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMode, setSuccessMode] = useState(false);
  const [progress, setProgress] = useState(0);

  const [inviteEmail, setInviteEmail] = useState("");
  const [orgName, setOrgName] = useState<string | null>(null);

  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(
    teamQuery,
  );
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(
    companyQuery,
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);

  const loginHref = useMemo(() => {
    const q = new URLSearchParams();
    if (inviteId) q.set("invite", inviteId);
    const team = resolvedTeamId ?? teamQuery;
    const company = resolvedCompanyId ?? companyQuery;
    if (team) q.set("team", team);
    if (company) q.set("company", company);

    const qs = q.toString();
    return `/login${qs ? `?${qs}` : ""}`;
  }, [inviteId, resolvedTeamId, resolvedCompanyId, teamQuery, companyQuery]);

  // --- shared theme-aware UI tokens ---
  const pageBg = cn(
    "min-h-screen flex items-center justify-center px-4",
    // light
    "bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50",
    // dark
    "dark:from-slate-950 dark:via-slate-950 dark:to-slate-900",
  );

  const card = cn(
    "w-full max-w-md rounded-3xl border p-10 shadow-2xl backdrop-blur-xl",
    "bg-white/90 border-slate-200",
    "dark:bg-slate-950/70 dark:border-slate-800",
  );

  const smallCard = cn(
    "max-w-md rounded-2xl border p-6 shadow-sm text-sm",
    "bg-white border-slate-200 text-slate-600",
    "dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300",
  );

  const title = cn(
    "font-semibold tracking-tight",
    "text-slate-900",
    "dark:text-slate-100",
  );

  const sub = cn("text-sm", "text-slate-500", "dark:text-slate-400");

  const inputBase = cn(
    "peer w-full rounded-xl border px-3.5 pr-10 pt-5 pb-2 text-sm placeholder-transparent",
    "focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500",
    "border-slate-300 bg-white text-slate-800",
    "dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-400 dark:focus:border-indigo-400",
  );

  const labelBase = cn(
    "absolute left-3.5 top-2 text-xs transition-all duration-150 pointer-events-none",
    "text-slate-600",
    "peer-focus:-translate-y-1 peer-focus:text-[10px] peer-focus:text-indigo-600 peer-not-placeholder-shown:-translate-y-1 peer-not-placeholder-shown:text-[10px]",
    "dark:text-slate-400 dark:peer-focus:text-indigo-400",
  );

  useEffect(() => {
    let cancelled = false;

    if (!inviteId) {
      setError("Missing invitation information in the link.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/crm/invite/accept?inviteId=${encodeURIComponent(inviteId)}`,
        );
        const json = (await res.json().catch(() => null)) as any;

        if (cancelled) return;

        if (!res.ok || !json) {
          setError(
            json?.error ||
              "This invitation could not be found or is no longer valid.",
          );
          return;
        }

        setInviteEmail(json.email ?? "");
        setEmail(json.email ?? "");
        setOrgName(json.organizationName ?? null);
        setResolvedTeamId(json.teamId ?? null);
        setResolvedCompanyId(json.companyId ?? null);
      } catch {
        if (!cancelled) setError("Could not load invitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!inviteId)
      return setError("Missing invitation information in the link.");
    if (!firstName || !lastName || !email || !password)
      return setError("Please fill in all fields.");
    if (inviteEmail && inviteEmail.toLowerCase() !== email.toLowerCase())
      return setError("Email must match the one the invitation was sent to.");

    setSubmitting(true);

    try {
      const res = await fetch("/api/crm/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteId,
          firstName,
          lastName,
          email,
          password,
        }),
      });

      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok || !json?.ok) {
        setError(
          json?.error || "Failed to accept invitation. Please try again.",
        );
        return;
      }

      const redirectTeamId: string | null =
        json.teamId ?? resolvedTeamId ?? teamQuery;

      // Optional: sign the user in so they have a session right away
      await supabase.auth
        .signInWithPassword({ email, password })
        .catch(() => null);

      setSuccessMode(true);

      let pct = 0;
      const interval = setInterval(() => {
        pct = Math.min(100, pct + 5);
        setProgress(pct);

        if (pct >= 100) {
          clearInterval(interval);
          router.replace(
            redirectTeamId
              ? `/dashboard?team=${encodeURIComponent(redirectTeamId)}`
              : "/dashboard",
          );
        }
      }, 150);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!inviteId) {
    return (
      <main
        className={cn(
          "min-h-screen flex items-center justify-center px-4",
          "bg-slate-50 dark:bg-slate-950",
        )}
      >
        <div className={cn(smallCard, "text-rose-600 dark:text-rose-300")}>
          The invitation link is missing information. Please ask your team to
          resend the invite.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main
        className={cn(
          "min-h-screen flex items-center justify-center px-4",
          "bg-slate-50 dark:bg-slate-950",
        )}
      >
        <div className={smallCard}>Loading your invitation…</div>
      </main>
    );
  }

  if (successMode) {
    return (
      <main className={pageBg}>
        <div className={cn(card, "p-8 text-center")}>
          <h1 className={cn("text-2xl", title)}>
            Welcome to {orgName ?? "your new team"} 🎉
          </h1>
          <p className={cn("mt-2", sub)}>
            Your account has been created and your roles have been assigned.
            Redirecting you to your dashboard…
          </p>

          <div
            className={cn(
              "mt-6 h-2 w-full rounded-full overflow-hidden",
              "bg-slate-100 dark:bg-slate-900",
            )}
          >
            <div
              className="h-full bg-indigo-600 transition-[width] dark:bg-indigo-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className={card}>
        <div className="mb-6 text-center">
          <div
            className={cn(
              "inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-md",
              "bg-white",
              "dark:bg-slate-950 dark:border dark:border-slate-800",
            )}
          >
            <img
              src="/icons/icon-faigata.svg"
              alt="Faigata"
              className="w-10 h-10"
            />
          </div>

          <h1 className={cn("text-2xl mt-4", title)}>Accept your invitation</h1>
          <p className={cn("mt-1", sub)}>
            {orgName
              ? `You’ve been invited to join ${orgName}.`
              : "You’ve been invited to join a Faigata team."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="First name"
              type="text"
              required
              value={firstName}
              onChange={setFirstName}
              inputClassName={inputBase}
              labelClassName={labelBase}
            />
            <FloatingInput
              label="Last name"
              type="text"
              required
              value={lastName}
              onChange={setLastName}
              inputClassName={inputBase}
              labelClassName={labelBase}
            />
          </div>

          <FloatingInput
            label="Work email"
            type="email"
            required
            value={email}
            onChange={setEmail}
            inputClassName={inputBase}
            labelClassName={labelBase}
          />

          <FloatingInput
            label="Password"
            type="password"
            required
            value={password}
            onChange={setPassword}
            inputClassName={inputBase}
            labelClassName={labelBase}
          />

          {error && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "w-full flex items-center justify-center rounded-xl text-sm font-semibold py-3 mt-2 transition shadow-sm cursor-pointer",
              "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60",
              "dark:bg-indigo-500 dark:hover:bg-indigo-600",
            )}
          >
            {submitting ? "Creating your account…" : "Accept Invite"}
          </button>
        </form>

        <p
          className={cn(
            "mt-6 text-xs text-center",
            "text-slate-500 dark:text-slate-400",
          )}
        >
          Already have a Faigata account?{" "}
          <a
            href={loginHref}
            className="text-indigo-600 font-medium hover:underline dark:text-indigo-400"
          >
            Log in to accept this invite
          </a>
        </p>
      </div>
    </main>
  );
}

function FloatingInput({
  label,
  type,
  required,
  value,
  onChange,
  inputClassName,
  labelClassName,
}: {
  label: string;
  type: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  inputClassName: string;
  labelClassName: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative">
      <input
        type={isPassword && showPassword ? "text" : type}
        required={required}
        className={inputClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label className={labelClassName}>{label}</label>

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-3 flex items-center cursor-pointer"
        >
          <img
            src={showPassword ? "/icons/eye-off.svg" : "/icons/eye.svg"}
            alt={showPassword ? "Hide password" : "Show password"}
            className={cn("w-5 h-5", "opacity-80 dark:opacity-90")}
          />
        </button>
      )}
    </div>
  );
}
