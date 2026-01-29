// src/app/(app)/billing/invoices/[invoiceId]/page.tsx
import type { Metadata } from "next";
import InvoiceDetailClient from "../../../../../modules/billing/components/InvoiceDetailClient";

export const metadata: Metadata = {
  title: "Invoice",
  description: "View and manage a Stripe invoice.",
};

// ✅ Next typegen expects params to be Promise-like in this setup.
//    Promise.resolve(...) still works if Next passes a plain object at runtime.
type PageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params);
  const invoiceId = decodeURIComponent(String(resolved?.invoiceId ?? "")).trim();

  return <InvoiceDetailClient invoiceId={invoiceId} />;
}
