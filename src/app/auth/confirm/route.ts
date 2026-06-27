import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function normalizeNextPath(value: string | null) {
  return value && value.startsWith("/") ? value : "/dashboard";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = normalizeNextPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(next, requestUrl.origin);
  const loginUrl = new URL("/login", requestUrl.origin);
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectUrl);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });

    if (!error) return NextResponse.redirect(redirectUrl);
  }

  loginUrl.searchParams.set("error", "auth_confirm_failed");
  return NextResponse.redirect(loginUrl);
}
