import { handleStripeConnectRequest } from "@/features/integrations/stripe/server/connect.handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleStripeConnectRequest(request);
}
