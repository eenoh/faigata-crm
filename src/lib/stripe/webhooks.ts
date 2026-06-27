import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env/server";
import type { StripeMode } from "@/lib/stripe/types";

export async function readStripeRawBody(request: Request) {
  return Buffer.from(await request.arrayBuffer());
}

export function verifyStripeWebhook(
  payload: Buffer,
  signature: string,
  secret: string,
  _mode: StripeMode,
): Stripe.Event {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

export function verifyPlatformStripeWebhook(
  payload: Buffer,
  signature: string,
): Stripe.Event {
  const secrets = serverEnv.stripe.platformWebhookSecrets();
  let lastError: unknown = null;

  if (!secrets.length) {
    throw new Error("missing_platform_webhook_secret");
  }

  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("invalid_platform_webhook_signature");
}
