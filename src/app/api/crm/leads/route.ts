import {
  DELETE as deleteLead,
  GET as getLeads,
  PATCH as patchLead,
  POST as postLead,
} from "@/features/crm/server/leads.handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return postLead(request);
}

export async function GET(request: Request) {
  return getLeads(request);
}

export async function PATCH(request: Request) {
  return patchLead(request);
}

export async function DELETE(request: Request) {
  return deleteLead(request);
}
