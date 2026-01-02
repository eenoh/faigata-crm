// src/app/(app)/billing/invoices/page.tsx
import type { Metadata } from "next";
import BillingInvoicesClient from "@/modules/billing/components/BillingInvoicesClient";

export const metadata: Metadata = {
  title: "Invoices",
  description: "View and manage Stripe invoices for your connected account.",
};

export default function BillingInvoicesPage() {
  return <BillingInvoicesClient />;
}
