// src/app/api/crm/integrations/calendar/google/disconnect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // 1) Get access token from Authorization header (Bearer <jwt>)
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");

    const accessJwt =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;

    if (!accessJwt) {
      console.error("[disconnect] missing Authorization Bearer token");
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 2) Resolve user from Supabase using that JWT
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessJwt);

    if (userError || !userData?.user) {
      console.error("[disconnect] getUser error", userError);
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // 3) Load stored tokens from DB
    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("user_google_calendar_tokens")
      .select("access_token, refresh_token")
      .eq("user_id", userId)
      .single();

    if (tokenError && tokenError.code !== "PGRST116") {
      console.error("[disconnect] tokenRow load error", tokenError);
    }

    const accessToken = tokenRow?.access_token as string | undefined;
    const refreshToken = tokenRow?.refresh_token as string | undefined;

    // 4) Best-effort revoke at Google
    async function revokeToken(token: string, label: string) {
      try {
        const resp = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          console.error(
            `[disconnect] Google revoke failed for ${label}`,
            resp.status,
            text
          );
        }
      } catch (err) {
        console.error(`[disconnect] Google revoke error for ${label}`, err);
      }
    }

    if (accessToken) await revokeToken(accessToken, "access_token");
    if (refreshToken) await revokeToken(refreshToken, "refresh_token");

    // 5) Remove DB record
    const { error: deleteError } = await supabaseAdmin
      .from("user_google_calendar_tokens")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      console.error("[disconnect] delete error", deleteError);
    }

    // 6) Clear cookie so your /status route + UI show "disconnected"
    const res = NextResponse.json({ success: true });
    res.cookies.set("calendar_google_connected", "0", {
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch (err) {
    console.error("[disconnect] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
