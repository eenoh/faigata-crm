import { handleRegisterRequest } from "@/features/auth/server/register.handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRegisterRequest(request);
}
