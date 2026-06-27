"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { publicEnv } from "@/lib/env/public";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLocale, useTranslations } from "next-intl";

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

async function pollSession(maxAttempts = 5, delayMs = 150): Promise<boolean> {
  for (let index = 0; index < maxAttempts; index++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function ensureSessionReady(normalizedEmail: string, password: string) {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return true;

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

  if (signInError || !signInData.session) return false;

  return pollSession();
}

type CompleteRegistrationResponse = {
  redirectTo?: string;
};

export function RegisterPageClient() {
  const t = useTranslations("RegisterPage");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const inviteId = searchParams.get("invite");
  const teamIdParam = searchParams.get("team");
  const companyIdParam = searchParams.get("company");
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

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
        next: nextPath,
      }),
    [inviteId, teamIdParam, companyIdParam, nextPath],
  );

  const confirmationRedirectPath = useMemo(
    () =>
      buildHref("/login", {
        invite: inviteId,
        team: teamIdParam,
        company: companyIdParam,
        next: nextPath,
      }),
    [inviteId, teamIdParam, companyIdParam, nextPath],
  );

  const go = (url: string) => {
    window.location.href = url;
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: sessionRes } = await supabase.auth.getSession();
      const user = sessionRes.session?.user ?? null;

      if (!user) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profile?.team_id) {
        router.replace(nextPath ?? "/crm");
        return;
      }

      if (!hasInviteContext) {
        router.replace("/onboarding");
      }
    })().catch((error) => {
      console.error("[register] initialization failed", error);
      if (!cancelled) {
        setStatusMessage(t("errors.initializationFailed"));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router, hasInviteContext, nextPath, t]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName },
          emailRedirectTo: `${publicEnv.appUrl}/auth/confirm?next=${encodeURIComponent(
            confirmationRedirectPath,
          )}`,
        },
      });

      if (error || !data.user) {
        console.error(error);
        setStatusMessage(resolveRegisterErrorMessage(error, t));
        return;
      }

      const sessionOk =
        Boolean(data.session) ||
        (await ensureSessionReady(normalizedEmail, password));

      if (!sessionOk) {
        setStatusMessage(t("errors.sessionNotCreated"));
        go(confirmationRedirectPath);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken =
        data.session?.access_token ?? sessionData.session?.access_token ?? null;

      if (!hasInviteContext) {
        go("/onboarding");
        return;
      }

      try {
        const res = await fetch("/api/auth/complete-registration", {
          method: "POST",
          headers: getAuthedLocaleHeaders(accessToken, locale),
          body: JSON.stringify({
            teamId: teamIdParam,
            inviteId,
            companyId: companyIdParam ?? null,
            firstName,
            lastName,
          }),
        });

        if (!res.ok) {
          console.error(
            "[register] complete-registration failed",
            await res.text().catch(() => ""),
          );
          setStatusMessage(t("errors.completeRegistrationFailed"));
          go(nextPath ?? "/crm");
          return;
        }

        const payload = (await res
          .json()
          .catch(() => null)) as CompleteRegistrationResponse | null;

        go(payload?.redirectTo || nextPath || "/crm");
      } catch (err) {
        console.error("[register] complete-registration error", err);
        setStatusMessage(t("errors.completeRegistrationUnexpected"));
        go(nextPath ?? "/crm");
      }
    } catch (err) {
      console.error("[register] signup error", err);
      setStatusMessage(t("errors.unexpected"));
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <main className={pageBg}>
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
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label={common("fields.firstName")}
              type="text"
              required
              value={firstName}
              onChange={setFirstName}
              isDark={isDark}
            />
            <FloatingInput
              label={common("fields.lastName")}
              type="text"
              required
              value={lastName}
              onChange={setLastName}
              isDark={isDark}
            />
          </div>

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
            {loading
              ? common("auth.creatingAccount")
              : common("auth.createAccount")}
          </button>
        </form>

        <p className={footerText}>
          {t("footer.alreadyHaveAccount")}{" "}
          <Link href={loginHref} className={linkClass}>
            {common("auth.logIn")}
          </Link>
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

  return (
    <div className="relative">
      <input
        type={inputType}
        required={required}
        placeholder={label}
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

function resolveRegisterErrorMessage(
  error: { message?: string; status?: number; code?: string | null } | null,
  t: ReturnType<typeof useTranslations<"RegisterPage">>,
) {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";

  if (
    code.includes("user_already_exists") ||
    message.includes("user already registered") ||
    message.includes("already registered")
  ) {
    return t("errors.userAlreadyExists");
  }

  if (message.includes("password should be at least")) {
    return t("errors.passwordTooShort");
  }

  if (message.includes("invalid email")) {
    return t("errors.invalidEmail");
  }

  if (message.includes("too many requests")) {
    return t("errors.tooManyRequests");
  }

  if (message.includes("network") || error?.status === 0) {
    return t("errors.network");
  }

  return t("errors.registrationFailed");
}
