// src/app/register/RegisterPageClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildHref(
  base: string,
  params: Record<string, string | null | undefined>,
) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v) acc[k] = v;
      return acc;
    }, {}),
  ).toString();
  return qs ? `${base}?${qs}` : base;
}

async function pollSession(maxAttempts = 5, delayMs = 150): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Make sure a browser session exists + is persisted before redirecting.
 * Returns true only if a session is actually available.
 */
async function ensureSessionReady(normalizedEmail: string, pwd: string) {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return true;

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: pwd,
    });

  if (signInError || !signInData.session) return false;

  return pollSession();
}

export function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const inviteId = searchParams.get("invite");
  const teamIdParam = searchParams.get("team");
  const companyIdParam = searchParams.get("company");

  // ✅ theme hook
  const { resolvedTheme } = useTheme();

  // ✅ prevent hydration mismatch / flash
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const hasInviteContext = useMemo(
    () => Boolean(inviteId || teamIdParam || companyIdParam),
    [inviteId, teamIdParam, companyIdParam],
  );

  const loginHref = useMemo(
    () =>
      buildHref("/login", {
        invite: inviteId,
        team: teamIdParam,
        company: companyIdParam,
      }),
    [inviteId, teamIdParam, companyIdParam],
  );

  const go = (url: string) => {
    window.location.href = url;
  };

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

      if (profile?.team_id) router.replace("/crm");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    // 1) Create user
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    });

    if (error || !data.user) {
      setLoading(false);
      console.error(error);
      alert(error?.message || "Registration failed");
      return;
    }

    // 2) Guarantee session before redirecting
    const sessionOk =
      Boolean(data.session) ||
      (await ensureSessionReady(normalizedEmail, password));

    if (!sessionOk) {
      setLoading(false);
      alert(
        "Your account was created, but Supabase did not create a login session. " +
          "This usually happens when email confirmation is enabled. " +
          "Please confirm your email (or disable confirmation for local testing), then log in.",
      );
      go("/login");
      return;
    }

    setLoading(false);

    // 3) No invite/team/company → standard onboarding
    if (!hasInviteContext) {
      go("/onboarding");
      return;
    }

    // 4) Invite/team/company present → backend completion, then CRM
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
        go("/crm");
        return;
      }

      const payload = (await res.json()) as { redirectTo?: string };
      go(payload.redirectTo || "/crm");
    } catch (err) {
      console.error("complete-registration error", err);
      go("/crm");
    }
  }

  // ✅ Safe gate AFTER hooks
  if (!mounted) return null;

  const pageBg = cn(
    "min-h-screen flex items-center justify-center px-4",
    isDark
      ? "bg-[var(--background)]"
      : "bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50",
  );

  const card = cn(
    "w-full max-w-md backdrop-blur-xl shadow-2xl rounded-3xl p-10 border",
    isDark
      ? "bg-slate-950/80 border-slate-800"
      : "bg-white/90 border-slate-200",
  );

  const title = cn(
    "text-3xl font-semibold mt-4 tracking-tight",
    isDark ? "text-slate-100" : "text-slate-900",
  );

  const subtitle = cn(
    "text-sm mt-1",
    isDark ? "text-slate-400" : "text-slate-500",
  );

  const footerText = cn(
    "mt-6 text-xs text-center",
    isDark ? "text-slate-400" : "text-slate-500",
  );

  const linkClass = cn(
    "font-medium hover:underline",
    isDark ? "text-indigo-300" : "text-indigo-600",
  );

  const logoWrap = cn(
    "inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-md",
    isDark ? "bg-slate-950 border border-slate-800" : "bg-white",
  );

  if (initializing) {
    return (
      <main className={pageBg}>
        <div
          className={cn(
            "w-full max-w-md backdrop-blur-xl shadow-2xl rounded-3xl p-8 border text-center text-sm",
            isDark
              ? "bg-slate-950/80 border-slate-800 text-slate-300"
              : "bg-white/90 border-slate-200 text-slate-500",
          )}
        >
          Checking your session…
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className={card}>
        <div className="mb-8 text-center">
          <div className={logoWrap}>
            <img
              src="/icons/icon-faigata.svg"
              alt="Faigata"
              className={cn("w-10 h-10", isDark ? "opacity-95" : "")}
            />
          </div>

          <h1 className={title}>Create your Faigata account</h1>

          <p className={subtitle}>One login for all Faigata modules.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="First name"
              type="text"
              required
              value={firstName}
              onChange={setFirstName}
              isDark={isDark}
            />
            <FloatingInput
              label="Last name"
              type="text"
              required
              value={lastName}
              onChange={setLastName}
              isDark={isDark}
            />
          </div>

          <FloatingInput
            label="Work email"
            type="email"
            required
            value={email}
            onChange={setEmail}
            isDark={isDark}
          />
          <FloatingInput
            label="Password"
            type="password"
            required
            value={password}
            onChange={setPassword}
            isDark={isDark}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center rounded-xl bg-indigo-600 text-white text-sm font-semibold py-3 mt-2 hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm cursor-pointer"
          >
            {loading ? "Creating your account..." : "Continue"}
          </button>
        </form>

        <p className={footerText}>
          Already have an account?{" "}
          <Link href={loginHref} className={linkClass}>
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
  isDark,
}: {
  label: string;
  type: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  isDark: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <div className="relative">
      <input
        type={inputType}
        required={required}
        className={cn(
          "peer w-full rounded-xl border px-3.5 pr-10 pt-5 pb-2 text-sm focus:outline-none focus:ring-2 placeholder-transparent",
          isDark
            ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400 focus:border-indigo-400"
            : "border-slate-300 bg-white text-slate-800 focus:ring-indigo-500 focus:border-indigo-500",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label
        className={cn(
          "absolute left-3.5 top-2 text-xs transition-all duration-150 pointer-events-none",
          isDark ? "text-slate-400" : "text-slate-600",
          "peer-focus:-translate-y-1 peer-focus:text-[10px] peer-not-placeholder-shown:-translate-y-1 peer-not-placeholder-shown:text-[10px]",
          isDark ? "peer-focus:text-indigo-300" : "peer-focus:text-indigo-600",
        )}
      >
        {label}
      </label>

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-3 flex items-center cursor-pointer"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          <img
            src={showPassword ? "/icons/eye-off.svg" : "/icons/eye.svg"}
            alt=""
            className={cn("w-5 h-5", isDark ? "invert opacity-80" : "")}
          />
        </button>
      )}
    </div>
  );
}
