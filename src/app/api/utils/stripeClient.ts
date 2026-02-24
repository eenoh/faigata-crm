// src/app/api/utils/stripeClient.ts
import Stripe from "stripe";

function getStripeKey(livemode: boolean): string {
  const key = livemode
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;

  if (!key)
    throw new Error(
      `Missing Stripe secret key for mode: ${livemode ? "live" : "test"}`,
    );
  return key;
}

export function stripeClient(livemode: boolean) {
  return new Stripe(getStripeKey(livemode), {
    apiVersion: "2025-12-15.clover",
  });
}
