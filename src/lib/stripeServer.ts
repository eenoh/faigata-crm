import Stripe from "stripe";

function resolveStripeKey(mode: "test" | "live"): string {
  const key =
    mode === "live"
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;

  if (!key) {
    throw new Error(
      `Missing environment variable: STRIPE_SECRET_KEY_${mode.toUpperCase()}`,
    );
  }

  return key;
}

export function getStripe(mode: "test" | "live" = "test") {
  return new Stripe(resolveStripeKey(mode), {
    apiVersion: "2025-12-15.clover", // must match installed Stripe SDK types
  });
}
