"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "next-themes";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildRegisterHref(inviteId: string | null, teamId: string | null) {
  if (!inviteId && !teamId) return "/register";
  const qs = new URLSearchParams({
    ...(inviteId ? { invite: inviteId } : {}),
    ...(teamId ? { team: teamId } : {}),
  }).toString();
  return `/register?${qs}`;
}

export function LoginPageClient() {
  // ✅ MUST be called unconditionally (prevents hook order issues)
  const searchParams = useSearchParams();
  const inviteId = searchParams.get("invite");
  const teamIdParam = searchParams.get("team");

  // ✅ Theme hook unconditionally
  const { resolvedTheme } = useTheme();

  // ✅ Prevent hydration mismatch / flash
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const registerHref = useMemo(
    () => buildRegisterHref(inviteId, teamIdParam),
    [inviteId, teamIdParam],
  );

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const redirect = useCallback((to: string) => {
    window.location.href = to;
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const normalizedEmail = email.trim();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        console.error(error);
        alert(error?.message || "Invalid email or password");
        return;
      }

      const res = await fetch("/api/auth/after-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          inviteId,
          teamId: teamIdParam,
        }),
      });

      if (!res.ok) {
        console.error(
          "after-login check failed",
          await res.text().catch(() => ""),
        );
        redirect("/crm");
        return;
      }

      const payload = (await res.json().catch(() => null)) as {
        needsOnboarding: boolean;
        teamId?: string | null;
      } | null;

      redirect(payload?.needsOnboarding ? "/onboarding" : "/crm");
    } catch (err) {
      console.error("after-login error", err);
      redirect("/crm");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Safe to gate render AFTER all hooks
  if (!mounted) return null;

  const pageBg = cn(
    "min-h-screen flex items-center justify-center px-4 relative",
    // use your app background token in dark, keep your gradient feel in light
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

  return (
    <main className={pageBg}>
      {loading && <LoadingOverlay isDark={isDark} />}

      <div className={card}>
        <div className="mb-8 text-center">
          <div className={logoWrap}>
            <img
              src="/icons/icon-faigata.svg"
              alt="Faigata"
              className={cn("w-10 h-10", isDark ? "opacity-95" : "")}
            />
          </div>

          <h1 className={title}>Welcome back to Faigata</h1>
          <p className={subtitle}>Log in to continue where you left off.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
            {loading ? "Signing you in..." : "Log in"}
          </button>
        </form>

        <p className={footerText}>
          New to Faigata?{" "}
          <Link href={registerHref} className={linkClass}>
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

/* --------------------------
   Loading Overlay (3 bouncing dots)
--------------------------- */

function LoadingOverlay({ isDark }: { isDark: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className={cn(
          "absolute inset-0 backdrop-blur-md",
          isDark ? "bg-black/40" : "bg-white/40",
        )}
      />

      <div
        className={cn(
          "relative z-10 rounded-2xl border backdrop-blur-xl px-10 py-8 shadow-xl",
          isDark
            ? "border-slate-800 bg-slate-950/80"
            : "border-slate-200 bg-white/80",
        )}
      >
        <div className="flex items-end justify-center gap-2">
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.1s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce" />
        </div>

        <p
          className={cn(
            "mt-4 text-center text-sm font-semibold",
            isDark ? "text-slate-200" : "text-slate-700",
          )}
        >
          Loading
        </p>
      </div>
    </div>
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

  const inputClass = cn(
    "peer w-full rounded-xl border px-3.5 pr-10 pt-5 pb-2 text-sm focus:outline-none focus:ring-2 placeholder-transparent",
    isDark
      ? "border-slate-800 bg-slate-950 text-slate-200 focus:ring-indigo-400 focus:border-indigo-400"
      : "border-slate-300 bg-white text-slate-800 focus:ring-indigo-500 focus:border-indigo-500",
  );

  const labelClass = cn(
    "absolute left-3.5 top-2 text-xs transition-all duration-150 pointer-events-none",
    isDark ? "text-slate-400" : "text-slate-600",
    "peer-focus:-translate-y-1 peer-focus:text-[10px]",
    isDark ? "peer-focus:text-indigo-300" : "peer-focus:text-indigo-600",
    "peer-not-placeholder-shown:-translate-y-1 peer-not-placeholder-shown:text-[10px]",
  );

  return (
    <div className="relative">
      <input
        type={inputType}
        required={required}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label className={labelClass}>{label}</label>

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className={cn(
            "absolute inset-y-0 right-3 flex items-center",
            isDark ? "opacity-90" : "",
          )}
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
