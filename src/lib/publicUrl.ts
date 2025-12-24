// src/lib/publicUrl.ts
const PROD_FALLBACK = "https://faigata.com";
const DEV_FALLBACK = "http://localhost:3000";

export function getPublicBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "development" ? DEV_FALLBACK : PROD_FALLBACK);

  return raw.replace(/\/+$/, "");
}

export function bookingLinkUrl(slug: string) {
  return `${getPublicBaseUrl()}/b/${slug}`;
}
