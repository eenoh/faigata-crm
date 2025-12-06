// src/app/invite/accept/AcceptInviteClient.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
    teamQuery
  );
  const [resolvedCompanyId, setResolvedCompanyId] = useState<string | null>(
    companyQuery
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);

  // Build login link that preserves invite + resolved team + company
  const loginHref = useMemo(() => {
    const q = new URLSearchParams();
    if (inviteId) q.set("invite", inviteId);
    if (resolvedTeamId ?? teamQuery)
      q.set("team", (resolvedTeamId ?? teamQuery) as string);
    if (resolvedCompanyId ?? companyQuery)
      q.set("company", (resolvedCompanyId ?? companyQuery) as string);

    const qs = q.toString();
    return `/login${qs ? `?${qs}` : ""}`;
  }, [inviteId, resolvedTeamId, resolvedCompanyId, teamQuery, companyQuery]);

  // Load invite metadata via API
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
          `/api/invite/accept?inviteId=${encodeURIComponent(inviteId)}`
        );

        let json: any = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        if (cancelled) return;

        if (!res.ok || !json) {
          console.error("[accept-invite] load invite error", json ?? {});
          setError(
            (json && json.error) ||
              "This invitation could not be found or is no longer valid."
          );
        } else {
          setInviteEmail(json.email);
          setEmail(json.email);
          setOrgName(json.organizationName ?? null);
          setResolvedTeamId(json.teamId ?? null);
          setResolvedCompanyId(json.companyId ?? null);
          // json.roles is available if you later want to show them
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[accept-invite] load error", err);
          setError("Could not load invitation.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!inviteId) {
      setError("Missing invitation information in the link.");
      return;
    }

    if (!firstName || !lastName || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (inviteEmail && inviteEmail.toLowerCase() !== email.toLowerCase()) {
      setError("Email must match the one the invitation was sent to.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/invite/accept", {
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

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        console.error("[accept-invite] server error", json ?? {});
        setError(
          (json && json.error) ||
            "Failed to accept invitation. Please try again."
        );
        return;
      }

      const redirectTeamId: string | null =
        json.teamId ?? resolvedTeamId ?? teamQuery;

      // Optional: sign the user in so they have a session right away
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.warn(
          "[accept-invite] sign-in after creation failed; user may need to log in manually",
          signInError
        );
      }

      setSuccessMode(true);

      // progress bar animation + redirect
      let pct = 0;
      const interval = setInterval(() => {
        pct += 5;
        if (pct >= 100) {
          pct = 100;
          clearInterval(interval);
          if (redirectTeamId) {
            router.replace(`/dashboard?team=${encodeURIComponent(redirectTeamId)}`);
          } else {
            router.replace("/dashboard");
          }
        }
        setProgress(pct);
      }, 150); // ~3s total
    } catch (err) {
      console.error("[accept-invite] unexpected error", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!inviteId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-sm text-rose-600">
          The invitation link is missing information. Please ask your team to
          resend the invite.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-sm text-slate-600">
          Loading your invitation…
        </div>
      </main>
    );
  }

  if (successMode) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
        <div className="w-full max-w-md bg-white/90 backdrop-blur-xl shadow-2xl rounded-3xl p-8 border border-slate-200 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome to {orgName ?? "your new team"} 🎉
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account has been created and your roles have been assigned.
            Redirecting you to your dashboard…
          </p>

          <div className="mt-6 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-xl shadow-2xl rounded-3xl p-10 border border-slate-200">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-md">
            <img
              src="/icons/icon-faigata.svg"
              alt="Faigata"
              className="w-10 h-10"
            />
          </div>

          <h1 className="text-2xl font-semibold text-slate-900 mt-4 tracking-tight">
            Accept your invitation
          </h1>
          <p className="text-sm text-slate-500 mt-1">
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
            />
            <FloatingInput
              label="Last name"
              type="text"
              required
              value={lastName}
              onChange={setLastName}
            />
          </div>

          <FloatingInput
            label="Work email"
            type="email"
            required
            value={email}
            onChange={setEmail}
          />

          <FloatingInput
            label="Password"
            type="password"
            required
            value={password}
            onChange={setPassword}
          />

          {error && (
            <p className="text-xs font-medium text-rose-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center rounded-xl bg-indigo-600 text-white text-sm font-semibold py-3 mt-2 hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm"
          >
            {submitting ? "Creating your account…" : "Accept invite"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          Already have a Faigata account?{" "}
          <a
            href={loginHref}
            className="text-indigo-600 font-medium hover:underline"
          >
            Log in to accept this invite
          </a>
        </p>
      </div>
    </main>
  );
}

/* floating input */

function FloatingInput({
  label,
  type,
  required,
  value,
  onChange,
}: {
  label: string;
  type: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <div className="relative">
      <input
        type={inputType}
        required={required}
        className="peer w-full rounded-xl border border-slate-300 px-3.5 pr-10 pt-5 pb-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-transparent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label className="absolute left-3.5 top-2 text-slate-600 text-xs transition-all duration-150 pointer-events-none peer-focus:-translate-y-1 peer-focus:text-[10px] peer-focus:text-indigo-600 peer-not-placeholder-shown:-translate-y-1 peer-not-placeholder-shown:text-[10px]">
        {label}
      </label>

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-3 flex items-center"
        >
          <img
            src={showPassword ? "/icons/eye-off.svg" : "/icons/eye.svg"}
            alt={showPassword ? "Hide password" : "Show password"}
            className="w-5 h-5"
          />
        </button>
      )}
    </div>
  );
}
