import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/lib/supabase/types";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  getLocaleCookieOptions,
  normalizeLocale,
} from "@/i18n/config";

const PROTECTED_PATH_PREFIXES = [
  "/crm",
  "/dashboard",
  "/leads",
  "/pipeline",
  "/calendar",
  "/billing",
  "/settings",
  "/profile",
  "/onboarding",
] as const;

function isProtectedPath(pathname: string) {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function createNextResponseWithHeaders(
  requestHeaders: Headers,
  previousResponse?: NextResponse,
) {
  const nextResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (previousResponse) {
    previousResponse.cookies.getAll().forEach((cookie) => {
      nextResponse.cookies.set(cookie);
    });
  }

  return nextResponse;
}

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  let response = createNextResponseWithHeaders(requestHeaders);

  const supabase = createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = createNextResponseWithHeaders(requestHeaders, response);

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = isProtectedPath(pathname);

  const cookieLocale = normalizeLocale(
    request.cookies.get(LOCALE_COOKIE_NAME)?.value,
  );

  let profileLocale: string | null = null;

  if (user && isProtected) {
    const { data } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("id", user.id)
      .maybeSingle();

    profileLocale = normalizeLocale(
      (data as { preferred_language?: string | null } | null)
        ?.preferred_language ?? null,
    );
  }

  const locale = profileLocale ?? cookieLocale ?? DEFAULT_LOCALE;

  requestHeaders.set(LOCALE_HEADER_NAME, locale);
  response = createNextResponseWithHeaders(requestHeaders, response);
  response.headers.set(LOCALE_HEADER_NAME, locale);

  if (cookieLocale !== locale) {
    response.cookies.set(LOCALE_COOKIE_NAME, locale, getLocaleCookieOptions());
  }

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    const redirectResponse = NextResponse.redirect(redirectUrl);

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    redirectResponse.cookies.set(
      LOCALE_COOKIE_NAME,
      locale,
      getLocaleCookieOptions(),
    );
    redirectResponse.headers.set(LOCALE_HEADER_NAME, locale);

    return redirectResponse;
  }

  return response;
}
