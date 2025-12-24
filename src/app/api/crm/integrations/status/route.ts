// src/app/api/crm/integrations/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ProviderId = "google" | "outlook";

type IntegrationStatus = {
  calendar: Record<ProviderId, boolean>;
  email: Record<ProviderId, boolean>;
};

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // 1) Get access token from Authorization header (Bearer <jwt>)
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");

    const accessJwt =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

    if (!accessJwt) {
      // Not logged in (or caller didn't pass JWT). Return "all disconnected"
      const status: IntegrationStatus = {
        calendar: { google: false, outlook: false },
        email: { google: false, outlook: false },
      };
      return NextResponse.json(status, { status: 200 });
    }

    // 2) Resolve user from Supabase using that JWT
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessJwt);

    if (userError || !userData?.user) {
      const status: IntegrationStatus = {
        calendar: { google: false, outlook: false },
        email: { google: false, outlook: false },
      };
      return NextResponse.json(status, { status: 200 });
    }

    const userId = userData.user.id;

    // 3) Check DB for refresh_token
    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("user_google_calendar_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    // PGRST116 = no rows (not an error for us)
    if (tokenError && tokenError.code !== "PGRST116") {
      console.error("[status] tokenRow load error", tokenError);
    }

    const googleCalendarConnected = !!tokenRow?.refresh_token;

    const status: IntegrationStatus = {
      calendar: {
        google: googleCalendarConnected,
        outlook: false, // future
      },
      email: {
        google: false, // future
        outlook: false, // future
      },
    };

    return NextResponse.json(status, { status: 200 });
  } catch (err) {
    console.error("[status] unexpected error:", err);

    const status: IntegrationStatus = {
      calendar: { google: false, outlook: false },
      email: { google: false, outlook: false },
    };

    return NextResponse.json(status, { status: 200 });
  }
}
