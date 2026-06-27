import { getStripeClientForLivemode } from "@/lib/stripe/client";

export function stripeClient(livemode: boolean) {
  return getStripeClientForLivemode(livemode);
}
