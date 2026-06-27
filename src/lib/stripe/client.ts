import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env/server";
import type { StripeMode } from "@/lib/stripe/types";

const stripeCache = new Map<StripeMode, Stripe>();

function createStripeClient(mode: StripeMode) {
  return new Stripe(serverEnv.stripe.secretKey(mode), {
    apiVersion: "2025-12-15.clover",
  });
}

export function getStripeClient(mode: StripeMode = "test") {
  const existing = stripeCache.get(mode);
  if (existing) return existing;

  const client = createStripeClient(mode);
  stripeCache.set(mode, client);
  return client;
}

export function getStripeClientForLivemode(livemode: boolean) {
  return getStripeClient(livemode ? "live" : "test");
}
