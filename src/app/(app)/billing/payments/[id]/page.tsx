import type { Metadata } from "next";
import PaymentDetailClient from "@/modules/billing/components/PaymentDetailClient";

export const metadata: Metadata = {
  title: "Payment Details • Billing",
  description: "Inspect a payment and trigger refunds.",
};

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  return <PaymentDetailClient paymentIntentId={params.id} />;
}
