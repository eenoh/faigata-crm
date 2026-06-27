const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getBearerToken(request: Request | { headers: Headers }) {
  const header =
    request.headers.get("authorization") ??
    request.headers.get("Authorization") ??
    "";

  return header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

export function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

export function pickFirstRouteParam(value: unknown) {
  return Array.isArray(value)
    ? normalizeString(value[0])
    : normalizeString(value);
}