// src/app/(app)/billing/invoices/[invoiceId]/page.tsx
import type { Metadata } from "next";
import InvoiceDetailClient from "@/modules/billing/components/InvoiceDetailClient";

export const metadata: Metadata = {
  title: "Invoice",
  description: "View and manage a Stripe invoice.",
};

// ✅ In some Next versions/configs params can be async (Promise-like).
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
}) {
  // ✅ Works whether params is a Promise or a plain object.
  const resolved = await Promise.resolve(params);
  const invoiceId = resolved?.invoiceId ?? "";

  return <InvoiceDetailClient invoiceId={invoiceId} />;
}
