import { ValidationError } from "@/lib/validation/primitives";

function getRequiredPublicUrl(value: string | undefined, name: string): string {
  if (!value || value.trim() === "") {
    throw new ValidationError(`Missing environment variable: ${name}`);
  }

  const trimmed = value.trim();

  try {
    new URL(trimmed);
  } catch {
    throw new ValidationError(`Environment variable ${name} must be a URL.`);
  }

  return trimmed;
}

function getOptionalPublicUrl(value: string | undefined, name: string) {
  if (!value || value.trim() === "") return undefined;

  const trimmed = value.trim();

  try {
    new URL(trimmed);
  } catch {
    throw new ValidationError(`Environment variable ${name} must be a URL.`);
  }

  return trimmed;
}

const configuredAppUrl = getOptionalPublicUrl(
  process.env.NEXT_PUBLIC_APP_URL,
  "NEXT_PUBLIC_APP_URL",
);

const supabaseUrl = getRequiredPublicUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseAnonKey) {
  throw new ValidationError(
    "Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

function getBrowserOrigin(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    return new URL(window.location.origin).toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export const publicEnv = {
  supabaseUrl,
  supabaseAnonKey,
  configuredAppUrl,
  get appUrl() {
    return configuredAppUrl || getBrowserOrigin() || "http://localhost:3000";
  },
} as const;
