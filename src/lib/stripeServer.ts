import Stripe from "stripe";

export function getStripe(mode: "test" | "live" = "test") {
  const key =
    mode === "live"
      ? process.env.STRIPE_SECRET_KEY_LIVE
      : process.env.STRIPE_SECRET_KEY_TEST;

  if (!key) throw new Error(`Missing STRIPE_SECRET_KEY_${mode.toUpperCase()}`);

  return new Stripe(key);
}
