import type {
  LeadContactType,
  LeadFieldDefinition,
  LeadInputContactType,
  LeadInputGender,
  LeadInputSourceCategory,
  LeadInputSourceName,
  LeadInputType,
} from "@/features/crm/types/lead";

export type LeadSystemFieldKey =
  | "lead_name"
  | "niche"
  | "lead_type"
  | "gender"
  | "country"
  | "region"
  | "city"
  | "postal_code"
  | "primary_contact_type"
  | "primary_contact_value"
  | "source_category"
  | "source_name";

const CUSTOM_KEY_ALIASES: Record<string, string> = {
  industry: "field_2",
};

const RESERVED_CUSTOM_VALUE_KEYS: LeadSystemFieldKey[] = [
  "lead_name",
  "niche",
  "lead_type",
  "gender",
  "country",
  "region",
  "city",
  "postal_code",
  "primary_contact_type",
  "primary_contact_value",
  "source_category",
  "source_name",
];

const RESERVED_TABLE_ONLY_KEYS = ["__score", "__lead_name", "__stage"];

const reservedCustomValueKeySet = new Set(
  RESERVED_CUSTOM_VALUE_KEYS.map((key) => normalizeLeadKey(key)),
);

const reservedTableColumnKeySet = new Set(
  [...RESERVED_CUSTOM_VALUE_KEYS, ...RESERVED_TABLE_ONLY_KEYS].map((key) =>
    normalizeLeadKey(key),
  ),
);

export const SYSTEM_CSV_COLUMNS: Record<string, LeadSystemFieldKey> = {
  "lead name": "lead_name",
  lead_name: "lead_name",
  name: "lead_name",
  "niche / industry": "niche",
  niche: "niche",
  industry: "niche",
  "lead type": "lead_type",
  lead_type: "lead_type",
  gender: "gender",
  city: "city",
  region: "region",
  country: "country",
  "postal code": "postal_code",
  postal_code: "postal_code",
  zip: "postal_code",
  zip_code: "postal_code",
  "primary contact type": "primary_contact_type",
  primary_contact_type: "primary_contact_type",
  contact_type: "primary_contact_type",
  "primary contact": "primary_contact_value",
  primary_contact_value: "primary_contact_value",
  contact: "primary_contact_value",
  "source category": "source_category",
  source_category: "source_category",
  "source name": "source_name",
  source_name: "source_name",
};

export function normalizeLeadKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function isReservedLeadCustomValueKey(value: unknown) {
  return reservedCustomValueKeySet.has(normalizeLeadKey(value));
}

export function isReservedLeadTableColumnKey(value: unknown) {
  return reservedTableColumnKeySet.has(normalizeLeadKey(value));
}

export function buildNormalizedCustomMap(
  custom: Record<string, unknown> | null | undefined,
) {
  const out: Record<string, unknown> = {};
  const obj = custom && typeof custom === "object" ? custom : {};
  for (const [key, value] of Object.entries(obj)) {
    out[normalizeLeadKey(key)] = value;
  }
  return out;
}

export function getCustomValue(
  custom: Record<string, unknown> | null | undefined,
  normalizedCustom: Record<string, unknown>,
  fieldKey: string,
) {
  const direct = custom?.[fieldKey];
  if (direct !== undefined) return direct;

  const normalizedFieldKey = normalizeLeadKey(fieldKey);
  if (normalizedFieldKey in normalizedCustom) {
    return normalizedCustom[normalizedFieldKey];
  }

  const aliasTarget = CUSTOM_KEY_ALIASES[normalizedFieldKey];
  if (aliasTarget) {
    const directAlias = custom?.[aliasTarget];
    if (directAlias !== undefined) return directAlias;

    const normalizedAlias = normalizeLeadKey(aliasTarget);
    if (normalizedAlias in normalizedCustom) {
      return normalizedCustom[normalizedAlias];
    }
  }

  for (const [legacyKey, aliasKey] of Object.entries(CUSTOM_KEY_ALIASES)) {
    if (normalizeLeadKey(aliasKey) !== normalizedFieldKey) continue;

    const legacyDirect = custom?.[legacyKey];
    if (legacyDirect !== undefined) return legacyDirect;

    const normalizedLegacy = normalizeLeadKey(legacyKey);
    if (normalizedLegacy in normalizedCustom) {
      return normalizedCustom[normalizedLegacy];
    }
  }

  return undefined;
}

export function fieldStorageKey(def: LeadFieldDefinition) {
  const normalizedKey = normalizeLeadKey(def.key);

  if (/^field_\d+$/.test(normalizedKey)) return normalizedKey;

  if (typeof def.position === "number" && def.position > 0) {
    return `field_${def.position}`;
  }

  return normalizedKey;
}

export function labelizeEnum(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  return trimmed
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function safeValue(value: unknown) {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

export function formatCustomValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return safeValue(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function looksLikeUrl(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    /^[a-z0-9.-]+\.[a-z]{2,}([/].*)?$/i.test(value)
  );
}

export function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function contactHref(
  type: LeadContactType | "" | undefined,
  value: string,
) {
  const raw = value.trim();
  if (!raw) return null;

  if (type === "email") return `mailto:${raw}`;
  if (type === "phone") return `tel:${raw.replace(/\s+/g, "")}`;

  if (looksLikeUrl(raw)) return normalizeUrl(raw);
  return null;
}

export function deriveLeadName(
  leadNameColumn: string | null | undefined,
  customValues: Record<string, unknown>,
  stage: string,
) {
  const directColumn = String(leadNameColumn ?? "").trim();
  if (directColumn) return directColumn;

  const values = customValues ?? {};
  const directCustomValue = String(values.lead_name ?? "").trim();
  if (directCustomValue) return directCustomValue;

  const preferredKeys = [
    "name",
    "full_name",
    "first_name",
    "last_name",
    "company",
    "account",
    "email",
  ];

  const entries = Object.entries(values).map(([key, value]) => [
    key.toLowerCase(),
    value,
  ] as const);

  for (const preferredKey of preferredKeys) {
    const match = entries.find(
      ([key, value]) =>
        key.includes(preferredKey) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== "",
    );

    if (match) return String(match[1]).trim();
  }

  const fallback = entries.find(
    ([, value]) =>
      value !== null && value !== undefined && String(value).trim() !== "",
  );
  if (fallback) return String(fallback[1]).trim();

  return null;
}

export function normalizeBlankToNull(value: string) {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export function getLeadFieldSelectOptions(field: LeadFieldDefinition) {
  const values = Array.isArray(field.options) ? field.options : [];
  const labels =
    Array.isArray(field.optionLabels) && field.optionLabels.length === values.length
      ? field.optionLabels
      : values;

  return values.map((value, index) => ({
    value,
    label: labels[index] ?? value,
  }));
}

export function getLeadFieldSelectLabel(
  field: LeadFieldDefinition | null | undefined,
  value: unknown,
) {
  const raw = String(value ?? "").trim();
  if (!field || field.type !== "select" || !raw) {
    return safeValue(value);
  }

  const normalizedRaw = normalizeLeadKey(raw);
  const matched = getLeadFieldSelectOptions(field).find(
    (option) =>
      normalizeLeadKey(option.value) === normalizedRaw ||
      normalizeLeadKey(option.label) === normalizedRaw,
  );

  return safeValue(matched?.label ?? raw);
}

export function getLeadFieldSelectValue(
  field: LeadFieldDefinition | null | undefined,
  value: unknown,
) {
  const raw = String(value ?? "").trim();
  if (!field || field.type !== "select" || !raw) {
    return raw;
  }

  const normalizedRaw = normalizeLeadKey(raw);
  const matched = getLeadFieldSelectOptions(field).find(
    (option) =>
      normalizeLeadKey(option.value) === normalizedRaw ||
      normalizeLeadKey(option.label) === normalizedRaw,
  );

  return matched?.value ?? raw;
}

export function normalizeLeadCustomSelectValues(
  custom: Record<string, unknown> | null | undefined,
  fields: LeadFieldDefinition[],
) {
  const next = { ...(custom ?? {}) } as Record<string, unknown>;

  for (const field of fields) {
    if (field.type !== "select") continue;
    if (!(field.key in next)) continue;

    next[field.key] = getLeadFieldSelectValue(field, next[field.key]);
  }

  return next;
}

export function coercePrimaryContactType(
  value: "" | LeadInputContactType,
): LeadInputContactType {
  return value && value.trim() ? value : "other";
}

export function normalizeLeadType(value: string): "" | LeadInputType {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "individual" || normalized === "person") {
    return "individual";
  }
  if (normalized === "business" || normalized === "company") {
    return "business";
  }
  return "";
}

export function normalizeGender(value: string): "" | LeadInputGender {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "male" || normalized === "m") return "male";
  if (normalized === "female" || normalized === "f") return "female";
  return "";
}

export function normalizeContactType(
  value: string,
): "" | LeadInputContactType {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  const map: Record<string, LeadInputContactType> = {
    email: "email",
    e_mail: "email",
    phone: "phone",
    mobile: "phone",
    tel: "phone",
    instagram: "instagram",
    ig: "instagram",
    facebook: "facebook",
    fb: "facebook",
    reddit: "reddit",
    twitter: "twitter_x",
    "twitter/x": "twitter_x",
    twitter_x: "twitter_x",
    x: "twitter_x",
    linkedin: "linkedin",
    li: "linkedin",
    tiktok: "tiktok",
    youtube: "youtube",
    whatsapp: "whatsapp",
    wa: "whatsapp",
    telegram: "telegram",
    tg: "telegram",
    discord: "discord",
  };

  return map[normalized] ?? "other";
}

export function normalizeSourceCategory(
  value: string,
): "" | LeadInputSourceCategory {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  const map: Record<string, LeadInputSourceCategory> = {
    inbound: "inbound",
    outbound: "outbound",
    referral: "referral",
    partner: "partner",
    purchased: "purchased",
    paid: "purchased",
  };

  return map[normalized] ?? "";
}

export function normalizeSourceName(
  value: string,
): "" | LeadInputSourceName {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  const map: Record<string, LeadInputSourceName> = {
    instagram: "instagram",
    ig: "instagram",
    facebook: "facebook",
    fb: "facebook",
    reddit: "reddit",
    twitter: "twitter_x",
    "twitter/x": "twitter_x",
    x: "twitter_x",
    twitter_x: "twitter_x",
    other: "other",
  };

  return map[normalized] ?? "";
}

export function sourceNameFromContactType(
  contactType: "" | LeadInputContactType,
): "" | LeadInputSourceName {
  if (contactType === "instagram") return "instagram";
  if (contactType === "facebook") return "facebook";
  if (contactType === "reddit") return "reddit";
  if (contactType === "twitter_x") return "twitter_x";
  return "";
}
