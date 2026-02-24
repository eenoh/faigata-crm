// src/app/api/crm/integrations/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProviderId = "google" | "outlook";

type IntegrationStatus = {
  calendar: Record<ProviderId, boolean>;
  email: Record<ProviderId, boolean>;
};

export const runtime = "nodejs";

const DISCONNECTED: IntegrationStatus = {
  calendar: { google: false, outlook: false },
  email: { google: false, outlook: false },
};

function getBearer(req: NextRequest): string | null {
  const h =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

export async function GET(req: NextRequest) {
  const jwt = getBearer(req);
  if (!jwt) return NextResponse.json(DISCONNECTED, { status: 200 });

  const { data: userRes, error: userErr } =
    await supabaseAdmin.auth.getUser(jwt);
  const userId = userRes?.user?.id ?? null;
  if (userErr || !userId)
    return NextResponse.json(DISCONNECTED, { status: 200 });

  const { data: tokenRow } = await supabaseAdmin
    .from("user_google_calendar_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const googleCalendarConnected = Boolean((tokenRow as any)?.refresh_token);

  return NextResponse.json(
    {
      ...DISCONNECTED,
      calendar: { ...DISCONNECTED.calendar, google: googleCalendarConnected },
    },
    { status: 200 },
  );
}
