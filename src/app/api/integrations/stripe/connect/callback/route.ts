import { handleStripeConnectCallback } from "@/features/integrations/stripe/server/connect.handlers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleStripeConnectCallback(request);
}
