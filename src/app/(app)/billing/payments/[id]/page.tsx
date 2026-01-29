// src/app/(app)/billing/payments/[id]/page.tsx
import type { Metadata } from "next";
import PaymentDetailClient from "@/modules/billing/components/PaymentDetailClient";

export const metadata: Metadata = {
  title: "Payment Details • Billing",
  description: "Inspect a payment and trigger refunds.",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PaymentDetailPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params);
  const paymentIntentId = decodeURIComponent(String(resolved?.id ?? "")).trim();

  return <PaymentDetailClient paymentIntentId={paymentIntentId} />;
}
