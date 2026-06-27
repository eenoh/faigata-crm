import { handleStripePlatformWebhook } from "@/features/billing/server/platform-webhook.handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleStripePlatformWebhook(request);
}
