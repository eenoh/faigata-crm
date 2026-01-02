// src/app/api/utils/stripeClient.ts
import Stripe from "stripe";

export function stripeClient(livemode: boolean) {
  const key = livemode
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : process.env.STRIPE_SECRET_KEY_TEST;

  if (!key) throw new Error("Missing Stripe secret key for mode: " + (livemode ? "live" : "test"));
  return new Stripe(key);
}
