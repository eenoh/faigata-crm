// src/app/register/RegisterPageClient.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  // If user is already signed in and already has a team -> go straight to dashboard
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
        router.replace("/product-suite");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    setLoading(false);

    if (error || !data.user) {
      console.error(error);
      alert(error?.message || "Registration failed");
      return;
    }

    const hasInviteContext = Boolean(inviteId || teamIdParam || companyIdParam);

    // No invite / team / company in URL → standard onboarding flow
    if (!hasInviteContext) {
      // here the onboarding flow will create the first team & attach profile/team/company
      window.location.href = "/onboarding";
      return;
    }

    // Invite / team / company present → complete registration on backend
    try {
      const res = await fetch("/api/auth/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          teamId: teamIdParam,
          inviteId,
          companyId: companyIdParam ?? null,
          firstName,        // <-- send names to API
          lastName,         // <--
        }),
      });

      if (!res.ok) {
        console.error("complete-registration failed", await res.text());
        // fall back to the product hub; it will show the teams the user is in
        window.location.href = "/product-suite";
        return;
      }

      const payload = (await res.json()) as { redirectTo: string };

      if (payload.redirectTo?.startsWith("/dashboard")) {
        window.location.href = "/product-suite";
      } else if (payload.redirectTo) {
        window.location.href = payload.redirectTo;
      } else {
        window.location.href = "/product-suite";
      }
    } catch (err) {
      console.error("complete-registration error", err);
      window.location.href = "/product-suite";
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
            <img
              src="/icons/icon-faigata.svg"
              alt="Faigata"
              className="w-10 h-10"
            />
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
            className="w-full flex items-center justify-center rounded-xl bg-indigo-600 text-white text-sm font-semibold py-3 mt-2 hover:bg-indigo-700 transition disabled:opacity-60 shadow-sm"
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
