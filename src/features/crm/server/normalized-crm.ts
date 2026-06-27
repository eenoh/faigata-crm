import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { LeadScoringConfig, ScoringRule } from "@/features/crm/scoring/types";
import type { CustomFieldType, LeadFieldDefinition } from "@/features/crm/types/lead";

export const NORMALIZED_LEAD_SELECT_COLUMNS = `
id, team_id,
stage_id,
lead_name,
niche_id,
lead_type, gender,
country, region, city, postal_code,
source_id,
prospector_id, setter_id, closer_id, notes,
score, score_updated_at, rejected_count,
created_at, updated_at
` as const;

type LeadBaseRow = {
  id: string;
  team_id: string;
  stage_id?: string | null;
  lead_name?: string | null;
  niche_id?: string | null;
  lead_type?: string | null;
  gender?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  postal_code?: string | null;
  source_id?: string | null;
  prospector_id?: string | null;
  setter_id?: string | null;
  closer_id?: string | null;
  notes?: string | null;
  score?: number | null;
  score_updated_at?: string | null;
  rejected_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeadFieldRow = {
  id: string;
  key: string;
  label?: string | null;
  type: CustomFieldType;
  team_id?: string;
  position?: number | null;
};

type LeadFieldOptionRow = {
  id: string;
  field_id: string;
  option_value: string;
  option_label?: string | null;
  position?: number | null;
};

type LeadContactRow = {
  id?: string;
  lead_id: string;
  contact_type_id: string;
  contact_value: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
};

type LeadContactTypeRow = {
  id: string;
  code: string;
  label?: string | null;
};

type LeadSourceRow = {
  id: string;
  category_id: string;
  name: string;
};

type LeadSourceCategoryRow = {
  id: string;
  name: string;
};

type LeadFieldValueRow = {
  lead_id: string;
  field_id: string;
  value_text?: string | null;
  value_number?: number | string | null;
  value_boolean?: boolean | null;
  value_link?: string | null;
};

type LeadFieldValueOptionRow = {
  lead_id: string;
  field_id: string;
  option_id: string;
};

type BookingLinkWorkDayRow = {
  booking_link_id: string;
  weekday: number | string;
};

type ScoringThresholdRow = {
  team_id: string;
  low_threshold: number | string;
  high_threshold: number | string;
};

type ScoringRuleRow = {
  id: string;
  team_id: string;
  field_key: string;
  label: string;
  weight: number | string;
  position: number | string;
};

type ScoringRuleOptionWeightRow = {
  rule_id: string;
  option_value: string;
  weight: number | string;
  position: number | string;
};

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    if (value == null) return null;
    const asString = String(value).trim();
    return asString.length ? asString : null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function normalizeWeekday(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : null;
}

function keyForLeadField(leadId: string, fieldId: string) {
  return `${leadId}::${fieldId}`;
}

async function ensureLeadSourceCategoryId(
  admin: AppSupabaseClient,
  name: string,
) {
  const normalized = normalizeNullableString(name);
  if (!normalized) return null;

  const { data, error } = await admin
    .from("lead_source_categories")
    .upsert({ name: normalized }, { onConflict: "name" })
    .select("id")
    .single();

  if (error) throw error;
  return String((data as any)?.id ?? "").trim() || null;
}

async function ensureLeadContactTypeId(
  admin: AppSupabaseClient,
  code: string,
) {
  const normalizedCode = normalizeNullableString(code)?.toLowerCase() ?? null;
  if (!normalizedCode) return null;

  const label = normalizedCode
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const { data, error } = await admin
    .from("lead_contact_types")
    .upsert(
      {
        code: normalizedCode,
        label,
      },
      { onConflict: "code" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return String((data as any)?.id ?? "").trim() || null;
}

async function ensureLeadFieldOptionId(
  admin: AppSupabaseClient,
  fieldId: string,
  optionValue: string,
  position = 9999,
) {
  const normalizedValue = normalizeNullableString(optionValue);
  if (!normalizedValue) return null;

  const { data, error } = await admin
    .from("lead_field_options")
    .upsert(
      {
        field_id: fieldId,
        option_value: normalizedValue,
        option_label: normalizedValue,
        position,
      },
      { onConflict: "field_id,option_value" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return String((data as any)?.id ?? "").trim() || null;
}

export async function ensureLeadSourceId(args: {
  admin: AppSupabaseClient;
  teamId: string;
  sourceCategory: unknown;
  sourceName: unknown;
}) {
  const { admin, teamId, sourceCategory, sourceName } = args;
  const categoryName = normalizeNullableString(sourceCategory);
  const name = normalizeNullableString(sourceName);

  if (!categoryName || !name) return null;

  const categoryId = await ensureLeadSourceCategoryId(admin, categoryName);
  if (!categoryId) return null;

  const { data, error } = await admin
    .from("lead_sources")
    .upsert(
      {
        team_id: teamId,
        category_id: categoryId,
        name,
      },
      { onConflict: "team_id,category_id,name" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return String((data as any)?.id ?? "").trim() || null;
}

export async function replacePrimaryLeadContact(args: {
  admin: AppSupabaseClient;
  leadId: string;
  contactTypeCode: unknown;
  contactValue: unknown;
}) {
  const { admin, leadId, contactTypeCode, contactValue } = args;
  const normalizedValue = normalizeNullableString(contactValue);
  const normalizedCode =
    normalizeNullableString(contactTypeCode)?.toLowerCase() ?? null;

  const { error: deleteError } = await admin
    .from("lead_contacts")
    .delete()
    .eq("lead_id", leadId);

  if (deleteError) throw deleteError;

  if (!normalizedCode || !normalizedValue) {
    return;
  }

  const contactTypeId = await ensureLeadContactTypeId(admin, normalizedCode);
  if (!contactTypeId) return;

  const { error: insertError } = await admin.from("lead_contacts").insert({
    lead_id: leadId,
    contact_type_id: contactTypeId,
    contact_value: normalizedValue,
    is_primary: true,
  } as any);

  if (insertError) throw insertError;
}

export async function getNormalizedLeadFieldDefinitions(
  admin: AppSupabaseClient,
  teamId: string,
): Promise<LeadFieldDefinition[]> {
  const { data: fieldsRaw, error: fieldsError } = await admin
    .from("lead_fields")
    .select("id, team_id, key, label, type, position")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (fieldsError) throw fieldsError;

  const fields = (Array.isArray(fieldsRaw) ? fieldsRaw : []) as LeadFieldRow[];
  const fieldIds = fields.map((field) => String(field.id)).filter(Boolean);

  const optionMap = new Map<string, string[]>();
  if (fieldIds.length > 0) {
    const { data: optionsRaw, error: optionsError } = await admin
      .from("lead_field_options")
      .select("id, field_id, option_value, position")
      .in("field_id", fieldIds)
      .order("position", { ascending: true });

    if (optionsError) throw optionsError;

    for (const option of (Array.isArray(optionsRaw)
      ? optionsRaw
      : []) as LeadFieldOptionRow[]) {
      const fieldId = String(option.field_id ?? "").trim();
      if (!fieldId) continue;
      const list = optionMap.get(fieldId) ?? [];
      list.push(String(option.option_value ?? ""));
      optionMap.set(fieldId, list);
    }
  }

  return fields.map((field) => ({
    id: String(field.id),
    team_id: String(field.team_id ?? teamId),
    key: String(field.key ?? ""),
    label: String(field.label ?? ""),
    type: field.type,
    options:
      field.type === "select" ? (optionMap.get(String(field.id)) ?? []) : [],
    position:
      typeof field.position === "number"
        ? field.position
        : normalizeNumber(field.position) ?? undefined,
  }));
}

export async function replaceLeadFieldOptions(args: {
  admin: AppSupabaseClient;
  fieldId: string;
  options: string[];
}) {
  const { admin, fieldId, options } = args;
  const normalizedOptions = Array.from(
    new Set(
      options
        .map((option) => normalizeNullableString(option))
        .filter((option): option is string => Boolean(option)),
    ),
  );

  const { error: deleteError } = await admin
    .from("lead_field_options")
    .delete()
    .eq("field_id", fieldId);

  if (deleteError) throw deleteError;

  if (!normalizedOptions.length) return;

  const { error: insertError } = await admin.from("lead_field_options").insert(
    normalizedOptions.map((option, index) => ({
      field_id: fieldId,
      option_value: option,
      option_label: option,
      position: index,
    })) as any,
  );

  if (insertError) throw insertError;
}

export async function replaceLeadCustomValues(args: {
  admin: AppSupabaseClient;
  teamId: string;
  leadId: string;
  values: Record<string, unknown>;
}) {
  const { admin, teamId, leadId, values } = args;

  const { error: deleteOptionError } = await admin
    .from("lead_field_value_options")
    .delete()
    .eq("lead_id", leadId);

  if (deleteOptionError) throw deleteOptionError;

  const { error: deleteValueError } = await admin
    .from("lead_field_values")
    .delete()
    .eq("lead_id", leadId);

  if (deleteValueError) throw deleteValueError;

  const fieldDefs = await getNormalizedLeadFieldDefinitions(admin, teamId);
  const fieldByKey = new Map(fieldDefs.map((field) => [field.key, field]));

  const scalarRows: Array<Record<string, unknown>> = [];
  const optionRows: Array<{ lead_id: string; field_id: string; option_id: string }> = [];

  for (const [fieldKey, rawValue] of Object.entries(values ?? {})) {
    const field = fieldByKey.get(fieldKey);
    if (!field) continue;

    if (field.type === "select") {
      const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const [index, value] of rawValues.entries()) {
        const optionText = normalizeNullableString(value);
        if (!optionText) continue;
        const optionId = await ensureLeadFieldOptionId(
          admin,
          field.id,
          optionText,
          index,
        );
        if (!optionId) continue;
        optionRows.push({
          lead_id: leadId,
          field_id: field.id,
          option_id: optionId,
        });
      }
      continue;
    }

    const scalarBase = {
      lead_id: leadId,
      field_id: field.id,
      updated_at: new Date().toISOString(),
    };

    if (field.type === "number") {
      const valueNumber = normalizeNumber(rawValue);
      if (valueNumber == null) continue;
      scalarRows.push({
        ...scalarBase,
        value_number: valueNumber,
      });
      continue;
    }

    if (field.type === "boolean") {
      const valueBoolean = normalizeBoolean(rawValue);
      if (valueBoolean == null) continue;
      scalarRows.push({
        ...scalarBase,
        value_boolean: valueBoolean,
      });
      continue;
    }

    const textValue = normalizeNullableString(rawValue);
    if (!textValue) continue;

    scalarRows.push({
      ...scalarBase,
      ...(field.type === "link"
        ? { value_link: textValue }
        : { value_text: textValue }),
    });
  }

  if (scalarRows.length > 0) {
    const { error: insertScalarError } = await admin
      .from("lead_field_values")
      .insert(scalarRows as any);

    if (insertScalarError) throw insertScalarError;
  }

  if (optionRows.length > 0) {
    const { error: insertOptionError } = await admin
      .from("lead_field_value_options")
      .insert(optionRows as any);

    if (insertOptionError) throw insertOptionError;
  }
}

export async function hydrateLeadRows<T extends LeadBaseRow>(args: {
  admin: AppSupabaseClient;
  teamId: string;
  rows: T[];
}) {
  const { admin, teamId, rows } = args;

  if (!rows.length) {
    return rows.map((row) => ({
      ...row,
      stage: null,
      niche: null,
      primary_contact_type: null,
      primary_contact_value: null,
      source_category: null,
      source_name: null,
      custom_values: null,
    }));
  }

  const leadIds = rows.map((row) => String(row.id ?? "")).filter(Boolean);
  const stageIds = Array.from(
    new Set(
      rows
        .map((row) => normalizeNullableString(row.stage_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const nicheIds = Array.from(
    new Set(
      rows
        .map((row) => normalizeNullableString(row.niche_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sourceIds = Array.from(
    new Set(
      rows
        .map((row) => normalizeNullableString(row.source_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const stageNameById = new Map<string, string>();
  const nicheNameById = new Map<string, string>();
  const contactTypeById = new Map<string, string>();
  const primaryContactByLeadId = new Map<
    string,
    { type: string | null; value: string | null }
  >();
  const sourceById = new Map<string, LeadSourceRow>();
  const categoryNameById = new Map<string, string>();
  const fieldById = new Map<string, LeadFieldDefinition>();
  const optionValueById = new Map<string, string>();
  const customValuesByLeadId = new Map<string, Record<string, unknown>>();

  if (stageIds.length > 0) {
    const { data: stageRows, error } = await admin
      .from("pipeline_stages")
      .select("id, name")
      .eq("team_id", teamId)
      .in("id", stageIds);

    if (error) throw error;

    for (const stage of Array.isArray(stageRows) ? stageRows : []) {
      const id = String((stage as any)?.id ?? "").trim();
      if (!id) continue;
      stageNameById.set(id, String((stage as any)?.name ?? ""));
    }
  }

  if (nicheIds.length > 0) {
    const { data: nicheRows, error } = await admin
      .from("niches")
      .select("id, name")
      .in("id", nicheIds);

    if (error) throw error;

    for (const niche of Array.isArray(nicheRows) ? nicheRows : []) {
      const id = String((niche as any)?.id ?? "").trim();
      if (!id) continue;
      nicheNameById.set(id, String((niche as any)?.name ?? ""));
    }
  }

  if (leadIds.length > 0) {
    const { data: contactRows, error: contactError } = await admin
      .from("lead_contacts")
      .select("lead_id, contact_type_id, contact_value, is_primary, created_at")
      .in("lead_id", leadIds);

    if (contactError) throw contactError;

    const contacts = (Array.isArray(contactRows)
      ? contactRows
      : []) as LeadContactRow[];
    const contactTypeIds = Array.from(
      new Set(
        contacts
          .map((row) => normalizeNullableString(row.contact_type_id))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (contactTypeIds.length > 0) {
      const { data: contactTypeRows, error: contactTypeError } = await admin
        .from("lead_contact_types")
        .select("id, code")
        .in("id", contactTypeIds);

      if (contactTypeError) throw contactTypeError;

      for (const row of (Array.isArray(contactTypeRows)
        ? contactTypeRows
        : []) as LeadContactTypeRow[]) {
        contactTypeById.set(String(row.id), String(row.code));
      }
    }

    const sortedContacts = contacts.sort((left, right) => {
      const leftPrimary = left.is_primary ? 0 : 1;
      const rightPrimary = right.is_primary ? 0 : 1;
      if (leftPrimary !== rightPrimary) return leftPrimary - rightPrimary;
      return String(left.created_at ?? "").localeCompare(
        String(right.created_at ?? ""),
      );
    });

    for (const contact of sortedContacts) {
      const leadId = String(contact.lead_id ?? "").trim();
      if (!leadId || primaryContactByLeadId.has(leadId)) continue;
      primaryContactByLeadId.set(leadId, {
        type:
          contactTypeById.get(String(contact.contact_type_id ?? "").trim()) ??
          null,
        value: normalizeNullableString(contact.contact_value),
      });
    }
  }

  if (sourceIds.length > 0) {
    const { data: sourceRows, error: sourceError } = await admin
      .from("lead_sources")
      .select("id, category_id, name")
      .in("id", sourceIds);

    if (sourceError) throw sourceError;

    const sources = (Array.isArray(sourceRows)
      ? sourceRows
      : []) as LeadSourceRow[];
    const categoryIds = Array.from(
      new Set(
        sources
          .map((row) => normalizeNullableString(row.category_id))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    for (const source of sources) {
      sourceById.set(String(source.id), source);
    }

    if (categoryIds.length > 0) {
      const { data: categoryRows, error: categoryError } = await admin
        .from("lead_source_categories")
        .select("id, name")
        .in("id", categoryIds);

      if (categoryError) throw categoryError;

      for (const category of (Array.isArray(categoryRows)
        ? categoryRows
        : []) as LeadSourceCategoryRow[]) {
        categoryNameById.set(String(category.id), String(category.name));
      }
    }
  }

  if (leadIds.length > 0) {
    const fieldDefs = await getNormalizedLeadFieldDefinitions(admin, teamId);
    for (const field of fieldDefs) {
      fieldById.set(field.id, field);
    }

    const { data: scalarValueRows, error: scalarValueError } = await admin
      .from("lead_field_values")
      .select(
        "lead_id, field_id, value_text, value_number, value_boolean, value_link",
      )
      .in("lead_id", leadIds);

    if (scalarValueError) throw scalarValueError;

    for (const row of (Array.isArray(scalarValueRows)
      ? scalarValueRows
      : []) as LeadFieldValueRow[]) {
      const field = fieldById.get(String(row.field_id ?? ""));
      if (!field) continue;

      const leadId = String(row.lead_id ?? "").trim();
      if (!leadId) continue;

      const customValues = customValuesByLeadId.get(leadId) ?? {};
      let nextValue: unknown = null;

      if (row.value_boolean != null) nextValue = !!row.value_boolean;
      else if (row.value_number != null) nextValue = Number(row.value_number);
      else if (row.value_link != null) nextValue = row.value_link;
      else nextValue = row.value_text ?? null;

      if (nextValue != null) {
        customValues[field.key] = nextValue;
        customValuesByLeadId.set(leadId, customValues);
      }
    }

    const { data: optionRows, error: optionRowsError } = await admin
      .from("lead_field_value_options")
      .select("lead_id, field_id, option_id")
      .in("lead_id", leadIds);

    if (optionRowsError) throw optionRowsError;

    const optionIds = Array.from(
      new Set(
        ((Array.isArray(optionRows) ? optionRows : []) as LeadFieldValueOptionRow[])
          .map((row) => normalizeNullableString(row.option_id))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (optionIds.length > 0) {
      const { data: leadFieldOptionRows, error: leadFieldOptionError } = await admin
        .from("lead_field_options")
        .select("id, field_id, option_value")
        .in("id", optionIds);

      if (leadFieldOptionError) throw leadFieldOptionError;

      for (const option of (Array.isArray(leadFieldOptionRows)
        ? leadFieldOptionRows
        : []) as LeadFieldOptionRow[]) {
        optionValueById.set(String(option.id), String(option.option_value ?? ""));
      }
    }

    const optionGroups = new Map<string, string[]>();
    for (const row of (Array.isArray(optionRows)
      ? optionRows
      : []) as LeadFieldValueOptionRow[]) {
      const field = fieldById.get(String(row.field_id ?? ""));
      const optionValue = optionValueById.get(String(row.option_id ?? "").trim());
      const leadId = String(row.lead_id ?? "").trim();

      if (!field || !optionValue || !leadId) continue;

      const compositeKey = keyForLeadField(leadId, field.id);
      const values = optionGroups.get(compositeKey) ?? [];
      values.push(optionValue);
      optionGroups.set(compositeKey, values);
    }

    for (const [compositeKey, optionValues] of optionGroups.entries()) {
      const [leadId, fieldId] = compositeKey.split("::");
      const field = fieldById.get(fieldId);
      if (!field || !leadId) continue;
      const customValues = customValuesByLeadId.get(leadId) ?? {};
      customValues[field.key] =
        optionValues.length <= 1 ? (optionValues[0] ?? null) : optionValues;
      customValuesByLeadId.set(leadId, customValues);
    }
  }

  return rows.map((row) => {
    const stageId = normalizeNullableString(row.stage_id);
    const nicheId = normalizeNullableString(row.niche_id);
    const sourceId = normalizeNullableString(row.source_id);
    const primaryContact = primaryContactByLeadId.get(String(row.id)) ?? null;
    const source = sourceId ? sourceById.get(sourceId) ?? null : null;
    const customValues = customValuesByLeadId.get(String(row.id)) ?? null;

    return {
      ...row,
      stage: stageId ? (stageNameById.get(stageId) ?? null) : null,
      niche: nicheId ? (nicheNameById.get(nicheId) ?? null) : null,
      primary_contact_type: primaryContact?.type ?? null,
      primary_contact_value: primaryContact?.value ?? null,
      source_category: source
        ? (categoryNameById.get(String(source.category_id)) ?? null)
        : null,
      source_name: source ? String(source.name ?? "") : null,
      custom_values:
        customValues && Object.keys(customValues).length > 0 ? customValues : null,
    };
  });
}

export async function loadLeadScoringConfig(
  admin: AppSupabaseClient,
  teamId: string,
): Promise<LeadScoringConfig | null> {
  const { data: thresholdRow, error: thresholdError } = await admin
    .from("lead_scoring_thresholds")
    .select("team_id, low_threshold, high_threshold")
    .eq("team_id", teamId)
    .maybeSingle();

  if (thresholdError && String((thresholdError as any)?.code ?? "") !== "PGRST116") {
    throw thresholdError;
  }

  const { data: ruleRowsRaw, error: ruleError } = await admin
    .from("lead_scoring_rules")
    .select("id, team_id, field_key, label, weight, position")
    .eq("team_id", teamId)
    .order("position", { ascending: true });

  if (ruleError) throw ruleError;

  const ruleRows = (Array.isArray(ruleRowsRaw)
    ? ruleRowsRaw
    : []) as ScoringRuleRow[];
  const ruleIds = ruleRows.map((row) => String(row.id)).filter(Boolean);

  const optionWeightRowsByRuleId = new Map<string, ScoringRuleOptionWeightRow[]>();
  if (ruleIds.length > 0) {
    const { data: optionWeightRowsRaw, error: optionWeightError } = await admin
      .from("lead_scoring_rule_option_weights")
      .select("rule_id, option_value, weight, position")
      .in("rule_id", ruleIds)
      .order("position", { ascending: true });

    if (optionWeightError) throw optionWeightError;

    for (const row of (Array.isArray(optionWeightRowsRaw)
      ? optionWeightRowsRaw
      : []) as ScoringRuleOptionWeightRow[]) {
      const ruleId = String(row.rule_id ?? "").trim();
      if (!ruleId) continue;
      const list = optionWeightRowsByRuleId.get(ruleId) ?? [];
      list.push(row);
      optionWeightRowsByRuleId.set(ruleId, list);
    }
  }

  if (!thresholdRow && ruleRows.length === 0) {
    return null;
  }

  const rules: ScoringRule[] = ruleRows.map((row) => {
    const optionWeightRows = optionWeightRowsByRuleId.get(String(row.id)) ?? [];
    const optionWeights =
      optionWeightRows.length > 0
        ? Object.fromEntries(
            optionWeightRows.map((weightRow) => [
              String(weightRow.option_value ?? ""),
              Number(weightRow.weight ?? 0),
            ]),
          )
        : undefined;

    return {
      fieldKey: String(row.field_key ?? ""),
      label: String(row.label ?? ""),
      weight: Number(row.weight ?? 0),
      ...(optionWeights ? { optionWeights } : {}),
    };
  });

  return {
    rules,
    thresholds: {
      low: Number((thresholdRow as ScoringThresholdRow | null)?.low_threshold ?? 40),
      high: Number(
        (thresholdRow as ScoringThresholdRow | null)?.high_threshold ?? 70,
      ),
    },
  };
}

export async function saveLeadScoringConfig(args: {
  admin: AppSupabaseClient;
  teamId: string;
  config: LeadScoringConfig;
}) {
  const { admin, teamId, config } = args;
  const nowIso = new Date().toISOString();

  const { error: thresholdError } = await admin
    .from("lead_scoring_thresholds")
    .upsert(
      {
        team_id: teamId,
        low_threshold: config.thresholds.low,
        high_threshold: config.thresholds.high,
        updated_at: nowIso,
      },
      { onConflict: "team_id" },
    );

  if (thresholdError) throw thresholdError;

  const { data: existingRulesRaw, error: existingRulesError } = await admin
    .from("lead_scoring_rules")
    .select("id")
    .eq("team_id", teamId);

  if (existingRulesError) throw existingRulesError;

  const existingRuleIds = (Array.isArray(existingRulesRaw) ? existingRulesRaw : [])
    .map((row: any) => String(row?.id ?? "").trim())
    .filter(Boolean);

  if (existingRuleIds.length > 0) {
    const { error: deleteWeightsError } = await admin
      .from("lead_scoring_rule_option_weights")
      .delete()
      .in("rule_id", existingRuleIds);

    if (deleteWeightsError) throw deleteWeightsError;
  }

  const { error: deleteRulesError } = await admin
    .from("lead_scoring_rules")
    .delete()
    .eq("team_id", teamId);

  if (deleteRulesError) throw deleteRulesError;

  if (!config.rules.length) return;

  const { data: insertedRulesRaw, error: insertRulesError } = await admin
    .from("lead_scoring_rules")
    .insert(
      config.rules.map((rule, index) => ({
        team_id: teamId,
        field_key: rule.fieldKey,
        label: rule.label,
        weight: rule.weight,
        position: index,
        updated_at: nowIso,
      })) as any,
    )
    .select("id, position");

  if (insertRulesError) throw insertRulesError;

  const insertedRules = Array.isArray(insertedRulesRaw) ? insertedRulesRaw : [];
  const ruleIdByPosition = new Map<string, string>();
  for (const row of insertedRules) {
    ruleIdByPosition.set(
      String((row as any)?.position ?? ""),
      String((row as any)?.id ?? ""),
    );
  }

  const optionWeightRows: Array<Record<string, unknown>> = [];
  config.rules.forEach((rule, ruleIndex) => {
    const ruleId = ruleIdByPosition.get(String(ruleIndex));
    if (!ruleId || !rule.optionWeights) return;
    Object.entries(rule.optionWeights).forEach(([optionValue, weight], optionIndex) => {
      optionWeightRows.push({
        rule_id: ruleId,
        option_value: optionValue,
        weight,
        position: optionIndex,
      });
    });
  });

  if (optionWeightRows.length > 0) {
    const { error: insertOptionWeightsError } = await admin
      .from("lead_scoring_rule_option_weights")
      .insert(optionWeightRows as any);

    if (insertOptionWeightsError) throw insertOptionWeightsError;
  }
}

export async function attachBookingLinkWorkDays<T extends { id: string }>(args: {
  admin: AppSupabaseClient;
  rows: T[];
}) {
  const { admin, rows } = args;
  if (!rows.length) {
    return rows.map((row) => ({ ...row, work_days: [] as number[] }));
  }

  const linkIds = rows.map((row) => String(row.id ?? "")).filter(Boolean);
  const { data, error } = await admin
    .from("booking_link_work_days")
    .select("booking_link_id, weekday")
    .in("booking_link_id", linkIds)
    .order("weekday", { ascending: true });

  if (error) throw error;

  const weekdaysByLinkId = new Map<string, number[]>();
  for (const row of (Array.isArray(data) ? data : []) as BookingLinkWorkDayRow[]) {
    const linkId = String(row.booking_link_id ?? "").trim();
    const weekday = normalizeWeekday(row.weekday);
    if (!linkId || weekday == null) continue;
    const list = weekdaysByLinkId.get(linkId) ?? [];
    list.push(weekday);
    weekdaysByLinkId.set(linkId, list);
  }

  return rows.map((row) => ({
    ...row,
    work_days: weekdaysByLinkId.get(String(row.id)) ?? [],
  }));
}

export async function replaceBookingLinkWorkDays(args: {
  admin: AppSupabaseClient;
  bookingLinkId: string;
  weekdays: unknown[];
}) {
  const { admin, bookingLinkId, weekdays } = args;
  const normalizedWeekdays = Array.from(
    new Set(
      weekdays
        .map((weekday) => normalizeWeekday(weekday))
        .filter((weekday): weekday is number => weekday != null),
    ),
  ).sort((left, right) => left - right);

  const { error: deleteError } = await admin
    .from("booking_link_work_days")
    .delete()
    .eq("booking_link_id", bookingLinkId);

  if (deleteError) throw deleteError;

  if (!normalizedWeekdays.length) return;

  const { error: insertError } = await admin
    .from("booking_link_work_days")
    .insert(
      normalizedWeekdays.map((weekday) => ({
        booking_link_id: bookingLinkId,
        weekday,
      })) as any,
    );

  if (insertError) throw insertError;
}
