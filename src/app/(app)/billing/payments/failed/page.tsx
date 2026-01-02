import type { Metadata } from "next";
import FailedPaymentsClient from "@/modules/billing/components/FailedPaymentsClient";

export const metadata: Metadata = {
  title: "Failed Payments",
  description: "Review failed or action-required payments.",
};

export default function FailedPaymentsPage() {
  return <FailedPaymentsClient />;
}
