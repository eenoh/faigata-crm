import { ValidationError } from "@/lib/validation/primitives";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`Missing environment variable: ${name}`);
  }

  return value.trim();
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function getRequiredEnvFromNames(
  names: readonly string[],
  label?: string,
): string {
  for (const name of names) {
    const value = getOptionalEnv(name);
    if (value) return value;
  }

  throw new ValidationError(
    `Missing environment variable: ${label ?? names.join(" or ")}`,
  );
}

export function getRequiredUrlEnv(name: string): string {
  const value = getRequiredEnv(name);

  try {
    new URL(value);
  } catch {
    throw new ValidationError(`Environment variable ${name} must be a URL.`);
  }

  return value;
}

export function getOptionalUrlEnv(name: string): string | undefined {
  const value = getOptionalEnv(name);
  if (!value) return undefined;

  try {
    new URL(value);
  } catch {
    throw new ValidationError(`Environment variable ${name} must be a URL.`);
  }

  return value;
}

export function getBooleanEnv(name: string, fallback = false): boolean {
  const value = getOptionalEnv(name);
  if (!value) return fallback;

  const normalized = value.toLowerCase();

  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  throw new ValidationError(
    `Environment variable ${name} must be a boolean-like value.`,
  );
}

export function getNumberEnv(name: string, fallback: number): number {
  const value = getOptionalEnv(name);
  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new ValidationError(
      `Environment variable ${name} must be a valid number.`,
    );
  }

  return parsed;
}
