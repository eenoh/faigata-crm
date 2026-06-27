import { POST as postBookingLinkBook } from "@/features/crm/server/booking-link-book.handler";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug?: string | string[] }>;
};

export async function POST(request: Request, context: RouteContext) {
  return postBookingLinkBook(request, context);
}
