import type { Metadata } from "next";
import PaymentsClient from "@/modules/billing/components/PaymentsClient";

export const metadata: Metadata = {
  title: "Payments",
  description: "Monitor incoming payments, pending transactions, and failures.",
};

export default function PaymentsPage() {
  return <PaymentsClient />;
}
