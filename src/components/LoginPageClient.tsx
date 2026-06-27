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
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildHref(
  base: string,
  params: Record<string, string | null | undefined>,
) {
  const qs = new URLSearchParams(
    Object.entries(params).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (value) acc[key] = value;
        return acc;
      },
      {},
    ),
  ).toString();

  return qs ? `${base}?${qs}` : base;
}

function sanitizeNextPath(value: string | null) {
  return value && value.startsWith("/") ? value : null;
}

function getAuthedLocaleHeaders(accessToken: string | null, locale: string) {
  return {
    "Content-Type": "application/json",
    "x-faigata-locale": locale,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

type AfterLoginResponse = {
  needsOnboarding: boolean;
  teamId?: string | null;
};

export function LoginPageClient() {
  const t = useTranslations("LoginPage");
  const common = useTranslations("Common");
  const locale = useLocale();

  const searchParams = useSearchParams();
  const inviteId = searchParams.get("invite");
  const teamIdParam = searchParams.get("team");
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const authError = searchParams.get("error");
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  const registerHref = useMemo(
    () =>
      buildHref("/register", {
        invite: inviteId,
        team: teamIdParam,
        next: nextPath,
      }),
    [inviteId, teamIdParam, nextPath],
  );

  const redirect = useCallback((to: string) => {
    window.location.href = to;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function continueExistingSession() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return;

      const response = await fetch("/api/auth/after-login", {
        method: "POST",
        headers: getAuthedLocaleHeaders(session.access_token, locale),
        body: JSON.stringify({
          inviteId,
          teamId: teamIdParam,
        }),
      });

      if (!response.ok || cancelled) return;

      const payload = (await response
        .json()
        .catch(() => null)) as AfterLoginResponse | null;

      redirect(payload?.needsOnboarding ? "/onboarding" : (nextPath ?? "/crm"));
    }

    continueExistingSession().catch((error) => {
      console.error("[login] existing session continuation failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, [inviteId, teamIdParam, nextPath, redirect, locale]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const normalizedEmail = email.trim();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        console.error(error);
        setStatusMessage(resolveLoginErrorMessage(error, t));
        return;
      }

      const accessToken = data.session?.access_token ?? null;
      const res = await fetch("/api/auth/after-login", {
        method: "POST",
        headers: getAuthedLocaleHeaders(accessToken, locale),
        body: JSON.stringify({
          inviteId,
          teamId: teamIdParam,
        }),
      });

      if (!res.ok) {
        console.error(
          "[login] after-login check failed",
          await res.text().catch(() => ""),
        );
        setStatusMessage(t("errors.afterLoginFailed"));
        redirect(nextPath ?? "/crm");
        return;
      }

      const payload = (await res
        .json()
        .catch(() => null)) as AfterLoginResponse | null;

      redirect(payload?.needsOnboarding ? "/onboarding" : (nextPath ?? "/crm"));
    } catch (err) {
      console.error("[login] after-login error", err);
      setStatusMessage(t("errors.unexpected"));
      redirect(nextPath ?? "/crm");
    } finally {
      setLoading(false);
    }
  }

  const pageBg = cn(
    "min-h-screen flex items-center justify-center px-4 relative",
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

  const errorTextClass = cn(
    "mt-3 text-xs",
    isDark ? "text-amber-300" : "text-amber-600",
  );

  return (
    <main className={pageBg}>
      {loading && <LoadingOverlay isDark={isDark} />}

      <div className={card}>
        <div className="mb-8 text-center">
          <div className={logoWrap}>
            <img
              src="/icons/icon-faigata.svg"
              alt={common("brand.logoAlt")}
              className={cn("w-10 h-10", isDark ? "opacity-95" : "")}
            />
          </div>

          <h1 className={title}>{t("page.title")}</h1>
          <p className={subtitle}>{t("page.subtitle")}</p>

          {authError === "auth_confirm_failed" ? (
            <p className={errorTextClass}>{t("errors.authConfirmFailed")}</p>
          ) : null}

          {statusMessage ? (
            <p
              className={cn(
                "mt-3 text-xs",
                isDark ? "text-rose-300" : "text-rose-600",
              )}
            >
              {statusMessage}
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <FloatingInput
            label={common("fields.workEmail")}
            type="email"
            required
            value={email}
            onChange={setEmail}
            isDark={isDark}
          />

          <FloatingInput
            label={common("fields.password")}
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
            {loading ? t("actions.signingIn") : common("auth.logIn")}
          </button>
        </form>

        <p className={footerText}>
          {t("footer.newToFaigata")}{" "}
          <Link href={registerHref} className={linkClass}>
            {common("auth.createAccount")}
          </Link>
        </p>
      </div>
    </main>
  );
}

function LoadingOverlay({ isDark }: { isDark: boolean }) {
  const t = useTranslations("LoginPage");

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
          {t("states.loading")}
        </p>
      </div>
    </div>
  );
}

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
  const common = useTranslations("Common");
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
        placeholder={label}
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
          aria-label={
            showPassword
              ? common("auth.hidePassword")
              : common("auth.showPassword")
          }
          title={
            showPassword
              ? common("auth.hidePassword")
              : common("auth.showPassword")
          }
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

function resolveLoginErrorMessage(
  error: { message?: string; status?: number; code?: string | null } | null,
  t: ReturnType<typeof useTranslations<"LoginPage">>,
) {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";

  if (
    code.includes("invalid_credentials") ||
    message.includes("invalid login credentials") ||
    message.includes("email not confirmed") ||
    message.includes("invalid email or password")
  ) {
    return t("errors.invalidEmailOrPassword");
  }

  if (message.includes("email not confirmed")) {
    return t("errors.emailNotConfirmed");
  }

  if (message.includes("too many requests")) {
    return t("errors.tooManyRequests");
  }

  if (message.includes("network") || error?.status === 0) {
    return t("errors.network");
  }

  return t("errors.loginFailed");
}
