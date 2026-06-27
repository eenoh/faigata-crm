import { createLocaleRequestInit } from "@/features/i18n/client/requestLocale";

export async function readJsonBody<T>(
  request: Request,
  fallback: T,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return fallback;
  }
}

type LocaleAwareRequestInit = RequestInit & {
  locale?: string | null;
};

export async function localeFetch(
  input: RequestInfo | URL,
  init: LocaleAwareRequestInit = {},
) {
  const { locale, ...requestInit } = init;

  return fetch(input, createLocaleRequestInit(requestInit, locale));
}

export async function localeJsonFetch<T>(
  input: RequestInfo | URL,
  init: LocaleAwareRequestInit = {},
): Promise<T> {
  const response = await localeFetch(input, init);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
