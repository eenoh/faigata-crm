// src/app/(app)/billing/invoices/new/page.tsx
import type { Metadata } from "next";
import NewInvoiceClient from "@/modules/billing/components/NewInvoiceClient";

export const metadata: Metadata = {
  title: "New Invoice",
  description: "Create a new Stripe invoice for a customer.",
};

export default function NewInvoicePage() {
  return <NewInvoiceClient />;
}
