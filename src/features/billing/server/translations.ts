import "server-only";

import {
  applyEntityTranslations,
  syncEntityTranslationSources,
} from "@/features/crm/server/custom-value-translations";
import { translateDynamicDisplayValuesBatch } from "@/features/i18n/server/dynamicDisplayTranslation";
import type { AppSupabaseClient } from "@/lib/supabase/types";

type BillingProductTranslationRow = {
  productId: string;
  name: string | null;
  description: string | null;
};

type BillingCustomerTranslationRow = {
  customerId: string;
  name: string | null;
};

type BillingInvoiceLineTranslationRow = {
  lineId: string;
  description: string | null;
};

type BillingActivityRow = {
  id: string;
  payload?: Record<string, unknown> | null;
};

const BILLING_PRODUCT_ENTITY_TABLE = "organization_stripe_products";
const BILLING_CUSTOMER_ENTITY_TABLE = "organization_stripe_customers";
const BILLING_INVOICE_LINE_ENTITY_TABLE = "stripe_invoice_line_items";

export function buildBillingScopedEntityId(livemode: boolean, id: string) {
  return `${livemode ? "live" : "test"}:${id}`;
}

function normalizeId(value: string) {
  return String(value ?? "").trim();
}

function toNullableString(value: string | null | undefined) {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

export async function applyBillingProductTranslations(args: {
  admin: AppSupabaseClient;
  orgId: string;
  livemode: boolean;
  requestedLocale: string;
  rows: BillingProductTranslationRow[];
}) {
  const rows = args.rows.filter((row) => normalizeId(row.productId));
  if (!rows.length) {
    return rows;
  }

  const translationRows = rows.map((row) => ({
    id: buildBillingScopedEntityId(args.livemode, row.productId),
    target: row,
  }));

  await applyEntityTranslations({
    admin: args.admin,
    organizationId: args.orgId,
    entityTable: BILLING_PRODUCT_ENTITY_TABLE,
    rows: translationRows,
    requestedLocale: args.requestedLocale,
    fields: [
      {
        fieldKey: "name",
        sourceText: (row) => toNullableString(row.target.name) ?? "",
        assign: (row, value) => {
          row.target.name = value;
        },
      },
      {
        fieldKey: "description",
        sourceText: (row) => toNullableString(row.target.description) ?? "",
        assign: (row, value) => {
          row.target.description = value;
        },
      },
    ],
  });

  return rows;
}

export async function syncBillingProductTranslationSources(args: {
  admin: AppSupabaseClient;
  orgId: string;
  livemode: boolean;
  rows: BillingProductTranslationRow[];
  sourceLocale?: string | null;
}) {
  const rows = args.rows.filter((row) => normalizeId(row.productId));
  if (!rows.length) {
    return;
  }

  const translationRows = rows.map((row) => ({
    id: buildBillingScopedEntityId(args.livemode, row.productId),
    target: row,
  }));

  await syncEntityTranslationSources({
    admin: args.admin,
    organizationId: args.orgId,
    entityTable: BILLING_PRODUCT_ENTITY_TABLE,
    rows: translationRows,
    sourceLocale: args.sourceLocale,
    fields: [
      {
        fieldKey: "name",
        sourceText: (row) => toNullableString(row.target.name) ?? "",
      },
      {
        fieldKey: "description",
        sourceText: (row) => toNullableString(row.target.description) ?? "",
      },
    ],
  });
}

export async function applyBillingCustomerNameTranslations(args: {
  admin: AppSupabaseClient;
  orgId: string;
  livemode: boolean;
  requestedLocale: string;
  rows: BillingCustomerTranslationRow[];
}) {
  const rows = args.rows.filter((row) => normalizeId(row.customerId));
  if (!rows.length) {
    return rows;
  }

  const translationRows = rows.map((row) => ({
    id: buildBillingScopedEntityId(args.livemode, row.customerId),
    target: row,
  }));

  await applyEntityTranslations({
    admin: args.admin,
    organizationId: args.orgId,
    entityTable: BILLING_CUSTOMER_ENTITY_TABLE,
    rows: translationRows,
    requestedLocale: args.requestedLocale,
    fields: [
      {
        fieldKey: "name",
        sourceText: (row) => toNullableString(row.target.name) ?? "",
        assign: (row, value) => {
          row.target.name = value;
        },
      },
    ],
  });

  return rows;
}

export async function syncBillingCustomerNameTranslationSources(args: {
  admin: AppSupabaseClient;
  orgId: string;
  livemode: boolean;
  rows: BillingCustomerTranslationRow[];
  sourceLocale?: string | null;
}) {
  const rows = args.rows.filter((row) => normalizeId(row.customerId));
  if (!rows.length) {
    return;
  }

  const translationRows = rows.map((row) => ({
    id: buildBillingScopedEntityId(args.livemode, row.customerId),
    target: row,
  }));

  await syncEntityTranslationSources({
    admin: args.admin,
    organizationId: args.orgId,
    entityTable: BILLING_CUSTOMER_ENTITY_TABLE,
    rows: translationRows,
    sourceLocale: args.sourceLocale,
    fields: [
      {
        fieldKey: "name",
        sourceText: (row) => toNullableString(row.target.name) ?? "",
      },
    ],
  });
}

export async function applyBillingInvoiceLineTranslations(args: {
  admin: AppSupabaseClient;
  orgId: string;
  livemode: boolean;
  requestedLocale: string;
  rows: BillingInvoiceLineTranslationRow[];
}) {
  const rows = args.rows.filter((row) => normalizeId(row.lineId));
  if (!rows.length) {
    return rows;
  }

  const translationRows = rows.map((row) => ({
    id: buildBillingScopedEntityId(args.livemode, row.lineId),
    target: row,
  }));

  await applyEntityTranslations({
    admin: args.admin,
    organizationId: args.orgId,
    entityTable: BILLING_INVOICE_LINE_ENTITY_TABLE,
    rows: translationRows,
    requestedLocale: args.requestedLocale,
    fields: [
      {
        fieldKey: "description",
        sourceText: (row) => toNullableString(row.target.description) ?? "",
        assign: (row, value) => {
          row.target.description = value;
        },
      },
    ],
  });

  return rows;
}

export async function applyBillingActivityTranslations(args: {
  requestedLocale: string;
  rows: BillingActivityRow[];
  sourceLocale?: string | null;
}) {
  const rows = args.rows.filter((row) => normalizeId(row.id));
  if (!rows.length) {
    return rows;
  }

  const translated = await translateDynamicDisplayValuesBatch(
    rows.flatMap((row) => [
      {
        cacheKey: `${row.id}:payload_name`,
        fieldKey: "billing_product_label",
        value: row.payload?.name,
        targetLocale: args.requestedLocale,
        sourceLocale: args.sourceLocale,
        sourceLocalePolicy: "allow_unknown_as_source",
      },
      {
        cacheKey: `${row.id}:payload_description`,
        fieldKey: "billing_product_description",
        value: row.payload?.description,
        targetLocale: args.requestedLocale,
        sourceLocale: args.sourceLocale,
        sourceLocalePolicy: "allow_unknown_as_source",
      },
    ]),
  );

  for (const row of rows) {
    if (!row.payload) {
      continue;
    }

    const translatedName = translated.get(`${row.id}:payload_name`);
    if (translatedName !== undefined) {
      row.payload.name = translatedName;
    }

    const translatedDescription = translated.get(`${row.id}:payload_description`);
    if (translatedDescription !== undefined) {
      row.payload.description = translatedDescription;
    }
  }

  return rows;
}
