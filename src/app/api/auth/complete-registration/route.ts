import { handleCompleteRegistration } from "@/features/auth/server/complete-registration.handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCompleteRegistration(request);
}
