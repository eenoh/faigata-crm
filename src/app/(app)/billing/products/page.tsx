import type { Metadata } from "next";
import BillingProductsClient from "@/modules/billing/components/BillingProductsClient";

export const metadata: Metadata = {
  title: "Products",
  description: "Manage Stripe products and prices synced to your connected account.",
};

export default function BillingProductsPage() {
  return <BillingProductsClient />;
}
