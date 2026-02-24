// src/lib/publicUrl.ts

const PROD_FALLBACK = "https://faigata.com";
const DEV_FALLBACK = "http://localhost:3000";

let cachedBaseUrl: string | null = null;

function resolveBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "development" ? DEV_FALLBACK : PROD_FALLBACK);

  return raw.trim().replace(/\/+$/, "");
}

export function getPublicBaseUrl(): string {
  if (!cachedBaseUrl) {
    cachedBaseUrl = resolveBaseUrl();
  }
  return cachedBaseUrl;
}

export function bookingLinkUrl(slug: string): string {
  const safeSlug = encodeURIComponent(slug.trim());
  return `${getPublicBaseUrl()}/b/${safeSlug}`;
}
