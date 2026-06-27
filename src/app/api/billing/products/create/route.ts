import {
  handleCreateBillingProduct,
  handleCreateBillingProductMethodNotAllowed,
} from "@/features/billing/server/products-create.handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handleCreateBillingProductMethodNotAllowed();
}

export async function POST(request: Request) {
  return handleCreateBillingProduct(request);
}
