import { getStripeClient } from "@/lib/stripe/client";
import type { StripeMode } from "@/lib/stripe/types";

export function getStripe(mode: StripeMode = "test") {
  return getStripeClient(mode);
}
