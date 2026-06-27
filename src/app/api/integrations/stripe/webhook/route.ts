import { handleStripeConnectedAccountWebhook } from "@/features/integrations/stripe/server/account-webhook.handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleStripeConnectedAccountWebhook(request);
}
