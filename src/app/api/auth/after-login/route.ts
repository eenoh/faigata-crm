import { handleAfterLogin } from "@/features/auth/server/after-login.handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAfterLogin(request);
}
