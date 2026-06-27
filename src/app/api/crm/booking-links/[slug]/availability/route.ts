import { GET as getBookingLinkAvailability } from "@/features/crm/server/booking-link-availability.handler";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug?: string | string[] }>;
};

export async function GET(request: Request, context: RouteContext) {
  return getBookingLinkAvailability(request as any, context);
}
