import type { Metadata } from "next";
import BillingCustomersClient from "@/modules/billing/components/BillingCustomersClient";

export const metadata: Metadata = {
  title: "Customers",
  description:
    "View and manage Stripe customers. Link customers to leads to keep billing connected to your CRM.",
};

export default function BillingCustomersPage() {
  return <BillingCustomersClient />;
}
