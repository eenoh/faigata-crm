"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/components/providers/ThemeProvider";
import { withLocaleHeader } from "@/features/i18n/client/requestLocale";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type FieldErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
};

type ErrorState = {
  title: string;
  message: string;
  code?: string | null;
  retryable?: boolean;
};

async function crmLocaleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withLocaleHeader(init?.headers),
  });
}

function mapApiErrorToUi(
  json: any,
  fallback: string,
  t: ReturnType<typeof useTranslations<"AcceptInvitePage">>,
): ErrorState {
  const code = typeof json?.code === "string" ? json.code : null;

  switch (code) {
    case "invite_not_found":
      return {
        title: t("apiErrors.inviteNotFound.title"),
        message: t("apiErrors.inviteNotFound.message"),
        code,
      };
    case "invite_already_accepted":
      return {
        title: t("apiErrors.inviteAlreadyAccepted.title"),
        message: t("apiErrors.inviteAlreadyAccepted.message"),
        code,
      };
    case "invite_expired":
      return {
        title: t("apiErrors.inviteExpired.title"),
        message: t("apiErrors.inviteExpired.message"),
        code,
      };
    case "invite_email_mismatch":
      return {
        title: t("apiErrors.inviteEmailMismatch.title"),
        message: t("apiErrors.inviteEmailMismatch.message"),
        code,
      };
    case "auth_create_user_failed":
      return {
        title: t("apiErrors.authCreateUserFailed.title"),
        message: json?.details || t("apiErrors.authCreateUserFailed.message"),
        code,
      };
    case "auth_update_user_failed":
      return {
        title: t("apiErrors.authUpdateUserFailed.title"),
        message: json?.details || t("apiErrors.authUpdateUserFailed.message"),
        code,
      };
    case "profile_upsert_failed":
    case "team_members_upsert_failed":
    case "invite_accept_failed":
      return {
        title: t("apiErrors.inviteAcceptFailed.title"),
        message: t("apiErrors.inviteAcceptFailed.message"),
        code,
      };
    default:
      return {
        title: t("apiErrors.generic.title"),
        message: json?.error || fallback,
        code,
      };
  }
}

function ErrorAlert({
  error,
  onDismiss,
  action,
}: {
  error: ErrorState;
  onDismiss?: () => void;
  action?: React.ReactNode;
}) {
  const t = useTranslations("AcceptInvitePage");

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        "border-rose-200 bg-rose-50 text-rose-900",
        "dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200",
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
            "bg-rose-100 text-rose-700",
            "dark:bg-rose-900/60 dark:text-rose-200",
          )}
        >
          !
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{error.title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{error.message}</p>

          {(action || onDismiss) && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {action}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className={cn(
                    "text-sm font-medium underline underline-offset-4 cursor-pointer",
                    "text-rose-700 hover:text-rose-800",
                    "dark:text-rose-300 dark:hover:text-rose-200",
                  )}
                >
                  {t("actions.dismiss")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInviteClient() {
  const t = useTranslations("AcceptInvitePage");
  const common = useTranslations("Common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const inviteId =
    searchParams.get("inviteId") ??
    searchParams.get("invite") ??
    searchParams.get("id") ??
    searchParams.get("token");

  const teamQuery = searchParams.get("team");
  const companyQuery = searchParams.get("company");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMode, setSuccessMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

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

  const [pageError, setPageError] = useState<ErrorState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const loginHref = useMemo(() => {
    const q = new URLSearchParams();
    if (inviteId) q.set("inviteId", inviteId);

    const team = resolvedTeamId ?? teamQuery;
    const company = resolvedCompanyId ?? companyQuery;

    if (team) q.set("team", team);
    if (company) q.set("company", company);

    const qs = q.toString();
    return `/login${qs ? `?${qs}` : ""}`;
  }, [inviteId, resolvedTeamId, resolvedCompanyId, teamQuery, companyQuery]);

  const pageBg = cn(
    "min-h-screen flex items-center justify-center px-4",
    "bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50",
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

  function getInputClass(hasError?: boolean) {
    return cn(
      "peer w-full rounded-xl border px-3.5 pr-10 pt-5 pb-2 text-sm placeholder-transparent",
      "focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-500",
      "border-slate-300 bg-white text-slate-800",
      "dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-indigo-400 dark:focus:border-indigo-400",
      hasError &&
        "border-rose-400 focus:border-rose-500 focus:ring-rose-500 dark:border-rose-700 dark:focus:border-rose-500 dark:focus:ring-rose-500",
    );
  }

  const labelBase = cn(
    "absolute left-3.5 top-2 text-xs transition-all duration-150 pointer-events-none",
    "text-slate-600",
    "peer-focus:-translate-y-1 peer-focus:text-[10px] peer-focus:text-indigo-600 peer-not-placeholder-shown:-translate-y-1 peer-not-placeholder-shown:text-[10px]",
    "dark:text-slate-400 dark:peer-focus:text-indigo-400",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!inviteId) {
        setPageError({
          title: t("errors.invalidLink.title"),
          message: t("errors.invalidLink.message"),
        });
        setLoading(false);
        return;
      }

      setLoading(true);
      setPageError(null);

      try {
        const res = await crmLocaleFetch(
          `/api/crm/invite/accept?inviteId=${encodeURIComponent(inviteId)}`,
        );
        const json = (await res.json().catch(() => null)) as any;

        if (cancelled) return;

        if (!res.ok || !json) {
          setPageError(mapApiErrorToUi(json, t("errors.inviteLoadInvalid"), t));
          return;
        }

        setInviteEmail(json.email ?? "");
        setEmail(json.email ?? "");
        setOrgName(json.organizationName ?? null);
        setResolvedTeamId(json.teamId ?? null);
        setResolvedCompanyId(json.companyId ?? null);
      } catch {
        if (!cancelled) {
          setPageError({
            title: t("errors.loadFailed.title"),
            message: t("errors.loadFailed.message"),
            retryable: true,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInvite();

    return () => {
      cancelled = true;
    };
  }, [inviteId, reloadKey, t]);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: undefined };
    });
  }

  function validateForm() {
    const next: FieldErrors = {};

    if (!firstName.trim()) next.firstName = t("validation.firstNameRequired");
    if (!lastName.trim()) next.lastName = t("validation.lastNameRequired");
    if (!email.trim()) next.email = t("validation.emailRequired");
    if (!password.trim()) {
      next.password = t("validation.passwordRequired");
    } else if (password.length < 8) {
      next.password = t("validation.passwordMin");
    }

    if (
      inviteEmail &&
      email.trim() &&
      inviteEmail.toLowerCase() !== email.trim().toLowerCase()
    ) {
      next.email = t("validation.emailMismatch");
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPageError(null);

    if (!inviteId) {
      setPageError({
        title: t("errors.invalidLink.title"),
        message: t("errors.invalidLink.message"),
      });
      return;
    }

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      const res = await crmLocaleFetch("/api/crm/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok || !json?.ok) {
        const mapped = mapApiErrorToUi(json, t("errors.acceptFailed"), t);

        if (mapped.code === "invite_email_mismatch") {
          setFieldErrors((prev) => ({
            ...prev,
            email: t("validation.emailMismatch"),
          }));
        }

        setPageError(mapped);
        return;
      }

      const redirectTeamId: string | null =
        json.teamId ?? resolvedTeamId ?? teamQuery;

      await supabase.auth
        .signInWithPassword({ email: email.trim(), password })
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
      setPageError({
        title: t("errors.network.title"),
        message: t("errors.network.message"),
      });
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
        <div className="w-full max-w-md">
          <ErrorAlert
            error={{
              title: t("errors.invalidLink.title"),
              message: t("errors.invalidLink.message"),
            }}
          />
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
        <div className={smallCard}>{t("states.loadingInvite")}</div>
      </main>
    );
  }

  if (successMode) {
    return (
      <main className={pageBg}>
        <div className={cn(card, "p-8 text-center")}>
          <h1 className={cn("text-2xl", title)}>
            {t("success.title", {
              orgName: orgName ?? t("success.defaultOrg"),
            })}
          </h1>
          <p className={cn("mt-2", sub)}>{t("success.description")}</p>

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

          <h1 className={cn("text-2xl mt-4", title)}>{t("page.title")}</h1>
          <p className={cn("mt-1", sub)}>
            {orgName
              ? t("page.descriptionWithOrg", { orgName })
              : t("page.descriptionWithoutOrg")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {pageError && (
            <ErrorAlert
              error={pageError}
              onDismiss={() => setPageError(null)}
              action={
                pageError.retryable ? (
                  <button
                    type="button"
                    onClick={() => setReloadKey((n) => n + 1)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer",
                      "bg-rose-600 text-white hover:bg-rose-700",
                      "dark:bg-rose-700 dark:hover:bg-rose-600",
                    )}
                  >
                    {t("actions.tryAgain")}
                  </button>
                ) : undefined
              }
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label={common("fields.firstName")}
              type="text"
              required
              value={firstName}
              onChange={(v) => {
                setFirstName(v);
                clearFieldError("firstName");
              }}
              inputClassName={getInputClass(Boolean(fieldErrors.firstName))}
              labelClassName={labelBase}
              error={fieldErrors.firstName}
              isDark={isDark}
            />
            <FloatingInput
              label={common("fields.lastName")}
              type="text"
              required
              value={lastName}
              onChange={(v) => {
                setLastName(v);
                clearFieldError("lastName");
              }}
              inputClassName={getInputClass(Boolean(fieldErrors.lastName))}
              labelClassName={labelBase}
              error={fieldErrors.lastName}
              isDark={isDark}
            />
          </div>

          <FloatingInput
            label={common("fields.workEmail")}
            type="email"
            required
            value={email}
            onChange={(v) => {
              setEmail(v);
              clearFieldError("email");
            }}
            inputClassName={getInputClass(Boolean(fieldErrors.email))}
            labelClassName={labelBase}
            error={fieldErrors.email}
            isDark={isDark}
          />

          <FloatingInput
            label={common("fields.password")}
            type="password"
            required
            value={password}
            onChange={(v) => {
              setPassword(v);
              clearFieldError("password");
            }}
            inputClassName={getInputClass(Boolean(fieldErrors.password))}
            labelClassName={labelBase}
            error={fieldErrors.password}
            isDark={isDark}
          />

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "w-full flex items-center justify-center rounded-xl text-sm font-semibold py-3 mt-2 transition shadow-sm cursor-pointer",
              "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed",
              "dark:bg-indigo-500 dark:hover:bg-indigo-600",
            )}
          >
            {submitting
              ? common("auth.creatingAccount")
              : t("actions.acceptInvite")}
          </button>
        </form>

        <p
          className={cn(
            "mt-6 text-xs text-center",
            "text-slate-500 dark:text-slate-400",
          )}
        >
          {t.rich("footer.loginPrompt", {
            link: (chunks) => (
              <a
                href={loginHref}
                className="text-indigo-600 font-medium hover:underline dark:text-indigo-400"
              >
                {chunks}
              </a>
            ),
          })}
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
  error,
  isDark,
}: {
  label: string;
  type: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  inputClassName: string;
  labelClassName: string;
  error?: string;
  isDark: boolean;
}) {
  const common = useTranslations("Common");
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  const errorId = `${label.replace(/\s+/g, "-").toLowerCase()}-error`;

  return (
    <div className="relative">
      <input
        type={inputType}
        required={required}
        className={inputClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      <label className={labelClassName}>{label}</label>

      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className={cn(
            "absolute inset-y-0 right-3 flex items-center cursor-pointer",
            isDark ? "opacity-90" : "",
          )}
          aria-label={
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

      {error && (
        <p
          id={errorId}
          className="mt-1 px-1 text-xs font-medium text-rose-600 dark:text-rose-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
