import {
  GET as getNiches,
  POST as postNiche,
  PUT as putNiches,
} from "@/features/crm/server/niches.handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return getNiches(request);
}

export async function POST(request: Request) {
  return postNiche(request);
}

export async function PUT(request: Request) {
  return putNiches(request);
}
