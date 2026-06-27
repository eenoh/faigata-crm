export function normalizeHexColor(color: string) {
  const trimmed = (color || "").trim();
  if (!/^#?[0-9a-f]{6}$/i.test(trimmed)) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function adjustHexColor(color: string, amount: number) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return color;

  const hex = normalized.replace("#", "");
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const delta = 255 * amount;
  const clamp = (channel: number) =>
    Math.min(255, Math.max(0, channel + delta)) | 0;

  return `#${clamp(red).toString(16).padStart(2, "0")}${clamp(green)
    .toString(16)
    .padStart(2, "0")}${clamp(blue).toString(16).padStart(2, "0")}`;
}

export function lightenHexColor(color: string, amount = 0.2) {
  return adjustHexColor(color, Math.abs(amount));
}

export function darkenHexColor(color: string, amount = 0.2) {
  return adjustHexColor(color, -Math.abs(amount));
}

export function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = (value || "")
    .split(":")
    .map((part) => parseInt(part, 10));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}
