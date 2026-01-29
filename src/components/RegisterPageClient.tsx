// src/app/register/RegisterPageClient.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const inviteId = searchParams.get("invite");
  const teamIdParam = searchParams.get("team");
  const companyIdParam = searchParams.get("company");

  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // If user is already signed in and already has a team -> go straight to CRM
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user ?? null;

      if (!user) {
        if (!cancelled) setInitializing(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .single();

      if (cancelled) return;
      setInitializing(false);

      if (profile?.team_id) {
        router.replace("/crm");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  /**
   * Make sure a browser session exists + is persisted before redirecting.
   * Returns true only if a session is actually available.
   */
  async function ensureSessionReady(normalizedEmail: string, pwd: string) {
    // 1) If session already exists, great.
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) return true;

    // 2) Try to sign in (works when email confirmation is OFF).
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: pwd,
      });

    if (signInError || !signInData.session) {
      return false;
    }

    // 3) Give Supabase a moment to persist session to storage/cookies.
    // (This prevents "not logged in" immediately after navigation.)
    for (let i = 0; i < 5; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
      await sleep(150);
    }

    return false;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    // 1) Create user
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error || !data.user) {
      setLoading(false);
      console.error(error);
      alert(error?.message || "Registration failed");
      return;
    }

    // 2) Guarantee session before redirecting to onboarding
    // - If Supabase allows immediate session, this will succeed
    // - If email confirmation is ON, it may be impossible until user confirms
    const sessionOk =
      Boolean(data.session) || (await ensureSessionReady(normalizedEmail, password));

    if (!sessionOk) {
      setLoading(false);

      // If you WANT immediate onboarding, you must disable email confirmations in Supabase for dev.
      alert(
        "Your account was created, but Supabase did not create a login session. " +
          "This usually happens when email confirmation is enabled. " +
          "Please confirm your email (or disable confirmation for local testing), then log in."
      );

      window.location.href = "/login";
      return;
    }

    setLoading(false);

    const hasInviteContext = Boolean(inviteId || teamIdParam || companyIdParam);

    // 3) No invite/team/company → standard onboarding flow
    if (!hasInviteContext) {
      window.location.href = "/onboarding";
      return;
    }

    // 4) Invite/team/company present → complete registration on backend, then go to CRM
    // (Invited users usually shouldn't run workspace-creation onboarding.)
    try {
      const res = await fetch("/api/auth/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          teamId: teamIdParam,
          inviteId,
          companyId: companyIdParam ?? null,
          firstName,
          lastName,
        }),
      });

      if (!res.ok) {
        console.error("complete-registration failed", await res.text());
        window.location.href = "/crm";
        return;
      }

      const payload = (await res.json()) as { redirectTo?: string };

      // If backend wants to send them somewhere specific, respect it.
      if (payload.redirectTo) {
        window.location.href = payload.redirectTo;
      } else {
        window.location.href = "/crm";
      }
    } catch (err) {
      console.error("complete-registration error", err);
      window.location.href = "/crm";
    }
  }

  if (initializing) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
        <div className="w-full max-w-md bg-white/90 backdrop-blur-xl shadow-2xl rounded-3xl p-8 border border-slate-200 text-center text-sm text-slate-500">
          Checking your session…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-xl shadow-2xl rounded-3xl p-10 border border-slate-200">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-md">
            <img src="/icons/icon-faigata.svg" alt="Faigata" className="w-10 h-10" />
          </div>

          <h1 className="text-3xl font-semibold text-slate-900 mt-4 tracking-tight">
            Create your Faigata account
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            One login for all Faigata modules.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center rounded-xl bg-indigo-600 text-white text-sm font-semibold py-3 mt-2 hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm cursor-pointer"
          >
            {loading ? "Creating your account..." : "Continue"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          Already have an account?{" "}
          <Link
            href={
              inviteId || teamIdParam || companyIdParam
                ? `/login?${new URLSearchParams({
                    ...(inviteId ? { invite: inviteId } : {}),
                    ...(teamIdParam ? { team: teamIdParam } : {}),
                    ...(companyIdParam ? { company: companyIdParam } : {}),
                  }).toString()}`
                : "/login"
            }
            className="text-indigo-600 font-medium hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

/* --------------------------
   Floating label input
--------------------------- */

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
          className="absolute inset-y-0 right-3 flex items-center cursor-pointer"
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
