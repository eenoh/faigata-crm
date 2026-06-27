export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function ensureNonEmptyString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${label} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${label} is required.`);
  }

  return trimmed;
}

export function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ensureEmail(value: unknown, label = "Email"): string {
  const email = ensureNonEmptyString(value, label).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError(`${label} must be a valid email address.`);
  }

  return email;
}

export function ensurePassword(
  value: unknown,
  label = "Password",
  minLength = 8,
): string {
  const password = ensureNonEmptyString(value, label);

  if (password.length < minLength) {
    throw new ValidationError(
      `${label} must be at least ${minLength} characters long.`,
    );
  }

  return password;
}

export function ensureObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
