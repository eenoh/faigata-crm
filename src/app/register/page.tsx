"use client";

import Link from "next/link";
import { useState } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register",
};

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);

  // ADD THESE — you never stored inputs before
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
      }),
    });

    if (res.ok) {
      window.location.href = "/onboarding";
    } else {
      alert("Registration failed");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 px-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-xl shadow-2xl rounded-3xl p-10 border border-slate-200">

        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-2xl font-bold shadow-md">
            F
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

          {/* First + Last Name */}
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="First name"
              type="text"
              required
              value={firstName}
              onChange={(v) => setFirstName(v)}
            />

            <FloatingInput
              label="Last name"
              type="text"
              required
              value={lastName}
              onChange={(v) => setLastName(v)}
            />
          </div>

          {/* Email */}
          <FloatingInput
            label="Work email"
            type="email"
            required
            value={email}
            onChange={(v) => setEmail(v)}
          />

          {/* Password */}
          <FloatingInput
            label="Password"
            type="password"
            required
            value={password}
            onChange={(v) => setPassword(v)}
          />

          {/* Button */}
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
          <Link href="/login" className="text-indigo-600 font-medium hover:underline">
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

      <label
        className="absolute left-3.5 top-2 text-slate-600 text-xs transition-all duration-150 pointer-events-none peer-focus:-translate-y-1 peer-focus:text-[10px] peer-focus:text-indigo-600 peer-not-placeholder-shown:-translate-y-1 peer-not-placeholder-shown:text-[10px]"
      >
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
