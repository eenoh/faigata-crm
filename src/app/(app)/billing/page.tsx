import type { Metadata } from "next";
import BillingClient from "@/modules/billing/components/BillingClient";

export const metadata: Metadata = {
  title: "Billing",
  description:
    "Manage Stripe billing: products, prices, invoices, payments, and customers.",
};

export default function BillingPage() {
  return <BillingClient />;
}
