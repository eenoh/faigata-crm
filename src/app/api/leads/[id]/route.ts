// PATCH /api/leads/:id?teamId=...
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const leadId = params.id;
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");

  if (!teamId) {
    return NextResponse.json(
      { error: "Missing teamId" },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const stage = body?.stage as string | undefined;

  if (!stage || typeof stage !== "string") {
    return NextResponse.json(
      { error: "stage is required" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .update({
      stage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("team_id", teamId);

  if (error) {
    console.error("[API] Failed to update lead stage", error);
    return NextResponse.json(
      { error: "Failed to update lead stage" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
