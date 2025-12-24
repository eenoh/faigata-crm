"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const inviteId = searchParams.get("invite");
  const teamIdParam = searchParams.get("team");

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      setLoading(false);
      console.error(error);
      alert(error?.message || "Invalid email or password");
      return;
    }

    try {
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
        console.error("after-login check failed", await res.text());
        window.location.href = "/crm";
        return;
      }

      const payload = (await res.json()) as {
        needsOnboarding: boolean;
        teamId?: string | null;
      };

      if (payload.needsOnboarding) {
        window.location.href = "/onboarding";
      } else {
        window.location.href = "/crm";
      }
    } catch (err) {
      console.error("after-login error", err);
      window.location.href = "/crm";
    } finally {
      // If you navigate away, this won't matter, but it's correct for edge cases.
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4 relative">
      {/* ✅ Loading overlay */}
      {loading && <LoadingOverlay />}

      <div className="w-full max-w-md bg-white/90 backdrop-blur-xl shadow-2xl rounded-3xl p-10 border border-slate-200">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white shadow-md">
            <img
              src="/icons/icon-faigata.svg"
              alt="Faigata"
              className="w-10 h-10"
            />
          </div>

          <h1 className="text-3xl font-semibold text-slate-900 mt-4 tracking-tight">
            Welcome back to Faigata
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            Log in to continue where you left off.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
            {loading ? "Signing you in..." : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          New to Faigata?{" "}
          <Link
            href={
              inviteId || teamIdParam
                ? `/register?${new URLSearchParams({
                    ...(inviteId ? { invite: inviteId } : {}),
                    ...(teamIdParam ? { team: teamIdParam } : {}),
                  }).toString()}`
                : "/register"
            }
            className="text-indigo-600 font-medium hover:underline"
          >
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

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* blurred backdrop */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-md" />

      {/* loader card */}
      <div className="relative z-10 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-xl px-10 py-8 shadow-xl">
        <div className="flex items-end justify-center gap-2">
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.1s]" />
          <span className="h-3 w-3 rounded-full bg-indigo-600 animate-bounce" />
        </div>

        <p className="mt-4 text-center text-sm font-semibold text-slate-700">
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
