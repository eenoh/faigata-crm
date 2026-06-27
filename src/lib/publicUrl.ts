import { publicEnv } from "@/lib/env/public";

function resolveBaseUrl(): string {
  return publicEnv.appUrl.trim().replace(/\/+$/, "");
}

export function getPublicBaseUrl(): string {
  return resolveBaseUrl();
}

export function bookingLinkUrl(slug: string): string {
  const safeSlug = encodeURIComponent(slug.trim());
  return `${getPublicBaseUrl()}/b/${safeSlug}`;
}
