export type BillingApiErrorPayload = {
  error?: string;
  reason?: string;
  hint?: string;
  detail?: string;
  details?: unknown;
  message?: string;
};

export const BILLING_SESSION_EXPIRED_MESSAGE =
  "Your session expired. Please sign in again and try again.";

const DEFAULT_BILLING_ERROR_MESSAGE =
  "We couldn't complete that billing request. Please try again.";

const BILLING_ERROR_CODE_MESSAGES: Record<string, string> = {
  no_session: BILLING_SESSION_EXPIRED_MESSAGE,
  missing_token: BILLING_SESSION_EXPIRED_MESSAGE,
  invalid_session: BILLING_SESSION_EXPIRED_MESSAGE,
  missing_auth: BILLING_SESSION_EXPIRED_MESSAGE,
  unauthorized:
    "You don't have permission to view billing data for this workspace.",
  forbidden:
    "You don't have permission to manage billing for this workspace.",
  missing_org:
    "We couldn't find the billing workspace for this account. Please refresh and try again.",
  missing_org_id:
    "We couldn't find the billing workspace for this account. Please refresh and try again.",
  missing_stripe_account_id:
    "Stripe isn't connected for this workspace yet. Reconnect Stripe and try again.",
  billing_context_failed:
    "We couldn't load your billing workspace right now. Please refresh and try again.",
  invalid_stripe_account_id:
    "The connected Stripe account looks incomplete. Please reconnect Stripe and try again.",
  db_query_failed:
    "We couldn't load your billing data right now. Please try again.",
  db_error:
    "We couldn't load that billing record right now. Please try again.",
  db_update_failed:
    "We couldn't save that billing change. Please try again.",
  db_delete_failed:
    "We couldn't remove that billing connection right now. Please try again.",
  db_upsert_products_failed:
    "We couldn't save the latest product updates from Stripe. Please try syncing again.",
  db_upsert_prices_failed:
    "We couldn't save the latest price updates from Stripe. Please try syncing again.",
  stripe_list_failed:
    "We couldn't load data from Stripe right now. Please try again in a moment.",
  stripe_create_failed:
    "Stripe couldn't create that item right now. Please try again.",
  stripe_update_failed:
    "Stripe couldn't save that change right now. Please try again.",
  stripe_error:
    "Stripe couldn't complete that request right now. Please try again.",
  refund_failed:
    "We couldn't start the refund. Please try again.",
  missing_charge:
    "This payment can't be refunded because no successful charge was found.",
  invalid_customerId:
    "Please choose a valid customer before creating the invoice.",
  invalid_invoiceId:
    "That invoice link is invalid or incomplete. Please reopen the invoice and try again.",
  invalid_payment_intent_id:
    "That payment link is invalid or incomplete. Please reopen the payment and try again.",
  missing_invoiceId:
    "The invoice ID is missing. Please reopen the invoice and try again.",
  missing_invoice_id:
    "We created the invoice, but couldn't read its ID from the response. Please refresh your invoice list and try again.",
  missing_product_id:
    "The product ID is missing from this page. Please reopen the product and try again.",
  missing_productId:
    "The product ID is missing from this page. Please reopen the product and try again.",
  missing_price_id:
    "The price ID is missing. Please reopen the price and try again.",
  missing_priceId:
    "Please choose a Stripe price before continuing.",
  invalid_price_id:
    "That price link is invalid or incomplete. Please reopen the price and try again.",
  missing_currency: "Please choose a currency before continuing.",
  invalid_amount: "Enter a valid amount greater than 0.",
  invalid_amount_cents: "Enter a valid amount in cents greater than 0.",
  catalog_sync_failed:
    "We couldn't sync your Stripe catalog right now. Please try again.",
  customer_mapping_save_failed:
    "The customer was created, but we couldn't finish linking it to the lead.",
  customer_mapping_clear_failed:
    "We couldn't remove the lead link from that customer. Please try again.",
  missing_stripe_customer_id:
    "The Stripe customer ID is missing. Please reopen the customer and try again.",
  missing_lead_id: "Please choose a lead before linking this customer.",
  missing_leadId: "Please choose a lead before creating a customer from it.",
  not_found:
    "We couldn't find that record anymore. Please refresh the page and try again.",
};

function looksLikeErrorCode(value: string) {
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/i.test(value);
}

function statusFallback(status: number, fallback: string) {
  if (status === 400) {
    return "Some details are missing or invalid. Please review your changes and try again.";
  }

  if (status === 401) {
    return BILLING_SESSION_EXPIRED_MESSAGE;
  }

  if (status === 403) {
    return "You don't have permission to do that in this workspace.";
  }

  if (status === 404) {
    return "We couldn't find that record anymore. Please refresh the page and try again.";
  }

  if (status === 409) {
    return "That action couldn't be completed because the record changed. Please refresh and try again.";
  }

  if (status === 429) {
    return "Too many billing requests were sent at once. Please wait a moment and try again.";
  }

  if (status >= 500) {
    return "We couldn't reach Stripe right now. Please try again in a moment.";
  }

  return fallback;
}

function resolveErrorText(value: string | undefined, fallback: string) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) return "";
  if (BILLING_ERROR_CODE_MESSAGES[trimmed]) {
    return BILLING_ERROR_CODE_MESSAGES[trimmed];
  }

  const statusMatch = trimmed.match(/(?:^|_)(\d{3})$/);
  if (statusMatch) {
    return statusFallback(Number(statusMatch[1]), fallback);
  }

  if (looksLikeErrorCode(trimmed)) {
    return fallback;
  }

  return trimmed;
}

async function parseBillingErrorResponse(
  res: Response,
): Promise<BillingApiErrorPayload> {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  try {
    if (contentType.includes("application/json")) {
      return (await res.json()) as BillingApiErrorPayload;
    }

    const text = await res.text();
    return { error: text.trim() || `failed_${res.status}` };
  } catch {
    return { error: `failed_${res.status}` };
  }
}

export function getBillingErrorMessage(
  error: BillingApiErrorPayload | string | null | undefined,
  fallback = DEFAULT_BILLING_ERROR_MESSAGE,
) {
  if (typeof error === "string") {
    return resolveErrorText(error, fallback) || fallback;
  }

  const fromMessage = resolveErrorText(error?.message, "");
  if (fromMessage) return fromMessage;

  const fromError = resolveErrorText(error?.error, fallback);
  if (fromError) return fromError;

  return fallback;
}

export async function readBillingApiError(
  res: Response,
  fallback = DEFAULT_BILLING_ERROR_MESSAGE,
): Promise<BillingApiErrorPayload> {
  const parsed = await parseBillingErrorResponse(res);
  const hint = resolveErrorText(parsed.hint, "");

  return {
    error: getBillingErrorMessage(parsed, fallback),
    hint: hint || undefined,
    details: parsed.details,
    message: getBillingErrorMessage(parsed, fallback),
  };
}

export async function readBillingApiErrorMessage(
  res: Response,
  fallback = DEFAULT_BILLING_ERROR_MESSAGE,
) {
  const parsed = await parseBillingErrorResponse(res);
  return getBillingErrorMessage(parsed, fallback);
}
