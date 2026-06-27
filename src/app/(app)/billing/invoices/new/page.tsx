import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import NewInvoiceClient from "@/features/billing/components/NewInvoiceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BillingNewInvoicePage.metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function NewInvoicePage() {
  return <NewInvoiceClient />;
}
